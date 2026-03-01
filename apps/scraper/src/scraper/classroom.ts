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
import { fetchAssignmentList } from './assignments.js';
import { fetchAssignmentDetail } from './assignment-detail.js';
import { downloadAndUploadAttachment } from './attachments.js';
import { resolveSubject } from '../parsers/course-name.js';
import { parseDueDate } from '../parsers/due-date.js';

interface ScrapeResult {
  assignmentsFound: number;
  assignmentsNew: number;
}

/**
 * Fetch course cards from the Google Classroom homepage.
 */
async function fetchCourses(page: Page): Promise<string[]> {
  logger.info('Navigating to Google Classroom homepage...');
  await page.goto('https://classroom.google.com/u/0/h');
  await page.waitForLoadState('domcontentloaded');

  await page.waitForTimeout(3000);

  // Check if we're on a login page (URL redirect or Sign-in button on classroom.google.com)
  const isLoginUrl = page.url().includes('accounts.google.com');
  const courseCards = await page.$$(SELECTORS.courseCard);

  if (isLoginUrl || courseCards.length === 0) {
    throw new Error('No valid Google Classroom session. Use "Войти в Google Classroom" button in Settings to capture a session first.');
  }
  const seen = new Set<string>();
  const courseNames: string[] = [];

  for (const card of courseCards) {
    const title = (await card.innerText()).trim();
    if (title && !EXCLUDED_TITLES.has(title) && !seen.has(title)) {
      seen.add(title);
      courseNames.push(title);
    }
  }

  logger.info({ count: courseNames.length }, 'Found courses on homepage');
  return courseNames;
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
export async function runScrape(runId?: string): Promise<void> {
  // Create or update scrape_run record
  let scrapeRunId = runId;

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

  let browser;
  try {
    // Load course mappings from DB
    const { data: mappings } = await supabase
      .from('course_mappings')
      .select('*')
      .order('priority', { ascending: false });

    const courseMappings = (mappings ?? []) as CourseMapping[];

    // Launch browser
    const launched = await launchBrowser();
    browser = launched.browser;
    const { context } = launched;
    const page = await context.newPage();

    // Step 1: Fetch and upsert courses
    const courseNames = await fetchCourses(page);
    const courseIdMap = await upsertCourses(courseNames, courseMappings);

    // Step 2: Fetch assignment list
    const rawAssignments = await fetchAssignmentList(page, courseNames);

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

        // Check if assignment already exists
        let existingAssignment: { id: string } | null = null;

        if (raw.classroomId) {
          const { data } = await supabase
            .from('assignments')
            .select('id')
            .eq('classroom_id', raw.classroomId)
            .single();
          existingAssignment = data as { id: string } | null;
        }

        if (existingAssignment) {
          logger.debug(
            { title: raw.title, classroomId: raw.classroomId },
            'Assignment already exists, skipping',
          );
          continue;
        }

        // Fetch detail page for new assignments
        let detail = null;
        if (raw.classroomUrl) {
          try {
            detail = await fetchAssignmentDetail(page, raw.classroomUrl);
          } catch (detailErr) {
            logger.warn(
              { err: detailErr, url: raw.classroomUrl },
              'Failed to fetch assignment detail, using list data',
            );
          }
        }

        // Parse due date
        const dueRaw = detail?.dueDate ?? raw.dueRaw;
        const dueDate = parseDueDate(dueRaw);

        // Insert assignment
        const { data: inserted, error: insertError } = await supabase
          .from('assignments')
          .insert({
            course_id: courseId,
            classroom_id: raw.classroomId,
            classroom_url: raw.classroomUrl || null,
            title: detail?.title || raw.title,
            description: detail?.description ?? null,
            author: detail?.author ?? null,
            points: detail?.points ?? null,
            due_date: dueDate,
            due_raw: dueRaw,
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

        const assignmentId = inserted.id as string;
        assignmentsNew++;

        // Download and upload attachments
        if (detail?.attachments && detail.attachments.length > 0) {
          for (const attachment of detail.attachments) {
            try {
              const result = await downloadAndUploadAttachment(
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
          { title: raw.title, classroomId: raw.classroomId },
          'Processed new assignment',
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

    // Update scrape_run with success
    await supabase
      .from('scrape_runs')
      .update({
        status: 'success',
        finished_at: new Date().toISOString(),
        assignments_found: assignmentsFound,
        assignments_new: assignmentsNew,
      })
      .eq('id', scrapeRunId);

    logger.info(
      { assignmentsFound, assignmentsNew, scrapeRunId },
      'Scrape run completed successfully',
    );

    await closeBrowser(browser);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, scrapeRunId }, 'Scrape run failed');

    // Update scrape_run with error
    await supabase
      .from('scrape_runs')
      .update({
        status: 'error',
        finished_at: new Date().toISOString(),
        error_message: errorMessage,
      })
      .eq('id', scrapeRunId);

    // Make sure browser is closed on error
    if (browser) {
      await closeBrowser(browser);
    }
  }
}
