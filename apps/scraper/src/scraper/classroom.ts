/**
 * Main orchestrator for the Google Classroom scraping workflow.
 *
 * 1. Create a scrape_run record (status: 'running')
 * 2. Launch browser with saved session
 * 3. Fetch course list from homepage sidebar, upsert into courses table
 * 4. Resolve subjects for new courses using course_mappings
 * 5. Navigate to assignment list, fetch all assignments
 * 6. For each assignment:
 *    a. Check if already exists in DB (by classroom_id)
 *    b. If new or needs refresh: navigate to detail page, extract details
 *    c. Download new attachments -> S3
 *    d. Upsert assignment + attachments into DB
 * 7. Update scrape_run (status: 'success', counts)
 * 8. On error: update scrape_run (status: 'error', error_message)
 * 9. Close browser
 */
import type { Page } from 'playwright';
import type { CourseMapping } from '@homework/shared';
import { supabase } from '../db.js';
import { logger } from '../logger.js';
import { launchBrowser, saveBrowserState, closeBrowser } from './browser.js';
import { SELECTORS, EXCLUDED_TITLES } from './selectors.js';
import { fetchAssignmentList, extractProfileNumber } from './assignments.js';
import { fetchAssignmentDetail } from './assignment-detail.js';
import { downloadAndUploadAttachment } from './attachments.js';
import { resolveSubject } from '../parsers/course-name.js';
import { parseDueDate } from '../parsers/due-date.js';
import { ScrapeLogger } from '../scrape-logger.js';

interface ScrapeResult {
  assignmentsFound: number;
  assignmentsNew: number;
}

/**
 * Fetch course cards from the Google Classroom homepage.
 * Returns the list of course names and the detected profile number.
 */
