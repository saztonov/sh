/**
 * Fetch detailed assignment information from an individual assignment page.
 */
import type { Page } from 'playwright';
import { SELECTORS } from './selectors.js';
import { logger } from '../logger.js';

export interface AssignmentDetailData {
  title: string;
  author: string | null;
  publishedDate: string | null;
  description: string | null;
  points: number | null;
  dueDate: string | null;
  attachments: AttachmentData[];
}

export interface AttachmentData {
  name: string;
  url: string;
  type: string | null;
}

/**
 * Navigate to an assignment detail page and extract all available information.
 *
 * @param page - An authenticated Playwright page
 * @param url  - The full URL of the assignment detail page
 * @returns Parsed assignment detail data
 */
export async function fetchAssignmentDetail(
  page: Page,
  url: string,
): Promise<AssignmentDetailData> {
  logger.info({ url }, 'Fetching assignment detail');

  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // DOM diagnostic: log key elements to help identify correct selectors
  const domDiag = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((el, i) => ({
      tag: el.tagName,
      index: i,
      className: el.className.slice(0, 60),
      text: (el as HTMLElement).innerText.trim().slice(0, 80),
    }));

    // Look for elements that might contain description text
    const descCandidates = Array.from(document.querySelectorAll('[data-placeholder], [contenteditable], .oBSRLe, [dir="ltr"]'))
      .filter((el) => (el as HTMLElement).innerText?.trim())
      .slice(0, 5)
      .map((el) => ({
        tag: el.tagName,
        className: el.className.slice(0, 60),
        text: (el as HTMLElement).innerText.trim().slice(0, 100),
      }));

    // Attachment container candidates
    const attachCandidates = Array.from(document.querySelectorAll('.QRiHXd, [data-drive-id], a[href*="drive.google.com"], a[href*="docs.google.com"]'))
      .slice(0, 5)
      .map((el) => ({
        tag: el.tagName,
        className: el.className.slice(0, 60),
        href: el.getAttribute('href')?.slice(0, 80) ?? null,
        text: (el as HTMLElement).innerText?.trim().slice(0, 60) ?? '',
        ariaLabel: el.getAttribute('aria-label')?.slice(0, 60) ?? null,
      }));

    return { headings, descCandidates, attachCandidates };
  });

  logger.info({ domDiag }, 'DOM diagnostic for assignment detail page');

  // Title
  const titleEl = await page.$(SELECTORS.detailTitle);
  const title = titleEl ? (await titleEl.innerText()).trim() : '';

  // Author and date from "Author . Date" line
  let author: string | null = null;
  let publishedDate: string | null = null;

  const authorDateEl = await page.$(SELECTORS.detailAuthorDate);
  if (authorDateEl) {
    const authorDateText = (await authorDateEl.innerText()).trim();
    // Format: "Фамилия Имя . 25 фев."
    const parts = authorDateText.split('\u2022').map((p) => p.trim());
    if (parts.length >= 1) {
      author = parts[0] || null;
    }
    if (parts.length >= 2) {
      publishedDate = parts[1] || null;
    }
  }

  // Points
  let points: number | null = null;
  const pointsEl = await page.$(SELECTORS.detailPoints);
  if (pointsEl) {
    const pointsText = (await pointsEl.innerText()).trim();
    const pointsMatch = pointsText.match(/(\d+)/);
    if (pointsMatch) {
      points = parseInt(pointsMatch[1], 10);
    }
  }

  // Due date (raw text from the detail page)
  let dueDate: string | null = null;
  const dueDateEl = await page.$(SELECTORS.detailDueDate);
  if (dueDateEl) {
    dueDate = (await dueDateEl.innerText()).trim() || null;
  }

  // Description
  let description: string | null = null;
  const descEl = await page.$(SELECTORS.detailDescription);
  if (descEl) {
    description = (await descEl.innerText()).trim() || null;
  }

  // Attachments
  const attachments: AttachmentData[] = [];
  const attachmentEls = await page.$$(SELECTORS.detailAttachment);

  for (const attachmentEl of attachmentEls) {
    try {
      const linkEl = await attachmentEl.$('a');
      const nameEl = await attachmentEl.$(SELECTORS.detailAttachmentName.replace('.QRiHXd ', ''));

      const attachUrl = linkEl ? await linkEl.getAttribute('href') : null;
      const attachName = nameEl
        ? (await nameEl.innerText()).trim()
        : 'unnamed-attachment';

      if (attachUrl) {
        // Attempt to determine type from URL or filename
        let type: string | null = null;
        if (attachUrl.includes('docs.google.com')) type = 'google-doc';
        else if (attachUrl.includes('drive.google.com')) type = 'google-drive';
        else if (attachUrl.includes('youtube.com') || attachUrl.includes('youtu.be')) type = 'youtube';
        else {
          const extMatch = attachName.match(/\.(\w+)$/);
          if (extMatch) type = extMatch[1].toLowerCase();
        }

        attachments.push({
          name: attachName,
          url: attachUrl.startsWith('http') ? attachUrl : `https://classroom.google.com${attachUrl}`,
          type,
        });
      }
    } catch (err) {
      logger.warn({ err }, 'Error extracting attachment');
    }
  }

  logger.info(
    { title, attachmentCount: attachments.length },
    'Fetched assignment detail',
  );

  return {
    title,
    author,
    publishedDate,
    description,
    points,
    dueDate,
    attachments,
  };
}
