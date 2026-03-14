import path from 'node:path';

/** Common extension → MIME type mapping for when DB value is missing. */
const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
};

/**
 * Build a RFC 6266 Content-Disposition header value with both
 * an ASCII-safe `filename` fallback and a UTF-8 `filename*` parameter.
 *
 * Android WebView (used by Telegram) often ignores `filename*`,
 * so the ASCII fallback ensures the file keeps its extension.
 */
export function buildContentDisposition(originalName: string): string {
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);

  // Replace non-ASCII characters with underscores for the fallback name
  const asciiBase = base.replace(/[^\x20-\x7E]/g, '_').replace(/"+/g, "'");
  const asciiFallback = `${asciiBase}${ext}`;

  const encoded = encodeURIComponent(originalName);

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * Resolve MIME type: use DB value if present and not generic,
 * otherwise infer from file extension.
 */
export function resolveMimeType(dbMime: string | null, fileName: string): string {
  if (dbMime && dbMime !== 'application/octet-stream') return dbMime;
  const ext = path.extname(fileName).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}
