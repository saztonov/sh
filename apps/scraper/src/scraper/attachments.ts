/**
 * Download attachments from URLs and upload them to S3.
 * Uses Playwright's APIRequestContext to inherit browser cookies for
 * authenticated downloads from Google Drive.
 */
import type { Page } from 'playwright';
import { uploadToS3, type UploadResult } from '../s3.js';
import { logger } from '../logger.js';

/**
 * Guess the MIME type from a file name extension.
 */
function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    txt: 'text/plain',
    zip: 'application/zip',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
  };

  return mimeMap[ext ?? ''] ?? 'application/octet-stream';
}

/**
 * Extract Google Drive file ID from a URL and build the direct download URL.
 * Supports:
 *   https://drive.google.com/file/d/{FILE_ID}/view
 *   https://drive.google.com/open?id={FILE_ID}
 */
function buildDriveDownloadUrl(url: string): string | null {
  // Pattern: /file/d/{FILE_ID}/
  const fileMatch = url.match(/\/file\/d\/([^/]+)/);
  if (fileMatch) {
    return `https://drive.usercontent.google.com/u/0/uc?id=${fileMatch[1]}&export=download`;
  }

  // Pattern: open?id={FILE_ID}
  const idMatch = url.match(/[?&]id=([^&]+)/);
  if (idMatch) {
    return `https://drive.usercontent.google.com/u/0/uc?id=${idMatch[1]}&export=download`;
  }

  return null;
}

/**
 * Download a file from a URL using Playwright's authenticated context
 * and upload it to S3.
 *
 * @param page         - Playwright page (used for authenticated HTTP requests)
 * @param url          - The download URL (Google Drive, direct link, etc.)
 * @param assignmentId - The assignment UUID for organising the S3 key
 * @param fileName     - The original file name
 * @returns S3 key and URL, or null if download/upload failed
 */
export async function downloadAndUploadAttachment(
  page: Page,
  url: string,
  assignmentId: string,
  fileName: string,
): Promise<(UploadResult & { mimeType: string; sizeBytes: number }) | null> {
  try {
    // Convert Google Drive view URLs to direct download URLs
    let downloadUrl = url;
    if (url.includes('drive.google.com')) {
      const directUrl = buildDriveDownloadUrl(url);
      if (directUrl) {
        downloadUrl = directUrl;
        logger.info({ originalUrl: url, downloadUrl }, 'Converted Drive URL to download URL');
      }
    }

    logger.info({ url: downloadUrl, fileName }, 'Downloading attachment');

    // Use Playwright's request context which inherits browser cookies
    const response = await page.request.get(downloadUrl, {
      maxRedirects: 5,
    });

    if (!response.ok()) {
      logger.warn(
        { url: downloadUrl, status: response.status() },
        'Failed to download attachment',
      );
      return null;
    }

    const buffer = Buffer.from(await response.body());
    const mimeType =
      response.headers()['content-type'] ?? guessMimeType(fileName);

    // Sanitise the filename for S3 keys
    const sanitisedName = fileName.replace(/[^a-zA-Z0-9_.\-\u0400-\u04FF]/g, '_');
    const s3Key = `attachments/${assignmentId}/${sanitisedName}`;

    const result = await uploadToS3(s3Key, buffer, mimeType);

    logger.info(
      { s3Key, sizeBytes: buffer.length },
      'Uploaded attachment to S3',
    );

    return {
      ...result,
      mimeType,
      sizeBytes: buffer.length,
    };
  } catch (err) {
    logger.error({ err, url, fileName }, 'Error downloading/uploading attachment');
    return null;
  }
}
