/**
 * Download attachments from URLs and upload them to S3.
 */
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
 * Download a file from a URL and upload it to S3.
 *
 * @param url          - The download URL (Google Drive, direct link, etc.)
 * @param assignmentId - The assignment UUID for organising the S3 key
 * @param fileName     - The original file name
 * @returns S3 key and URL, or null if download/upload failed
 */
export async function downloadAndUploadAttachment(
  url: string,
  assignmentId: string,
  fileName: string,
): Promise<(UploadResult & { mimeType: string; sizeBytes: number }) | null> {
  try {
    logger.info({ url, fileName }, 'Downloading attachment');

    const response = await fetch(url, {
      redirect: 'follow',
    });

    if (!response.ok) {
      logger.warn(
        { url, status: response.status },
        'Failed to download attachment',
      );
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType =
      response.headers.get('content-type') ?? guessMimeType(fileName);

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
