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

/** Get trimmed innerText from an element (used outside page.evaluate) */
function elText(el: { innerText: () => Promise<string> } | null): Promise<string> {
  return el ? el.innerText().then((t: string) => t.trim()) : Promise.resolve('');
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

  // Extract all data in a single page.evaluate() call for reliability.
  // IMPORTANT: Do NOT declare named functions/consts with arrow functions
  // inside page.evaluate — esbuild injects __name() calls that don't exist
  // in the browser context, causing ReferenceError.
  const extracted = await page.evaluate(() => {
    // Helper: inline getter (not a named const to avoid __name injection)
    function gt(el: Element | null): string {
      return el ? (el as HTMLElement).innerText?.trim() ?? '' : '';
    }

    // --- Title ---
    let title = '';
    const allH1 = document.querySelectorAll('h1');
    for (let i = 0; i < allH1.length; i++) {
      const t = gt(allH1[i]);
      if (t && !t.startsWith('Класс')) {
        title = t;
        break;
      }
    }

    // --- Author + date: "Фамилия Имя • 25 февр." ---
    let author: string | null = null;
    let publishedDate: string | null = null;
    const allEls = document.querySelectorAll('span, div, p');
    for (let i = 0; i < allEls.length; i++) {
      const t = gt(allEls[i]);
      if (t.includes('\u2022') && t.length < 100) {
        // Check this is a leaf element
        let isLeaf = true;
        const ch = allEls[i].querySelectorAll('*');
        for (let j = 0; j < ch.length; j++) {
          if (gt(ch[j]).includes('\u2022')) { isLeaf = false; break; }
        }
        if (!isLeaf) continue;

        const parts = t.split('\u2022');
        author = parts[0]?.trim() || null;
        publishedDate = parts[1]?.trim() || null;
        break;
      }
    }

    // --- Points: "5 баллов" ---
    let points: number | null = null;
    for (let i = 0; i < allEls.length; i++) {
      const t = gt(allEls[i]);
      if (t.includes('балл') && t.length < 30) {
        const m = t.match(/(\d+)/);
        if (m) { points = parseInt(m[1], 10); break; }
      }
    }

    // --- Due date: "Срок сдачи: Сегодня" ---
    let dueDate: string | null = null;
    for (let i = 0; i < allEls.length; i++) {
      const t = gt(allEls[i]);
      if (t.startsWith('Срок сдачи') && t.length < 60) {
        dueDate = t.replace(/^Срок сдачи:?\s*/, '').trim() || null;
        break;
      }
    }

    // --- Description ---
    let description: string | null = null;
    const dirLtrEls = document.querySelectorAll('[dir="ltr"]');
    const descTexts: string[] = [];
    for (let i = 0; i < dirLtrEls.length; i++) {
      const t = gt(dirLtrEls[i]);
      if (t.length > 20 && !t.includes('балл') && !t.includes('\u2022')) {
        const inAttach = dirLtrEls[i].closest('.QRiHXd') || dirLtrEls[i].closest('[data-drive-id]');
        if (!inAttach) { descTexts.push(t); }
      }
    }
    if (descTexts.length > 0) {
      description = descTexts.reduce(function (a, b) { return a.length >= b.length ? a : b; });
    }
    if (!description) {
      const editables = document.querySelectorAll('[contenteditable], [data-placeholder]');
      for (let i = 0; i < editables.length; i++) {
        const t = gt(editables[i]);
        if (t.length > 20) { description = t; break; }
      }
    }

    // --- Attachments ---
    const attachments: Array<{ name: string; url: string; type: string | null }> = [];
    const containers = document.querySelectorAll('.QRiHXd');
    for (let i = 0; i < containers.length; i++) {
      const linkEl = containers[i].querySelector('a');
      if (!linkEl) continue;
      const href = linkEl.getAttribute('href') || '';
      if (!href) continue;

      const fullUrl = href.startsWith('http') ? href : 'https://classroom.google.com' + href;
      let name = linkEl.getAttribute('aria-label') || '';
      if (!name) {
        const ct = gt(containers[i]);
        name = ct.split('\n')[0]?.trim() || '';
      }
      if (!name) name = 'unnamed-attachment';

      let type: string | null = null;
      if (href.includes('docs.google.com')) type = 'google-doc';
      else if (href.includes('drive.google.com')) type = 'google-drive';
      else if (href.includes('youtube.com') || href.includes('youtu.be')) type = 'youtube';
      else {
        const extM = name.match(/\.(\w+)$/);
        if (extM) type = extM[1].toLowerCase();
      }
      attachments.push({ name: name, url: fullUrl, type: type });
    }

    // Fallback: direct Drive/Docs links
    if (attachments.length === 0) {
      const driveLinks = document.querySelectorAll('a[href*="drive.google.com"], a[href*="docs.google.com"]');
      for (let i = 0; i < driveLinks.length; i++) {
        const href = driveLinks[i].getAttribute('href') || '';
        const name = driveLinks[i].getAttribute('aria-label') || gt(driveLinks[i]).split('\n')[0] || 'unnamed-attachment';
        let type: string | null = 'google-drive';
        if (href.includes('docs.google.com')) type = 'google-doc';
        attachments.push({
          name: name,
          url: href.startsWith('http') ? href : 'https://classroom.google.com' + href,
          type: type,
        });
      }
    }

    return { title: title, author: author, publishedDate: publishedDate, description: description, points: points, dueDate: dueDate, attachments: attachments };
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
