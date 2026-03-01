/**
 * /week command handler.
 * Query and display assignments for the current week (Mon-Sun).
 */
import type { CommandContext, Context } from 'grammy';
import dayjs from 'dayjs';
import { DAY_NAMES } from '@homework/shared';
import { supabase } from '../db.js';
import { logger } from '../logger.js';
import { formatAssignmentList } from '../formatters/assignment.js';
import { isAuthorized } from '../middleware/auth.js';

export async function weekCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!(await isAuthorized(ctx))) return;

  // Calculate current week boundaries (Monday to Sunday)
  const now = dayjs();
  const currentDayOfWeek = now.day(); // 0=Sunday, 1=Monday, ...
  const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
  const monday = now.add(mondayOffset, 'day').startOf('day');
  const sunday = monday.add(6, 'day').endOf('day');

  const mondayStr = monday.format('YYYY-MM-DD');
  const sundayStr = sunday.format('YYYY-MM-DD');

  logger.info({ from: mondayStr, to: sundayStr }, '/week command');

  const { data: assignments, error } = await supabase
    .from('assignments')
    .select(`
      id,
      title,
      due_date,
      due_raw,
      status,
      is_completed,
      course:courses(classroom_name, subject)
    `)
    .gte('due_date', mondayStr)
    .lte('due_date', sundayStr)
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    logger.error({ error }, 'Error fetching week assignments');
    await ctx.reply('Произошла ошибка при загрузке заданий.');
    return;
  }

  if (!assignments || assignments.length === 0) {
    await ctx.reply(
      `На эту неделю (${monday.format('D.MM')} -- ${sunday.format('D.MM')}) заданий нет.`,
    );
    return;
  }

  // Group assignments by date
  const byDate = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const date = a.due_date as string;
    const group = byDate.get(date) ?? [];
    group.push(a);
    byDate.set(date, group);
  }

  // Format message with day headers
  const parts: string[] = [];
  parts.push(
    `<b>Задания на неделю (${monday.format('D.MM')} -- ${sunday.format('D.MM')}):</b>\n`,
  );

  for (const [date, dateAssignments] of byDate) {
    const d = dayjs(date);
    const dayOfWeek = d.day();
    // Convert JS day (0=Sun) to our numbering (1=Mon..5=Fri)
    const dayNum = dayOfWeek === 0 ? 7 : dayOfWeek;
    const dayName = DAY_NAMES[dayNum as keyof typeof DAY_NAMES] ?? '';
    const label = `${dayName}, ${d.format('D.MM')}`;

    const block = formatAssignmentList(dateAssignments, date, label);
    parts.push(block);
  }

  await ctx.reply(parts.join('\n'), { parse_mode: 'HTML' });
}
