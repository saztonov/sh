/**
 * Eljur diary scraper — collects homework assignments from the diary pages.
 *
 * 1. Launch browser with saved Eljur session
 * 2. Detect user ID from the journal URL
 * 3. Navigate to diary pages for current week (week.0) and next week (week.-1)
 * 4. Parse each day: extract subject, homework text, attachments
 * 5. Create virtual courses for Eljur subjects
 * 6. Deduplicate and insert assignments
 * 7. Download attachments and upload to S3
 * 8. Update scrape_run with results
 */
import type { Page, ElementHandle } from 'playwright';
import { supabase } from '../db.js';
import { logger } from '../logger.js';
import { launchBrowser, saveBrowserState, closeBrowser } from './browser.js';
import { eljurBaseUrl, detectEljurUserId } from './eljur-browser.js';
import { downloadAndUploadAttachment } from './attachments.js';
import { ELJUR_SELECTORS, ELJUR_SKIP_TEXTS } from './eljur-selectors.js';
import { config } from '../config.js';
import { ScrapeLogger } from '../scrape-logger.js';

interface RawEljurHomework {
  subject: string;
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
  attachments: { url: string; name: string }[];
}

/**
 * Parse a day header like "Понедельник, 02.03" into a YYYY-MM-DD date string.
 * Uses the current year, with a simple heuristic for year boundary.
 */
