/**
 * Format schedule slots for Telegram messages (HTML mode).
 */
import dayjs from 'dayjs';

interface ScheduleSlotRow {
  id: string;
  day_of_week: number;
  lesson_number: number;
  time_start: string | null;
  time_end: string | null;
  subject: string;
}

interface AssignmentRow {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  is_completed: boolean;
  course:
    | { classroom_name: string; subject: string | null }
    | { classroom_name: string; subject: string | null }[]
    | null;
}

/**
 * Extract the subject from the course join result.
 */
function getSubject(row: AssignmentRow): string | null {
  if (!row.course) return null;
  const course = Array.isArray(row.course) ? row.course[0] : row.course;
  return course?.subject ?? null;
}

/**
 * Format the time range for a schedule slot.
 */
function formatTime(slot: ScheduleSlotRow): string {
  if (slot.time_start && slot.time_end) {
    return `${slot.time_start}\u2013${slot.time_end}`;
  }
  return '';
}

/**
 * Format the full schedule for a day, including any matching assignments.
 *
 * Example output:
 *   Расписание на Понедельник, 2 марта:
 *
 *   1. 09:00-09:40 РоВ
 *   2. 09:50-10:30 Англ. яз.
 *      Homework title here
 *   ...
 */
export function formatSchedule(
  slots: ScheduleSlotRow[],
  assignments: AssignmentRow[],
  dayName: string,
  date: string,
): string {
  const d = dayjs(date);
  const header = `\u{1F4C5} <b>Расписание на ${dayName}, ${d.format('D MMMM')}:</b>\n`;
  const lines: string[] = [header];

  // Index assignments by subject for quick lookup
  const assignmentsBySubject = new Map<string, AssignmentRow[]>();
  for (const a of assignments) {
    const subject = getSubject(a);
    if (subject) {
      const existing = assignmentsBySubject.get(subject) ?? [];
      existing.push(a);
      assignmentsBySubject.set(subject, existing);
    }
  }

  for (const slot of slots) {
    const time = formatTime(slot);
    const timePart = time ? `${time} ` : '';

    lines.push(`${slot.lesson_number}. ${timePart}<b>${escapeHtml(slot.subject)}</b>`);

    // Find assignments matching this slot's subject
    const matching = assignmentsBySubject.get(slot.subject);
    if (matching && matching.length > 0) {
      for (const a of matching) {
        const icon = a.is_completed ? '\u2705' : '\u{1F4DD}';
        lines.push(`   ${icon} ${escapeHtml(a.title)}`);
      }
    }
  }

  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
