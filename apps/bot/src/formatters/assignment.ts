/**
 * Format assignments for Telegram messages (HTML mode).
 */
import dayjs from 'dayjs';
import { DAY_NAMES } from '@homework/shared';
import { config } from '../config.js';

interface AttachmentRow {
  id: string;
  original_name: string;
}

interface AssignmentRow {
  id: string;
  title: string;
  due_date: string | null;
  due_raw?: string | null;
  status: string;
  is_completed: boolean;
  course:
    | { classroom_name: string; subject: string | null }
    | { classroom_name: string; subject: string | null }[]
    | null;
  attachments?: AttachmentRow[] | null;
}

/**
 * Extract the subject from the course join result.
 * Supabase may return a single object or an array depending on the join.
 */
function getSubject(row: AssignmentRow): string {
  if (!row.course) return 'Неизвестный предмет';

  const course = Array.isArray(row.course) ? row.course[0] : row.course;
  return course?.subject ?? course?.classroom_name ?? 'Неизвестный предмет';
}

/**
 * Format the status/completion indicator.
 */
function statusIcon(row: AssignmentRow): string {
  if (row.is_completed) return '\u2705';            // checkmark
  if (row.status === 'turned_in') return '\u{1F4E4}'; // outbox
  if (row.status === 'graded') return '\u{1F4AF}';    // 100
  if (row.status === 'returned') return '\u{1F504}';   // arrows cycle
  return '\u2B1C';                                     // white square
}

/**
 * Format a list of assignments for a specific date/label.
 *
 * Example output:
 *   Задания на сегодня (2 марта, Понедельник):
 *
 *   1. Алгебра -- "Title"
 *      2 файла | Срок: 2 марта
 *      Done
 */
export function formatAssignmentList(
  assignments: AssignmentRow[],
  date: string,
  label: string,
): string {
  const d = dayjs(date);
  const jsDow = d.day();
  const dayNum = jsDow === 0 ? 7 : jsDow;
  const dayName = DAY_NAMES[dayNum as keyof typeof DAY_NAMES] ?? '';

  const header = `\u{1F4DA} <b>Задания на ${label} (${d.format('D MMMM')}, ${dayName}):</b>\n`;
  const lines: string[] = [header];

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    const subject = getSubject(a);
    const icon = statusIcon(a);
    const duePart = a.due_date
      ? `\u23F0 Срок: ${dayjs(a.due_date).format('D MMMM')}`
      : '';
    const completedPart = a.is_completed ? '\u2705 Сделано' : '';

    const parts = [duePart, completedPart].filter(Boolean).join(' | ');

    lines.push(`${i + 1}. <b>${subject}</b> -- "${escapeHtml(a.title)}"`);
    if (parts) {
      lines.push(`   ${parts}`);
    }
    lines.push(`   ${icon} ${a.is_completed ? 'Выполнено' : statusText(a.status)}`);

    // Attachment links via API proxy
    if (a.attachments && a.attachments.length > 0) {
      const apiBase = config.apiUrl.replace(/\/+$/, '');
      const links: string[] = [];
      for (const att of a.attachments) {
        const url = `${apiBase}/files/${att.id}/download`;
        links.push(`<a href="${url}">${escapeHtml(att.original_name)}</a>`);
      }
      if (links.length > 0) {
        lines.push(`   \u{1F4CE} ${links.join(', ')}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

function statusText(status: string): string {
  switch (status) {
    case 'not_turned_in':
      return 'Не сдано';
    case 'turned_in':
      return 'Сдано';
    case 'graded':
      return 'Оценено';
    case 'returned':
      return 'Возвращено';
    default:
      return status;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
