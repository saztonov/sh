/**
 * Parse Russian due-date strings from Google Classroom into ISO date strings.
 * Ported from OLD/fetch_classroom.py clean_due() and OLD/sync_to_sheets.py parse_due_date().
 *
 * Supported formats:
 *   - "Сегодня" / "Сегодня, 14:00" -> today
 *   - "Завтра"                      -> tomorrow
 *   - "пн, 3 мар."                  -> abbreviated weekday + date
 *   - "5 марта"                     -> day + full month name
 *   - "5 марта 2026 г."             -> day + month + year
 */
import dayjs from 'dayjs';
import { MONTH_MAP } from '@homework/shared';

/**
 * Clean the raw due string extracted from the assignment list.
 * Strips trailing noise and normalises the value.
 */
export function cleanDueText(raw: string): string {
  const trimmed = raw.trim();

  // Match known patterns and strip everything after
  const match = trimmed.match(
    /^(Сегодня(?:,\s*\d{1,2}:\d{2})?|Завтра|(?:пн|вт|ср|чт|пт|сб|вс),\s*\d{1,2}\s*[а-яё]+\.?|(?:понедельник|вторник|среда|среду|четверг|пятница|пятницу|суббота|субботу|воскресенье)(?:,\s*\d{1,2}\s*[а-яё]+\.?\s*(?:\d{4}\s*г\.?)?)?)/i,
  );

  return match ? match[1].trim() : trimmed;
}

/**
 * Parse a cleaned Russian due-date string into an ISO date (YYYY-MM-DD) or null.
 */
export function parseDueDate(dueStr: string): string | null {
  const s = dueStr.trim().toLowerCase();
  const today = dayjs().startOf('day');

  // "сегодня" or "сегодня, 14:00"
  if (s.startsWith('сегодня')) {
    return today.format('YYYY-MM-DD');
  }

  // "завтра"
  if (s.startsWith('завтра')) {
    return today.add(1, 'day').format('YYYY-MM-DD');
  }

  // Try to extract day number and month name from the string.
  // Covers: "пн, 3 мар.", "5 марта", "среда, 5 марта 2026 г." etc.
  const dateMatch = s.match(/(\d{1,2})\s+([а-яё]+)\.?\s*(?:(\d{4})\s*г?\.?)?/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const monthStr = dateMatch[2];
    const yearStr = dateMatch[3];

    // Look up month by first 3 chars, then by full word
    const monthKey = monthStr.slice(0, 3);
    const month = MONTH_MAP[monthStr] ?? MONTH_MAP[monthKey];

    if (month !== undefined) {
      let year = yearStr ? parseInt(yearStr, 10) : today.year();
      let dt = dayjs(new Date(year, month - 1, day));

      // If no explicit year and the date already passed, push to next year
      if (!yearStr && dt.isBefore(today.subtract(1, 'day'))) {
        year += 1;
        dt = dayjs(new Date(year, month - 1, day));
      }

      return dt.format('YYYY-MM-DD');
    }
  }

  return null;
}
