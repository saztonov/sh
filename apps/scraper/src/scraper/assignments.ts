/**
 * Fetch the assignment list from Google Classroom "not turned in" page.
 * Ported from OLD/fetch_classroom.py collect_section_items() and parsing logic.
 */
import type { Page } from 'playwright';
import { SELECTORS, ALLOWED_SECTIONS } from './selectors.js';
import { cleanDueText } from '../parsers/due-date.js';
import { logger } from '../logger.js';

export interface RawAssignmentItem {
  title: string;
  courseName: string;
  dueRaw: string;
  classroomUrl: string;
  classroomId: string | null;
}

/**
 * Collect `li.MHxtic` items from currently expanded allowed sections via page.evaluate.
 */
async function collectSectionItems(page: Page): Promise<string[]> {
  return page.evaluate((allowedSections: string[]) => {
    const results: string[] = [];
    const sections = Array.from(document.querySelectorAll('div.ovsVve.jlxRme'));

    for (const sec of sections) {
      const text = sec.innerText || '';
      if (!allowedSections.some((s) => text.includes(s))) continue;
      if (sec.getAttribute('aria-expanded') !== 'true') continue;

      sec.querySelectorAll('li.MHxtic').forEach((item) => {
        const t = (item as HTMLElement).innerText.trim();
        if (t && !results.includes(t)) results.push(t);
      });
    }

    return results;
  }, [...ALLOWED_SECTIONS]);
}

/**
 * Extract links and their associated raw text from expanded assignment items.
 */
async function collectAssignmentLinks(page: Page): Promise<Map<string, string>> {
  const linkMap = new Map<string, string>();

  const items = await page.$$(SELECTORS.assignmentItem);
  for (const item of items) {
    const link = await item.$(SELECTORS.assignmentLink);
    if (!link) continue;

    const href = await link.getAttribute('href');
    const text = await item.innerText();

    if (href && text) {
      linkMap.set(text.trim(), href.startsWith('http') ? href : `https://classroom.google.com${href}`);
    }
  }

  return linkMap;
}

/**
 * Extract the classroom assignment ID from a URL.
 * URLs look like: https://classroom.google.com/c/COURSE_ID/a/ASSIGNMENT_ID/details
 * or: https://classroom.google.com/u/0/c/COURSE_ID/a/ASSIGNMENT_ID/details
 */
function extractClassroomId(url: string): string | null {
  const match = url.match(/\/a\/(\d+)\//);
  return match ? match[1] : null;
}

/**
 * Navigate to the assignment list page, expand relevant sections, and collect
 * all assignment items with their metadata.
 *
 * @param page - An authenticated Playwright page
 * @param courseNames - List of known course names for matching
 * @returns Array of raw assignment items
 */
export async function fetchAssignmentList(
  page: Page,
  courseNames: string[],
): Promise<RawAssignmentItem[]> {
  logger.info('Navigating to assignment list...');
  await page.goto('https://classroom.google.com/u/0/a/not-turned-in/all');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(4000);

  const allRawItems: string[] = [];

  // Collect items from already-expanded sections
  const alreadyOpen = await collectSectionItems(page);
  if (alreadyOpen.length > 0) {
    logger.info({ count: alreadyOpen.length }, 'Items in already-expanded sections');
    allRawItems.push(...alreadyOpen);
  }

  // Expand collapsed allowed sections and collect their items
  const sectionDivs = await page.$$(SELECTORS.sectionHeader);
  for (const div of sectionDivs) {
    try {
      const text = (await div.innerText()).trim();
      const expanded = await div.getAttribute('aria-expanded');
      const isNeeded = ALLOWED_SECTIONS.some((s) => text.includes(s));

      if (!isNeeded || expanded === 'true') continue;

      const btn = await div.$('button');
      if (!btn) continue;

      logger.info({ section: text.slice(0, 30) }, 'Expanding section');
      await btn.click();
      await page.waitForTimeout(1000);

      // Collect items while section is open
      const items = await collectSectionItems(page);
      const newItems = items.filter((i) => !allRawItems.includes(i));
      logger.info({ count: newItems.length }, 'New items from section');
      allRawItems.push(...newItems);
    } catch (err) {
      logger.error({ err }, 'Error expanding section');
    }
  }

  logger.info({ total: allRawItems.length }, 'Total raw items collected');

  // Collect links for URL extraction
  const linkMap = await collectAssignmentLinks(page);

  // Parse each raw item
  const assignments: RawAssignmentItem[] = [];

  for (const raw of allRawItems) {
    // Find the matching course name within the raw text
    const matchedCourse = courseNames.find((c) => raw.includes(c));
    if (!matchedCourse) {
      logger.debug({ raw: raw.slice(0, 60) }, 'No course match, skipping');
      continue;
    }

    const coursePos = raw.indexOf(matchedCourse);
    const title = raw.slice(0, coursePos).trim();
    const afterCourse = raw.slice(coursePos + matchedCourse.length).trim();
    const firstLine = afterCourse.split('\n')[0].trim();
    const dueRaw = cleanDueText(firstLine);

    if (!title) continue;

    // Try to find the URL from linkMap
    let classroomUrl = '';
    for (const [key, url] of linkMap) {
      if (key.includes(title) && key.includes(matchedCourse)) {
        classroomUrl = url;
        break;
      }
    }

    assignments.push({
      title,
      courseName: matchedCourse,
      dueRaw,
      classroomUrl,
      classroomId: classroomUrl ? extractClassroomId(classroomUrl) : null,
    });
  }

  logger.info({ count: assignments.length }, 'Parsed assignments from list');
  return assignments;
}
