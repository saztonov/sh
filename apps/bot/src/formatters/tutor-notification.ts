/**
 * Format tutor session notification messages for Telegram (HTML mode).
 */
import dayjs from 'dayjs';
import 'dayjs/locale/ru.js';
import type { TutorSessionResolved } from '@homework/shared';
import { DAY_NAMES } from '@homework/shared';

dayjs.locale('ru');

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDuration(hours: number): string {
  if (hours === 1) return '1 час';
  if (hours === 1.5) return '1,5 часа';
  if (hours === 2) return '2 часа';
  return `${hours} ч.`;
}

/**
 * Format a reminder about an upcoming tutor session (1 hour before).
 */
export function formatSessionReminder(session: TutorSessionResolved): string {
  const d = dayjs(session.date);
  const dayName = DAY_NAMES[session.day_of_week] ?? '';
  const dateStr = d.format('D MMMM');

  const lines = [
    `🔔 <b>Напоминание: занятие с репетитором через 1 час</b>`,
    ``,
    `📚 Предмет: <b>${escapeHtml(session.subject)}</b>`,
    `👤 Репетитор: ${escapeHtml(session.tutor_name)}`,
    `🕐 Время: ${session.time_start} (${formatDuration(session.duration_hours)})`,
    `📅 ${dayName}, ${dateStr}`,
  ];

  return lines.join('\n');
}

/**
 * Format a 7-day tutor schedule for the daily evening notification.
 */
export function formatWeeklySchedule(sessions: TutorSessionResolved[]): string {
  if (sessions.length === 0) return '';

  const lines: string[] = [
    `📋 <b>Занятия с репетиторами на ближайшие 7 дней:</b>`,
    ``,
  ];

  // Group sessions by date
  const byDate = new Map<string, TutorSessionResolved[]>();
  for (const s of sessions) {
    const existing = byDate.get(s.date) ?? [];
    existing.push(s);
    byDate.set(s.date, existing);
  }

  // Iterate in date order
  const sortedDates = [...byDate.keys()].sort();

  for (const date of sortedDates) {
    const daySessions = byDate.get(date)!;
    const d = dayjs(date);
    const dow = d.isoWeekday();
    const dayName = DAY_NAMES[dow] ?? '';
    const dateStr = d.format('D MMMM');

    lines.push(`<b>${dayName}, ${dateStr}:</b>`);

    for (const s of daySessions) {
      const duration = formatDuration(s.duration_hours);
      lines.push(
        `  ${s.time_start} — ${escapeHtml(s.subject)} (${escapeHtml(s.tutor_name)}, ${duration})`,
      );
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
