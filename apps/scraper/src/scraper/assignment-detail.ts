/**
 * Fetch detailed assignment information from an individual assignment page.
 *
 * Uses structural/text-based extraction instead of CSS class selectors,
 * because Google Classroom frequently changes its obfuscated class names.
 */
import type { Page } from 'playwright';
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
 * Navigate to an assignment detail page and extract all available information
 * using text-based heuristics instead of fragile CSS class selectors.
 */
export async function fetchAssignmentDetail(
  page: Page,
  url: string,
): Promise<AssignmentDetailData> {
  logger.info({ url }, 'Fetching assignment detail');

  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // Extract all data in a single page.evaluate() call for reliability
  const extracted = await page.evaluate(() => {
    // --- Helper: get visible text from an element, trimmed ---
    const text = (el: Element | null): string =>
      el ? (el as HTMLElement).innerText?.trim() ?? '' : '';

    // --- Title: look for the main assignment heading ---
    // Google Classroom has multiple h1 elements; the page header contains
    // the course name ("Класс > Course Name"), and the assignment title
    // is a separate heading further down in the main content area.
    let title = '';
    const allH1 = Array.from(document.querySelectorAll('h1'));
    // Skip h1 elements that contain "Класс" (page header with course name)
    for (const h of allH1) {
      const t = text(h);
      if (t && !t.startsWith('Класс')) {
        title = t;
        break;
      }
    }

    // --- Author + date: find element containing "•" (bullet separator) ---
    // Format: "Фамилия Имя • 25 февр."
    let author: string | null = null;
    let publishedDate: string | null = null;
    // Search within small text elements for the bullet pattern
    const allSmallText = Array.from(document.querySelectorAll('span, div, p'));
    for (const el of allSmallText) {
      const t = text(el);
      if (t.includes('\u2022') && t.length < 100) {
        // Ensure this is the leaf element (not a parent containing the bullet)
        const children = el.querySelectorAll('*');
        let isLeaf = true;
        for (const child of children) {
          if (text(child).includes('\u2022')) { isLeaf = false; break; }
        }
        if (!isLeaf) continue;

        const parts = t.split('\u2022').map((p) => p.trim());
        author = parts[0] || null;
        publishedDate = parts[1] || null;
        break;
      }
    }

    // --- Points: find element containing "балл" ---
    let points: number | null = null;
    for (const el of allSmallText) {
      const t = text(el);
      if (t.includes('балл') && t.length < 30) {
        const match = t.match(/(\d+)/);
        if (match) {
          points = parseInt(match[1], 10);
          break;
        }
      }
    }

    // --- Due date: find "Срок сдачи:" text ---
    let dueDate: string | null = null;
    for (const el of allSmallText) {
      const t = text(el);
      if (t.startsWith('Срок сдачи') && t.length < 60) {
        dueDate = t.replace(/^Срок сдачи:?\s*/, '').trim() || null;
        break;
      }
    }

    // --- Description: main content text between metadata and attachments ---
    // Strategy: find the assignment content container.
    // The description is typically in a div that contains paragraph-like text,
    // located after the author/points line and before attachments.
    let description: string | null = null;

    // Approach 1: Look for elements with dir="ltr" that contain substantial text
    const dirLtrEls = Array.from(document.querySelectorAll('[dir="ltr"]'));
    const descTexts: string[] = [];
    for (const el of dirLtrEls) {
      const t = text(el);
      // Skip short texts (buttons, labels) and skip attachment names
      if (t.length > 20 && !t.includes('балл') && !t.includes('\u2022')) {
        // Check this isn't inside an attachment container
        const inAttachment = el.closest('.QRiHXd') || el.closest('[data-drive-id]');
        if (!inAttachment) {
          descTexts.push(t);
        }
      }
    }

    if (descTexts.length > 0) {
      // Take the longest text — likely the full description
      description = descTexts.reduce((a, b) => a.length >= b.length ? a : b);
    }

    // Approach 2: If nothing found with dir="ltr", try contenteditable or data-placeholder
    if (!description) {
      const editables = Array.from(document.querySelectorAll('[contenteditable], [data-placeholder]'));
      for (const el of editables) {
        const t = text(el);
        if (t.length > 20) {
          description = t;
          break;
        }
      }
    }

    // --- Attachments ---
    const attachments: Array<{ name: string; url: string; type: string | null }> = [];

    // Strategy 1: Find .QRiHXd containers (this selector still works)
    const attachContainers = Array.from(document.querySelectorAll('.QRiHXd'));
    for (const container of attachContainers) {
      const linkEl = container.querySelector('a');
      if (!linkEl) continue;

      const href = linkEl.getAttribute('href') || '';
      if (!href) continue;

      const fullUrl = href.startsWith('http') ? href : `https://classroom.google.com${href}`;

      // Get attachment name: try aria-label first, then visible text
      let name = linkEl.getAttribute('aria-label') || '';
      if (!name) {
        // Take the first line of text in the container (usually the file name)
        const containerText = text(container);
        name = containerText.split('\n')[0]?.trim() || '';
      }
      if (!name) name = 'unnamed-attachment';

      let type: string | null = null;
      if (href.includes('docs.google.com')) type = 'google-doc';
      else if (href.includes('drive.google.com')) type = 'google-drive';
      else if (href.includes('youtube.com') || href.includes('youtu.be')) type = 'youtube';
      else {
        const extMatch = name.match(/\.(\w+)$/);
        if (extMatch) type = extMatch[1].toLowerCase();
      }

      attachments.push({ name, url: fullUrl, type });
    }

    // Strategy 2: If no .QRiHXd found, look for Drive/Docs links directly
    if (attachments.length === 0) {
      const driveLinks = Array.from(document.querySelectorAll(
        'a[href*="drive.google.com"], a[href*="docs.google.com"]',
      ));
      for (const link of driveLinks) {
        const href = link.getAttribute('href') || '';
        const name = link.getAttribute('aria-label') || text(link).split('\n')[0] || 'unnamed-attachment';
        let type: string | null = 'google-drive';
        if (href.includes('docs.google.com')) type = 'google-doc';

        attachments.push({
          name,
          url: href.startsWith('http') ? href : `https://classroom.google.com${href}`,
          type,
        });
      }
    }

    return { title, author, publishedDate, description, points, dueDate, attachments };
  });

  logger.info(
    {
      title: extracted.title,
      author: extracted.author,
      points: extracted.points,
      hasDescription: !!extracted.description,
      descriptionLength: extracted.description?.length ?? 0,
      attachmentCount: extracted.attachments.length,
    },
    'Fetched assignment detail',
  );

  return extracted;
}
