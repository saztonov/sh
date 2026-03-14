import path from 'node:path';

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
