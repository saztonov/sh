import dayjs from 'dayjs';
import type { ScheduleSlot } from '@homework/shared';

/**
 * Format a date string as a readable Russian date, e.g. "24 фев 2026".
 */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return dayjs(date).format('D MMM YYYY');
}

/**
 * Format a date as short (no year), e.g. "24 фев".
 */
export function formatDateShort(date: string | null | undefined): string {
  if (!date) return '—';
  return dayjs(date).format('D MMM');
}

/**
 * Format time, e.g. "08:30".
 */
export function formatTime(time: string | null | undefined): string {
  if (!time) return '';
  // time is already in HH:mm format from the API
  return time;
}

/**
 * Determine due date status relative to today.
 */
export function getDueDateStatus(
  dueDate: string | null | undefined,
): 'overdue' | 'today' | 'tomorrow' | 'future' | 'none' {
  if (!dueDate) return 'none';

  const today = dayjs().startOf('day');
  const due = dayjs(dueDate).startOf('day');
  const diff = due.diff(today, 'day');

  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return 'future';
}

/**
 * Get the color associated with a due date status.
 */
export function getDueDateColor(dueDate: string | null | undefined): string {
  const status = getDueDateStatus(dueDate);
  switch (status) {
    case 'overdue':
      return '#ff4d4f';
    case 'today':
      return '#fa8c16';
    case 'tomorrow':
      return '#faad14';
    case 'future':
      return '#52c41a';
    default:
      return '#d9d9d9';
  }
}

/**
 * Get a human-readable due date label in Russian.
 */
export function getDueDateLabel(dueDate: string | null | undefined): string {
  const status = getDueDateStatus(dueDate);
  switch (status) {
    case 'overdue':
      return 'Просрочено';
    case 'today':
      return 'Сегодня';
    case 'tomorrow':
      return 'Завтра';
    default:
      return formatDate(dueDate);
  }
}

/**
 * Format file size in human-readable format.
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/**
 * Get a week date range string, e.g. "24 фев — 28 фев 2026".
 */
export function formatWeekRange(weekOffset: number): string {
  const monday = dayjs().isoWeekday(1).add(weekOffset, 'week');
  const friday = monday.add(6, 'day');

  const monStr = monday.format('D MMM');
  const friStr = friday.format('D MMM YYYY');

  return `${monStr} — ${friStr}`;
}

/**
 * Get subject color (deterministic hash-based).
 */
const SUBJECT_COLORS: Record<string, string> = {
  'Алгебра': '#1677ff',
  'Геометрия': '#722ed1',
  'Физика': '#13c2c2',
  'Химия': '#eb2f96',
  'Биология': '#52c41a',
  'Русский язык': '#fa541c',
  'Литература': '#faad14',
  'История': '#a0522d',
  'География': '#2f54eb',
  'Обществознание': '#9254de',
  'Англ. яз.': '#1890ff',
  'Немец. яз.': '#f5222d',
  'Инф. и ИКТ': '#389e0d',
  'Физкультура': '#d48806',
  'Право': '#531dab',
  'Экономика': '#08979c',
  'МХК': '#c41d7f',
  'ТВиС': '#7cb305',
  'РоВ': '#cf1322',
};

export function getSubjectColor(subject: string | null | undefined): string {
  if (!subject) return '#8c8c8c';
  return SUBJECT_COLORS[subject] || '#597ef7';
}

/**
 * Get human-readable source label.
 */
export function getSourceLabel(source: 'google' | 'eljur' | null | undefined): string | null {
  if (source === 'google') return 'GGL CLASS';
  if (source === 'eljur') return 'Элжур';
  return null;
}

/**
 * Find the first schedule slot for a given subject on a given day of week,
 * and return the time range as "HH:mm–HH:mm", or null if not found.
 */
export function getSlotTimeForSubject(
  slots: ScheduleSlot[],
  subject: string | null,
  dayOfWeek: number | null,
): string | null {
  if (!subject || !dayOfWeek || dayOfWeek < 1 || dayOfWeek > 5) return null;
  const slot = slots.find(
    (s) => s.subject === subject && s.day_of_week === dayOfWeek,
  );
  if (!slot?.time_start || !slot?.time_end) return null;
  return `${slot.time_start.slice(0, 5)}\u2013${slot.time_end.slice(0, 5)}`;
}