async function fetchCourses(page: Page): Promise<{ courseNames: string[]; profileNumber: string }> {
  logger.info('Navigating to Google Classroom homepage...');
  await page.goto('https://classroom.google.com', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  await page.waitForTimeout(3000);

  // Check if we're on a login page (not authenticated)
  const url = page.url();
  logger.info({ url }, 'Homepage URL after navigation');

  if (url.includes('accounts.google.com') || !url.includes('classroom.google.com')) {
    throw new Error('No valid Google Classroom session. Use "Войти в Google Classroom" button in Settings to capture a session first.');
  }

  // Detect profile number from URL (e.g. /u/0/, /u/1/, etc.)
  const profileNumber = extractProfileNumber(url);
  logger.info({ profileNumber }, 'Detected Google profile number');

  const courseCards = await page.$$(SELECTORS.courseCard);
  const seen = new Set<string>();
  const courseNames: string[] = [];

  for (const card of courseCards) {
    const title = (await card.innerText()).trim();
    if (title && !EXCLUDED_TITLES.has(title) && !seen.has(title)) {
      seen.add(title);
      courseNames.push(title);
    }
  }

  logger.info({ count: courseNames.length, courses: courseNames }, 'Found courses on homepage');
  return { courseNames, profileNumber };
}

/**
 * Upsert courses into the database and return the course ID map.
 */
async function upsertCourses(
  courseNames: string[],
  mappings: CourseMapping[],
): Promise<Map<string, string>> {
  const courseIdMap = new Map<string, string>();

  for (const name of courseNames) {
    // Check if course already exists
    const { data: existing } = await supabase
      .from('courses')
      .select('id, subject')
      .eq('classroom_name', name)
      .single();

    if (existing) {
      courseIdMap.set(name, existing.id as string);

      // If course has no subject yet, try to resolve it
      if (!existing.subject) {
        const subject = resolveSubject(name, mappings);
        if (subject !== null) {
          await supabase
            .from('courses')
            .update({ subject })
            .eq('id', existing.id);
          logger.info({ course: name, subject }, 'Resolved subject for existing course');
        }
      }
    } else {
      // Insert new course
      const subject = resolveSubject(name, mappings);
      const { data: inserted, error } = await supabase
        .from('courses')
        .insert({
          classroom_name: name,
          subject,
          is_active: true,
        })
        .select('id')
        .single();

      if (error) {
        logger.error({ error, course: name }, 'Failed to insert course');
        continue;
      }

      if (inserted) {
        courseIdMap.set(name, inserted.id as string);
        logger.info({ course: name, subject }, 'Inserted new course');
      }
    }
  }

  return courseIdMap;
}

/**
 * Main scrape function. Orchestrates the entire scraping workflow.
 */
export async function runScrape(runId?: string, parentLog?: ScrapeLogger): Promise<void> {
  // Create or update scrape_run record
  let scrapeRunId = runId;
  const isChild = !!parentLog;

  if (!scrapeRunId) {
    const { data: run, error: runError } = await supabase
      .from('scrape_runs')
      .insert({ status: 'running', started_at: new Date().toISOString() })
      .select('id')
      .single();

    if (runError || !run) {
      logger.error({ error: runError }, 'Failed to create scrape_run');
      return;
    }
    scrapeRunId = run.id as string;
  } else {
    await supabase
      .from('scrape_runs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', scrapeRunId);
  }

  logger.info({ scrapeRunId }, 'Starting scrape run');
  const log = parentLog ?? new ScrapeLogger(scrapeRunId);

  let browser;
  try {
    // Load course mappings from DB
    const { data: mappings } = await supabase
      .from('course_mappings')
      .select('*')
      .order('priority', { ascending: false });

    const courseMappings = (mappings ?? []) as CourseMapping[];

    // Launch browser
    log.info('browser_launch', 'Запуск браузера для Google Classroom');
    const launched = await launchBrowser();
    browser = launched.browser;
    const { context } = launched;
    const page = await context.newPage();

    // Step 1: Fetch and upsert courses
    log.info('navigate', 'Переход на Google Classroom');
    const { courseNames, profileNumber } = await fetchCourses(page);
    log.info('fetch_courses', 'Курсы получены', { count: courseNames.length });
    const courseIdMap = await upsertCourses(courseNames, courseMappings);

    // Step 2: Fetch assignment list
    log.info('fetch_assignments', 'Получение списка заданий');
    const rawAssignments = await fetchAssignmentList(page, courseNames, profileNumber);
    log.info('fetch_assignments', 'Список заданий получен', { count: rawAssignments.length });

    let assignmentsFound = rawAssignments.length;
    let assignmentsNew = 0;

    // Step 3: Process each assignment
    for (const raw of rawAssignments) {
      try {
        const courseId = courseIdMap.get(raw.courseName);
        if (!courseId) {
          logger.warn({ course: raw.courseName }, 'No course ID found, skipping assignment');
          continue;
        }

        // Check if assignment already exists — two-level dedup:
        // 1) By classroom_id (if available)
        // 2) Fallback by course_id + title (always, if step 1 found nothing)
        type ExistingRow = { id: string; description: string | null } | null;
        let existingAssignment: ExistingRow = null;

        if (raw.classroomId) {
          const { data } = await supabase
            .from('assignments')
            .select('id, description')
            .eq('classroom_id', raw.classroomId)
            .limit(1)
            .maybeSingle();
          existingAssignment = data as ExistingRow;
        }

        // Fallback: check by course_id + title (handles old records with null classroom_id)
        if (!existingAssignment) {
          const { data } = await supabase
            .from('assignments')
            .select('id, description')
            .eq('course_id', courseId)
            .eq('title', raw.title)
            .limit(1)
            .maybeSingle();
          existingAssignment = data as ExistingRow;
        }

        // If assignment exists and already has details — skip entirely
        if (existingAssignment && existingAssignment.description !== null) {
          logger.info(
            { title: raw.title, classroomId: raw.classroomId },
            'Assignment already exists with details, skipping',
          );
          continue;
        }

        // Determine if this is an update of an incomplete record or a new insert
        const isUpdate = existingAssignment !== null;
        const existingId = existingAssignment?.id;

        if (isUpdate) {
          logger.info(
            { title: raw.title, id: existingId },
            'Updating incomplete assignment (no description)',
          );
        }

        // Fetch detail page
        let detail = null;
        if (raw.classroomUrl) {
          log.info('fetch_detail', `Детали задания: ${raw.title}`, { url: raw.classroomUrl });
          try {
            detail = await fetchAssignmentDetail(page, raw.classroomUrl);
            logger.info(
              {
                title: raw.title,
                hasDescription: !!detail.description,
                descriptionLength: detail.description?.length ?? 0,
                attachmentCount: detail.attachments.length,
                author: detail.author,
              },
              'Fetched assignment detail successfully',
            );
          } catch (detailErr) {
            logger.warn(
              { err: detailErr, url: raw.classroomUrl },
              'Failed to fetch assignment detail, using list data',
            );
          }
        } else {
          logger.warn(
            { title: raw.title },
            'No classroom URL for assignment, skipping detail page',
          );
        }

        // Parse due date
        const dueRaw = detail?.dueDate ?? raw.dueRaw;
        const dueDate = parseDueDate(dueRaw);

        let assignmentId: string;

        if (isUpdate && existingId) {
          // Update existing incomplete assignment with details
          const { error: updateError } = await supabase
            .from('assignments')
            .update({
              classroom_id: raw.classroomId || undefined,
              classroom_url: raw.classroomUrl || undefined,
              title: raw.title,
              description: detail?.description ?? null,
              author: detail?.author ?? null,
              points: detail?.points ?? null,
              due_date: dueDate,
              due_raw: dueRaw,
              source: 'google',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingId);

          if (updateError) {
            logger.error(
              { error: updateError, title: raw.title },
              'Failed to update assignment',
            );
            continue;
          }
          assignmentId = existingId;
        } else {
          // Insert new assignment
          const { data: inserted, error: insertError } = await supabase
            .from('assignments')
            .insert({
              course_id: courseId,
              classroom_id: raw.classroomId,
              classroom_url: raw.classroomUrl || null,
              title: raw.title,
              description: detail?.description ?? null,
              author: detail?.author ?? null,
              points: detail?.points ?? null,
              due_date: dueDate,
              due_raw: dueRaw,
              source: 'google',
              status: 'not_turned_in',
              is_completed: false,
              scraped_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (insertError || !inserted) {
            logger.error(
              { error: insertError, title: raw.title },
              'Failed to insert assignment',
            );
            continue;
          }
          assignmentId = inserted.id as string;
          assignmentsNew++;
        }

        // Download and upload attachments
        if (detail?.attachments && detail.attachments.length > 0) {
          log.info('download_attachment', `Скачивание вложений: ${detail.attachments.length}`, { title: raw.title });
          for (const attachment of detail.attachments) {
            try {
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
                'Failed to process attachment',
              );
            }
          }
        }

        logger.info(
          {
            title: raw.title,
            classroomId: raw.classroomId,
            attachments: detail?.attachments?.length ?? 0,
            dueDate,
            isUpdate,
          },
          isUpdate ? 'Updated assignment with details' : 'Processed new assignment',
        );
      } catch (assignmentErr) {
        logger.error(
          { err: assignmentErr, title: raw.title },
          'Error processing assignment -- continuing with next',
        );
      }
    }

    // Save browser state for next run
    await saveBrowserState(context);

    log.info('finish', 'Google Classroom сбор завершён', { assignmentsFound, assignmentsNew });

    // Update scrape_run with success (skip if called from scrape_all)
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
      // In child mode, update counts only (scrape_all will set final status)
      await supabase
        .from('scrape_runs')
        .update({
          assignments_found: assignmentsFound,
          assignments_new: assignmentsNew,
        })
        .eq('id', scrapeRunId);
    }

    logger.info(
      { assignmentsFound, assignmentsNew, scrapeRunId },
      'Scrape run completed successfully',
    );

    await closeBrowser(browser);
    if (!parentLog) await log.flush();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, scrapeRunId }, 'Scrape run failed');
    log.error('finish', `Google Classroom ошибка: ${errorMessage}`);

    // Update scrape_run with error (skip if called from scrape_all)
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

    // Make sure browser is closed on error
    if (browser) {
      await closeBrowser(browser);
    }
    if (!parentLog) await log.flush();
    if (isChild) throw err;
  }
}
