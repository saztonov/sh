/**
 * Fetch detailed assignment information from an individual assignment page.
 *
 * Uses Playwright's Locator API for all DOM queries — the data is extracted
 * via allInnerTexts() / getAttribute() calls, and all filtering happens
 * in Node.js.  This completely avoids page.evaluate() with function callbacks,
 * which break under tsx/esbuild due to injected __name() helpers.
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
 * using Playwright's Locator API (no page.evaluate with callbacks).
 */
export async function fetchAssignmentDetail(
  page: Page,
  url: string,
): Promise<AssignmentDetailData> {
  logger.info({ url }, 'Fetching assignment detail');

  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // --- Title: h1 that doesn't start with "Класс" ---
  let title = '';
  try {
    const h1Texts = await page.locator('h1').allInnerTexts();
    for (const t of h1Texts) {
      const trimmed = t.trim();
      if (trimmed && !trimmed.startsWith('Класс')) {
        title = trimmed;
        break;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to extract title');
  }

  // --- Author + date: span containing "•" (bullet) ---
  let author: string | null = null;
  let publishedDate: string | null = null;
  try {
    const spanTexts = await page.locator('span').allInnerTexts();
    const bulletTexts = spanTexts
      .map((t) => t.trim())
      .filter((t) => t.includes('\u2022') && t.length > 3 && t.length < 100);

    if (bulletTexts.length > 0) {
      // Shortest match is the leaf element (parents include child text)
      bulletTexts.sort((a, b) => a.length - b.length);
      const parts = bulletTexts[0].split('\u2022').map((p) => p.trim());
      author = parts[0] || null;
      publishedDate = parts[1] || null;
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to extract author/date');
  }

  // --- Points: span containing "балл" ---
  let points: number | null = null;
  try {
    const spanTexts = await page.locator('span').allInnerTexts();
    for (const t of spanTexts) {
      const trimmed = t.trim();
      if (trimmed.includes('балл') && trimmed.length < 30) {
        const m = trimmed.match(/(\d+)/);
        if (m) {
          points = parseInt(m[1], 10);
          break;
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to extract points');
  }

  // --- Due date: "Срок сдачи:" ---
  let dueDate: string | null = null;
  try {
    const spanTexts = await page.locator('span').allInnerTexts();
    for (const t of spanTexts) {
      const trimmed = t.trim();
      if (trimmed.startsWith('Срок сдачи') && trimmed.length < 60) {
        dueDate = trimmed.replace(/^Срок сдачи:?\s*/, '').trim() || null;
        break;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to extract due date');
  }

  // --- Description: longest dir="ltr" text block ---
  let description: string | null = null;
  try {
    const ltrTexts = await page.locator('[dir="ltr"]').allInnerTexts();
    const candidates = ltrTexts
      .map((t) => t.trim())
      .filter(
        (t) =>
          t.length > 20 &&
          !t.includes('балл') &&
          !t.includes('\u2022'),
      );

    if (candidates.length > 0) {
      description = candidates.reduce((a, b) =>
        a.length >= b.length ? a : b,
      );
    }

    // Fallback: editable / placeholder elements
    if (!description) {
      const editableTexts = await page
        .locator('[contenteditable], [data-placeholder]')
        .allInnerTexts();
      for (const t of editableTexts) {
        if (t.trim().length > 20) {
          description = t.trim();
          break;
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to extract description');
  }

  // --- Attachments: .QRiHXd containers ---
  const attachments: AttachmentData[] = [];
  try {
    const containers = page.locator('.QRiHXd');
    const containerCount = await containers.count();

    for (let i = 0; i < containerCount; i++) {
      try {
        const container = containers.nth(i);
        const linkLocator = container.locator('a').first();

        if ((await linkLocator.count()) === 0) continue;

        const href = await linkLocator.getAttribute('href');
        if (!href) continue;

        const fullUrl = href.startsWith('http')
          ? href
          : `https://classroom.google.com${href}`;

        let name = (await linkLocator.getAttribute('aria-label')) || '';
        if (!name) {
          const ct = (await container.innerText()).trim();
          const lines = ct.split('\n');
          name = lines[0]?.trim() || '';
        }
        if (!name) name = 'unnamed-attachment';

        let type: string | null = null;
        if (href.includes('docs.google.com')) type = 'google-doc';
        else if (href.includes('drive.google.com')) type = 'google-drive';
        else if (href.includes('youtube.com') || href.includes('youtu.be'))
          type = 'youtube';
        else {
          const extM = name.match(/\.(\w+)$/);
          if (extM) type = extM[1].toLowerCase();
        }

        attachments.push({ name, url: fullUrl, type });
      } catch (err) {
        logger.warn({ err, index: i }, 'Failed to extract attachment from container');
      }
    }

    // Fallback: direct Drive/Docs links if no .QRiHXd containers
    if (attachments.length === 0) {
      const driveLinks = page.locator(
        'a[href*="drive.google.com"], a[href*="docs.google.com"]',
      );
      const driveLinkCount = await driveLinks.count();

      for (let i = 0; i < driveLinkCount; i++) {
        try {
          const link = driveLinks.nth(i);
          const dh = (await link.getAttribute('href')) || '';

          let dn = (await link.getAttribute('aria-label')) || '';
          if (!dn) {
            const dt = (await link.innerText()).trim();
            const dl = dt.split('\n');
            dn = dl[0]?.trim() || 'unnamed-attachment';
          }

          let dtype: string | null = 'google-drive';
          if (dh.includes('docs.google.com')) dtype = 'google-doc';

          attachments.push({
            name: dn,
            url: dh.startsWith('http')
              ? dh
              : `https://classroom.google.com${dh}`,
            type: dtype,
          });
        } catch (err) {
          logger.warn({ err, index: i }, 'Failed to extract drive link');
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to extract attachments');
  }

  logger.info(
    {
      title,
      author,
      points,
      hasDescription: !!description,
      descriptionLength: description?.length ?? 0,
      attachmentCount: attachments.length,
    },
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
