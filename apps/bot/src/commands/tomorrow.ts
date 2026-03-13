/**
 * /tomorrow command handler.
 * Query and display assignments due tomorrow.
 */
import type { CommandContext, Context } from 'grammy';
import dayjs from 'dayjs';
import { supabase } from '../db.js';
import { logger } from '../logger.js';
import { formatAssignmentList } from '../formatters/assignment.js';
import { isAuthorized } from '../middleware/auth.js';

export async function tomorrowCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!(await isAuthorized(ctx))) return;

  const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
  logger.info({ date: tomorrow }, '/tomorrow command');

  const { data: assignments, error } = await supabase
    .from('assignments')
    .select(`
      id,
      title,
      due_date,
      due_raw,
      status,
      is_completed,
      course:courses!inner(classroom_name, subject),
      attachments(id, original_name, s3_url)
    `)
    .eq('course.is_active', true)
    .eq('due_date', tomorrow)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error({ error }, 'Error fetching tomorrow assignments');
    await ctx.reply('Произошла ошибка при загрузке заданий.');
    return;
  }

  if (!assignments || assignments.length === 0) {
    await ctx.reply(`На завтра (${dayjs().add(1, 'day').format('D MMMM')}) заданий нет.`);
    return;
  }

  const message = formatAssignmentList(assignments, tomorrow, 'завтра');
  await ctx.reply(message, { parse_mode: 'HTML' });
}
