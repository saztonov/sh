/**
 * /schedule command handler.
 * Display today's schedule from schedule_slots, joined with assignments if any.
 */
import type { CommandContext, Context } from 'grammy';
import dayjs from 'dayjs';
import { DAY_NAMES } from '@homework/shared';
import type { DayOfWeek } from '@homework/shared';
import { supabase } from '../db.js';
import { logger } from '../logger.js';
import { formatSchedule } from '../formatters/schedule.js';
import { isAuthorized } from '../middleware/auth.js';

export async function scheduleCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!(await isAuthorized(ctx))) return;

  const now = dayjs();
  const jsDow = now.day(); // 0=Sunday, 1=Monday, ... 6=Saturday
  // Convert to 1=Monday..5=Friday
  const dayOfWeek = jsDow as DayOfWeek;

  if (jsDow === 0 || jsDow === 6) {
    await ctx.reply('Сегодня выходной! Расписания нет.');
    return;
  }

  const dayNum = jsDow as DayOfWeek;
  const today = now.format('YYYY-MM-DD');
  const dayName = DAY_NAMES[dayNum] ?? '';

  logger.info({ dayOfWeek: dayNum, date: today }, '/schedule command');

  // Fetch schedule slots for today
  const { data: slots, error: slotsError } = await supabase
    .from('schedule_slots')
    .select('*')
    .eq('day_of_week', dayNum)
    .order('lesson_number', { ascending: true });

  if (slotsError) {
    logger.error({ error: slotsError }, 'Error fetching schedule slots');
    await ctx.reply('Произошла ошибка при загрузке расписания.');
    return;
  }

  if (!slots || slots.length === 0) {
    await ctx.reply(`На ${dayName} расписание не найдено.`);
    return;
  }

  // Fetch assignments due today to match with schedule slots
  const { data: assignments } = await supabase
    .from('assignments')
    .select(`
      id,
      title,
      due_date,
      status,
      is_completed,
      course:courses(classroom_name, subject)
    `)
    .eq('due_date', today);

  const message = formatSchedule(slots, assignments ?? [], dayName, today);
  await ctx.reply(message, { parse_mode: 'HTML' });
}
