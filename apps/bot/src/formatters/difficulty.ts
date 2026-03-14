/**
 * Format difficulties for Telegram messages (HTML mode).
 */
import dayjs from 'dayjs';

interface DifficultyRow {
  id: string;
  subject: string;
  title: string;
  comment: string | null;
  is_resolved: boolean;
  deadline: string | null;
  created_at: string;
}

/**
 * Format a list of unresolved difficulties.
 */
export function formatDifficultyList(difficulties: DifficultyRow[]): string {
  const lines: string[] = [];
  lines.push(`\u{1F6A8} <b>Нерешённые сложности (${difficulties.length}):</b>\n`);

  for (let i = 0; i < difficulties.length; i++) {
    const d = difficulties[i];

    lines.push(`${i + 1}. <b>${escapeHtml(d.subject)}</b> — ${escapeHtml(d.title)}`);

    if (d.comment) {
      lines.push(`   💬 ${escapeHtml(d.comment)}`);
    }

    if (d.deadline) {
      const deadlineDate = dayjs(d.deadline);
      const isOverdue = deadlineDate.isBefore(dayjs(), 'day');
      const icon = isOverdue ? '\u{26A0}\u{FE0F}' : '\u23F0';
      lines.push(`   ${icon} Дедлайн: ${deadlineDate.format('D.MM.YYYY')}${isOverdue ? ' (просрочено)' : ''}`);
    }

    lines.push(`   \u{1F4C5} Создано: ${dayjs(d.created_at).format('D.MM.YYYY')}`);
    lines.push('');
  }

  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