function parseDayHeader(headerText: string): string | null {
  const match = headerText.match(/(\d{2})\.(\d{2})/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const now = new Date();
  let year = now.getFullYear();

  // If the parsed date is more than 6 months in the past, assume next year
  const candidate = new Date(year, month - 1, day);
  const diffMs = now.getTime() - candidate.getTime();
  if (diffMs > 180 * 24 * 60 * 60 * 1000) {
    year++;
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Parse a single lesson element and extract homework data.
 */
async function parseLesson(
  lessonEl: ElementHandle,
  date: string,
): Promise<RawEljurHomework | null> {
  try {
    // Extract subject name
    const subjectEl = await lessonEl.$(ELJUR_SELECTORS.lessonSubject);
    if (!subjectEl) return null;
    const subject = (await subjectEl.innerText()).trim();
    if (!subject) return null;

    // Check for homework
    const hometaskEl = await lessonEl.$(ELJUR_SELECTORS.lessonHometask);
    if (!hometaskEl) return null;

    // Extract all task texts from the hometask block
    const taskEls = await hometaskEl.$$(ELJUR_SELECTORS.lessonTask);
    if (taskEls.length === 0) return null;

    const taskTexts: string[] = [];
    for (const taskEl of taskEls) {
      // Get text content, stripping the icon <i> element
      const text = await taskEl.evaluate((el) => {
        // Clone to avoid modifying the page
        const clone = el.cloneNode(true) as HTMLElement;
        // Remove icon elements
        clone.querySelectorAll('i').forEach((i) => i.remove());
        return clone.textContent?.trim() ?? '';
      });

      if (text && !ELJUR_SKIP_TEXTS.has(text)) {
        taskTexts.push(text);
      }
    }

    if (taskTexts.length === 0) return null;

    const fullText = taskTexts.join('\n');

    // Extract attachments
    const attachments: { url: string; name: string }[] = [];
    const attachEls = await hometaskEl.$$(ELJUR_SELECTORS.attachmentLink);
    for (const attachEl of attachEls) {
      const url = await attachEl.getAttribute('href');
      // Try title attribute first, then span.button__title
      let name = await attachEl.getAttribute('title');
      if (!name) {
        const titleSpan = await attachEl.$(ELJUR_SELECTORS.attachmentTitle);
        if (titleSpan) {
          name = (await titleSpan.innerText()).trim();
        }
      }
      if (url && name) {
        attachments.push({ url, name });
      }
    }

    return {
      subject,
      date,
      title: fullText.length > 255 ? fullText.slice(0, 252) + '...' : fullText,
      description: fullText,
      attachments,
    };
  } catch (err) {
    logger.warn({ err }, 'Error parsing lesson element');
    return null;
  }
}

/**
 * Parse all homework from a single diary week page.
 */
async function parseEljurDiaryWeek(
  page: Page,
  userId: string,
  weekOffset: number,
): Promise<RawEljurHomework[]> {
  const baseUrl = eljurBaseUrl();
  const url = `${baseUrl}/journal-app/u.${userId}/week.${weekOffset}`;

  logger.info({ url, weekOffset }, 'Navigating to Eljur diary week page');

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  // Wait for diary content to appear
  try {
    await page.waitForSelector(ELJUR_SELECTORS.day, { timeout: 30_000 });
  } catch {
    logger.warn({ url }, 'No diary days found on page (timeout)');
    return [];
  }

  // Give time for dynamic content to load
  await page.waitForTimeout(2000);

  const dayElements = await page.$$(ELJUR_SELECTORS.day);
  logger.info({ dayCount: dayElements.length, weekOffset }, 'Found diary days');

  const allHomework: RawEljurHomework[] = [];

  for (const dayEl of dayElements) {
    // Extract date from day header
    const headerEl = await dayEl.$(ELJUR_SELECTORS.dayHeader);
    if (!headerEl) continue;

    const headerText = (await headerEl.innerText()).trim();
    const date = parseDayHeader(headerText);
    if (!date) {
      logger.warn({ headerText }, 'Could not parse date from day header');
      continue;
    }

    // Parse each lesson in this day
    const lessonElements = await dayEl.$$(ELJUR_SELECTORS.lesson);
    for (const lessonEl of lessonElements) {
      const homework = await parseLesson(lessonEl, date);
      if (homework) {
        allHomework.push(homework);
      }
    }
  }

  logger.info(
    { weekOffset, homeworkCount: allHomework.length },
    'Parsed homework from diary week',
  );

  return allHomework;
}

/**
 * Find or create a virtual Eljur course for a given subject.
 * Uses an in-memory cache to avoid repeated DB queries within one run.
 */
async function ensureEljurCourse(
  subject: string,
  courseCache: Map<string, string>,
): Promise<string | null> {
  // Check cache first
  const cached = courseCache.get(subject);
  if (cached) return cached;

  const classroomName = `[eljur] ${subject}`;

  // Check if course already exists in DB
  const { data: existing } = await supabase
    .from('courses')
    .select('id')
    .eq('classroom_name', classroomName)
    .single();

  if (existing) {
    courseCache.set(subject, existing.id as string);
    return existing.id as string;
  }

  // Create new virtual course
  const { data: inserted, error } = await supabase
    .from('courses')
    .insert({
      classroom_name: classroomName,
      subject,
      is_active: true,
    })
    .select('id')
    .single();

  if (error) {
    logger.error({ error, subject }, 'Failed to create Eljur virtual course');
    return null;
  }

  if (inserted) {
    courseCache.set(subject, inserted.id as string);
    logger.info({ subject, classroomName }, 'Created Eljur virtual course');
    return inserted.id as string;
  }

  return null;
}

/**
 * Main Eljur diary scrape function. Orchestrates the entire workflow.
 */
export async function runEljurDiaryScrape(runId?: string, parentLog?: ScrapeLogger): Promise<void> {
  // Create or update scrape_run record
  let scrapeRunId = runId;
  const isChild = !!parentLog;

  if (!scrapeRunId) {
    const { data: run, error: runError } = await supabase
      .from('scrape_runs')
      .insert({
        status: 'running',
        started_at: new Date().toISOString(),
        source: 'eljur',
      })
      .select('id')
      .single();

    if (runError || !run) {
      logger.error({ error: runError }, 'Failed to create scrape_run for Eljur diary');
      return;
    }
    scrapeRunId = run.id as string;
  } else if (!isChild) {
    await supabase
      .from('scrape_runs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', scrapeRunId);
  }

  logger.info({ scrapeRunId }, 'Starting Eljur diary scrape');
  const log = parentLog ?? new ScrapeLogger(scrapeRunId);

  let browser;
  try {
    // Launch browser with Eljur session
    log.info('browser_launch', 'Запуск браузера для Eljur');
    const launched = await launchBrowser(true, config.eljur.statePath);
    browser = launched.browser;
    const { context } = launched;
    const page = await context.newPage();

    // Check if session is valid by navigating to Eljur
    const baseUrl = eljurBaseUrl();
    log.info('session_check', 'Проверка сессии Eljur');
    await page.goto(baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    if (currentUrl.includes('/authorize')) {
      throw new Error('Сессия Элжур истекла. Обновите вход через кнопку "Войти в Элжур" в Настройках.');
    }
    log.info('session_check', 'Сессия Eljur валидна');

    // Detect user ID
    const userId = await detectEljurUserId(page);
    if (!userId) {
      throw new Error('Не удалось определить ID пользователя Элжур. Попробуйте войти заново.');
    }

    // Parse both weeks
    log.info('fetch_assignments', 'Парсинг дневника Eljur');
    const currentWeekHomework = await parseEljurDiaryWeek(page, userId, 0);
    const nextWeekHomework = await parseEljurDiaryWeek(page, userId, -1);
    const allHomework = [...currentWeekHomework, ...nextWeekHomework];
    log.info('fetch_assignments', 'Задания из дневника получены', { count: allHomework.length });

    const assignmentsFound = allHomework.length;
    let assignmentsNew = 0;
    const courseCache = new Map<string, string>();

    // Process each homework entry
    for (const hw of allHomework) {
      try {
        // Get or create virtual course
        const courseId = await ensureEljurCourse(hw.subject, courseCache);
        if (!courseId) {
          logger.warn({ subject: hw.subject }, 'No course ID for Eljur subject, skipping');
          continue;
        }

        // Deduplicate: check by course_id + title + due_date
        const { data: existing } = await supabase
          .from('assignments')
          .select('id')
          .eq('course_id', courseId)
          .eq('title', hw.title)
          .eq('due_date', hw.date)
          .limit(1)
          .maybeSingle();

        if (existing) {
          logger.debug(
            { title: hw.title, date: hw.date },
            'Eljur assignment already exists, skipping',
          );
          continue;
        }

        // Insert new assignment
        const { data: inserted, error: insertError } = await supabase
          .from('assignments')
          .insert({
            course_id: courseId,
            title: hw.title,
            description: hw.description,
            due_date: hw.date,
            source: 'eljur',
            status: 'not_turned_in',
            is_completed: false,
            scraped_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (insertError || !inserted) {
          logger.error(
            { error: insertError, title: hw.title },
            'Failed to insert Eljur assignment',
          );
          continue;
        }

        const assignmentId = inserted.id as string;
        assignmentsNew++;

        // Download and upload attachments
        for (const attachment of hw.attachments) {
          try {
            // Check if attachment already exists
            const { data: existingAttach } = await supabase
              .from('attachments')
              .select('id')
              .eq('assignment_id', assignmentId)
              .eq('original_name', attachment.name)
              .limit(1)
              .maybeSingle();

            if (existingAttach) continue;

            const result = await downloadAndUploadAttachment(
              page,
              attachment.url,
              assignmentId,
              attachment.name,
            );

            if (result) {
              await supabase.from('attachments').insert({
                assignment_id: assignmentId,
                original_name: attachment.name,
                mime_type: result.mimeType,
                size_bytes: result.sizeBytes,
                s3_key: result.s3Key,
                s3_url: result.s3Url,
                classroom_url: attachment.url,
              });
            }
          } catch (attachErr) {
            logger.warn(
              { err: attachErr, name: attachment.name },
              'Failed to process Eljur attachment',
            );
          }
        }

        logger.info(
          {
            title: hw.title,
            subject: hw.subject,
            date: hw.date,
            attachments: hw.attachments.length,
          },
          'Processed new Eljur assignment',
        );
      } catch (hwErr) {
        logger.error(
          { err: hwErr, title: hw.title },
          'Error processing Eljur homework — continuing with next',
        );
      }
    }

    // Save browser state
    await saveBrowserState(context, config.eljur.statePath);

    log.info('finish', 'Eljur сбор завершён', { assignmentsFound, assignmentsNew });

    // Update scrape_run (skip status update if called from scrape_all)
    if (!isChild) {
      await supabase
        .from('scrape_runs')
        .update({
          status: 'success',
          finished_at: new Date().toISOString(),
          assignments_found: assignmentsFound,
          assignments_new: assignmentsNew,
        })
        .eq('id', scrapeRunId);
    } else {
      // In child mode, accumulate counts
      const { data: current } = await supabase
        .from('scrape_runs')
        .select('assignments_found, assignments_new')
        .eq('id', scrapeRunId)
        .single();
      await supabase
        .from('scrape_runs')
        .update({
          assignments_found: (current?.assignments_found ?? 0) + assignmentsFound,
          assignments_new: (current?.assignments_new ?? 0) + assignmentsNew,
        })
        .eq('id', scrapeRunId);
    }

    logger.info(
      { assignmentsFound, assignmentsNew, scrapeRunId },
      'Eljur diary scrape completed successfully',
    );

    await closeBrowser(browser);
    if (!parentLog) await log.flush();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, scrapeRunId }, 'Eljur diary scrape failed');
    log.error('finish', `Eljur ошибка: ${errorMessage}`);

    if (!isChild) {
      await supabase
        .from('scrape_runs')
        .update({
          status: 'error',
          finished_at: new Date().toISOString(),
          error_message: errorMessage,
        })
        .eq('id', scrapeRunId);
    }

    if (browser) {
      await closeBrowser(browser);
    }
    if (!parentLog) await log.flush();
    if (isChild) throw err;
  }
}
