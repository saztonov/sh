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
 * Collect assignment items (text + link) from currently expanded allowed sections
 * in a single page.evaluate pass. This ensures the text and href are always paired.
 */
async function collectItemsFromExpandedSections(
  page: Page,
): Promise<Array<{ text: string; href: string }>> {
  return page.evaluate((allowedSections: string[]) => {
    const results: Array<{ text: string; href: string }> = [];
    const seen = new Set<string>();
    const sections = Array.from(document.querySelectorAll('div.ovsVve.jlxRme'));

    for (const sec of sections) {
      const sectionText = (sec as HTMLElement).innerText || '';
      if (!allowedSections.some((s) => sectionText.includes(s))) continue;
      if (sec.getAttribute('aria-expanded') !== 'true') continue;

      const items = sec.querySelectorAll('li.MHxtic');
      for (const item of items) {
        const text = (item as HTMLElement).innerText.trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);

        // Extract the link from the same item
        const linkEl = item.querySelector('a.PsLuqe');
        let href = '';
        if (linkEl) {
          const rawHref = linkEl.getAttribute('href') || '';
          href = rawHref.startsWith('http')
            ? rawHref
            : rawHref
              ? `https://classroom.google.com${rawHref}`
              : '';
        }

        results.push({ text, href });
      }
    }

    return results;
  }, [...ALLOWED_SECTIONS]);
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
 * Extract the profile number from a Classroom URL.
 * e.g. "https://classroom.google.com/u/2/h" -> "2"
 */
export function extractProfileNumber(url: string): string {
  const match = url.match(/classroom\.google\.com\/u\/(\d+)/);
  return match ? match[1] : '0';
}

/**
 * Navigate to the assignment list page, expand relevant sections, and collect
 * all assignment items with their metadata.
 *
 * @param page - An authenticated Playwright page
 * @param courseNames - List of known course names for matching
 * @param profileNumber - Google account profile number (e.g. "0", "1")
 * @returns Array of raw assignment items
 */
export async function fetchAssignmentList(
  page: Page,
  courseNames: string[],
  profileNumber: string = '0',
): Promise<RawAssignmentItem[]> {
  const assignmentsUrl = `https://classroom.google.com/u/${profileNumber}/a/not-turned-in/all`;
  logger.info({ url: assignmentsUrl }, 'Navigating to assignment list...');
  await page.goto(assignmentsUrl);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(4000);

  const currentUrl = page.url();
  logger.info({ url: currentUrl }, 'Assignment list page loaded');

  const allItems: Array<{ text: string; href: string }> = [];

  // Step 1: Collect items from already-expanded sections
  const alreadyOpen = await collectItemsFromExpandedSections(page);
  if (alreadyOpen.length > 0) {
    logger.info({ count: alreadyOpen.length }, 'Items in already-expanded sections');
    allItems.push(...alreadyOpen);
  }

  // Step 2: Expand collapsed allowed sections and collect their items
  const sectionDivs = await page.$$(SELECTORS.sectionHeader);
  logger.info({ totalSections: sectionDivs.length }, 'Found section divs on page');

  for (const div of sectionDivs) {
    try {
      const text = (await div.innerText()).trim();
      const expanded = await div.getAttribute('aria-expanded');
      const isNeeded = ALLOWED_SECTIONS.some((s) => text.includes(s));

      logger.info(
        { section: text.slice(0, 40), expanded, isNeeded },
        'Section found',
      );

      if (!isNeeded || expanded === 'true') continue;

      // Try to find a button inside, otherwise click the div itself
      const btn = await div.$('button');
      if (btn) {
        logger.info({ section: text.slice(0, 30) }, 'Clicking button in section');
        await btn.click();
      } else {
        logger.info({ section: text.slice(0, 30) }, 'No button found, clicking section div');
        await div.click();
      }
      await page.waitForTimeout(1500);

      // Collect items from the newly expanded section
      const items = await collectItemsFromExpandedSections(page);
      const newItems = items.filter(
        (item) => !allItems.some((existing) => existing.text === item.text),
      );
      logger.info({ count: newItems.length, section: text.slice(0, 30) }, 'New items from expanded section');
      allItems.push(...newItems);
    } catch (err) {
      logger.error({ err }, 'Error expanding section');
    }
  }

  logger.info({ total: allItems.length }, 'Total raw items collected');

  // Step 3: Parse each raw item
  const assignments: RawAssignmentItem[] = [];

  for (const { text: raw, href } of allItems) {
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

    const classroomUrl = href;
    const classroomId = classroomUrl ? extractClassroomId(classroomUrl) : null;

    logger.info(
      { title: title.slice(0, 50), hasUrl: !!classroomUrl, classroomId },
      'Parsed assignment item',
    );

    assignments.push({
      title,
      courseName: matchedCourse,
      dueRaw,
      classroomUrl,
      classroomId,
    });
  }

  logger.info({ count: assignments.length }, 'Parsed assignments from list');
  return assignments;
}
