/**
 * /today command handler.
 * Query and display assignments due today.
 */
import type { CommandContext, Context } from 'grammy';
import dayjs from 'dayjs';
import { supabase } from '../db.js';
import { logger } from '../logger.js';
import { formatAssignmentList } from '../formatters/assignment.js';
import { isAuthorized } from '../middleware/auth.js';

export async function todayCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!(await isAuthorized(ctx))) return;

  const today = dayjs().format('YYYY-MM-DD');
  logger.info({ date: today }, '/today command');

  const { data: assignments, error } = await supabase
    .from('assignments')
    .select(`
      id,
      title,
      due_date,
      due_raw,
      status,
      is_completed,
      course:courses!inner(classroom_name, subject)
    `)
    .eq('course.is_active', true)
    .eq('due_date', today)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error({ error }, 'Error fetching today assignments');
    await ctx.reply('Произошла ошибка при загрузке заданий.');
    return;
  }

  if (!assignments || assignments.length === 0) {
    await ctx.reply(`На сегодня (${dayjs().format('D MMMM')}) заданий нет.`);
    return;
  }

  const message = formatAssignmentList(assignments, today, 'сегодня');
  await ctx.reply(message, { parse_mode: 'HTML' });
}
