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
 * Extract a clean filename from an aria-label like:
 *   'Прикрепленный файл: "ОЁ после шипящих ИЫ после Ц.pptx" (Microsoft PowerPoint)'
 * Returns just: 'ОЁ после шипящих ИЫ после Ц.pptx'
 */
function extractFileName(ariaLabel: string): string {
  // Try to extract content between quotes
  const quoted = ariaLabel.match(/"([^"]+)"/);
  if (quoted) return quoted[1];

  // Fallback: remove known prefix and type suffix
  return ariaLabel
    .replace(/^Прикрепленный файл:\s*/i, '')
    .replace(/\s*\([^)]+\)\s*$/, '')
    .replace(/^["«]|["»]$/g, '')
    .trim();
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

  // Wait for page content to fully render.
  // Google Classroom loads description via XHR AFTER initial DOM.
  // Use waitForFunction with a string (safe from esbuild __name injection).
  try {
    await page.waitForFunction(
      `!!document.querySelector('[guidedhelpid="assignmentInstructionsGH"]')?.innerText?.trim()`,
      undefined,
      { timeout: 10_000 },
    );
  } catch {
    // Description might not exist — wait for at least h1 as fallback
    try {
      await page.locator('h1').first().waitFor({ timeout: 5_000 });
    } catch {
      /* continue anyway */
    }
  }
  await page.waitForTimeout(500);

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

  // --- Author + date: element containing "•" (bullet) ---
  // Search span, div, p — the bullet might be in any container type
  let author: string | null = null;
  let publishedDate: string | null = null;
  try {
    const bulletElTexts = await page
      .locator('span:has-text("\u2022"), div:has-text("\u2022"), p:has-text("\u2022")')
      .allInnerTexts();

    const bulletTexts = bulletElTexts
      .map((t) => t.trim())
      .filter((t) => t.includes('\u2022') && t.length > 3 && t.length < 100);

    if (bulletTexts.length > 0) {
      // Shortest match = leaf element (parents include all child text)
      bulletTexts.sort((a, b) => a.length - b.length);
      const parts = bulletTexts[0].split('\u2022').map((p) => p.trim());
      author = parts[0] || null;
      publishedDate = parts[1] || null;
    }

    logger.debug(
      { bulletCandidates: bulletTexts.length, shortest: bulletTexts[0]?.slice(0, 80) },
      'Author/date search results',
    );
  } catch (err) {
    logger.warn({ err }, 'Failed to extract author/date');
  }

  // --- Points: element containing "балл" ---
  let points: number | null = null;
  try {
    const pointsTexts = await page
      .locator('span:has-text("балл"), div:has-text("балл")')
      .allInnerTexts();

    for (const t of pointsTexts) {
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
    const dueTexts = await page
      .locator('span:has-text("Срок сдачи"), div:has-text("Срок сдачи")')
      .allInnerTexts();

    for (const t of dueTexts) {
      const trimmed = t.trim();
      if (trimmed.startsWith('Срок сдачи') && trimmed.length < 60) {
        dueDate = trimmed.replace(/^Срок сдачи:?\s*/, '').trim() || null;
        break;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to extract due date');
  }

  // --- Description: text content of the assignment ---
  let description: string | null = null;

  // Approach 1 (best): guidedhelpid="assignmentInstructionsGH" — stable semantic attribute
  // The waitForFunction at page load already waited for this element's text.
  try {
    const instructionsLocator = page.locator('[guidedhelpid="assignmentInstructionsGH"]');
    if ((await instructionsLocator.count()) > 0) {
      const text = (await instructionsLocator.innerText()).trim();
      if (text.length > 0) {
        description = text;
      }
    }

    logger.info(
      { found: !!description, length: description?.length ?? 0 },
      'Description search: assignmentInstructionsGH',
    );
  } catch (err) {
    logger.info({ err }, 'Description search: error reading assignmentInstructionsGH');
  }

  // Approach 2: dir="ltr" or dir="auto" elements
  if (!description) {
    try {
      const dirTexts = await page
        .locator('[dir="ltr"], [dir="auto"]')
        .allInnerTexts();

      const candidates = dirTexts
        .map((t) => t.trim())
        .filter(
          (t) =>
            t.length > 20 &&
            !t.includes('балл') &&
            !t.includes('\u2022') &&
            t !== title,
        );

      if (candidates.length > 0) {
        description = candidates.reduce((a, b) =>
          a.length >= b.length ? a : b,
        );
      }
    } catch {
      /* empty */
    }
  }

  // Approach 3: contenteditable / placeholder elements
  if (!description) {
    try {
      const editableTexts = await page
        .locator('[contenteditable], [data-placeholder]')
        .allInnerTexts();
      for (const t of editableTexts) {
        if (t.trim().length > 20) {
          description = t.trim();
          break;
        }
      }
    } catch {
      /* empty */
    }
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

        // Extract clean filename:
        // 1) innerText first line (usually the clean filename)
        // 2) aria-label parsed for quoted filename
        let name = '';

        const ct = (await container.innerText()).trim();
        if (ct) {
          const firstLine = ct.split('\n')[0]?.trim() || '';
          if (firstLine) name = firstLine;
        }

        if (!name) {
          const ariaLabel =
            (await linkLocator.getAttribute('aria-label')) || '';
          if (ariaLabel) {
            name = extractFileName(ariaLabel);
          }
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
        logger.warn(
          { err, index: i },
          'Failed to extract attachment from container',
        );
      }
    }

    // Fallback: direct Drive/Docs links if no .QRiHXd containers found
    if (attachments.length === 0) {
      const driveLinks = page.locator(
        'a[href*="drive.google.com"], a[href*="docs.google.com"]',
      );
      const driveLinkCount = await driveLinks.count();

      for (let i = 0; i < driveLinkCount; i++) {
        try {
          const link = driveLinks.nth(i);
          const dh = (await link.getAttribute('href')) || '';

          let dn = '';
          const ariaLabel = (await link.getAttribute('aria-label')) || '';
          if (ariaLabel) {
            dn = extractFileName(ariaLabel);
          }
          if (!dn) {
            const dt = (await link.innerText()).trim();
            dn = dt.split('\n')[0]?.trim() || 'unnamed-attachment';
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
      publishedDate,
      points,
      dueDate,
      hasDescription: !!description,
      descriptionLength: description?.length ?? 0,
      descriptionPreview: description?.slice(0, 80) ?? null,
      attachmentCount: attachments.length,
      attachmentNames: attachments.map((a) => a.name),
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
