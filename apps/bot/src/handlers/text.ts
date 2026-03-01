/**
 * Natural language text handler.
 * Matches Russian phrases and routes to the appropriate command logic.
 */
import type { Context } from 'grammy';
import dayjs from 'dayjs';
import { supabase } from '../db.js';
import { logger } from '../logger.js';
import { formatAssignmentList } from '../formatters/assignment.js';
import { isAuthorized } from '../middleware/auth.js';

/** Patterns for "today" intent */
const TODAY_PATTERNS = [
  /задани[яе]\s+на\s+сегодня/i,
  /что\s+задали/i,
  /домашн[еи][еи]?\s+на\s+сегодня/i,
  /дз\s+на\s+сегодня/i,
  /сегодня/i,
];

/** Patterns for "tomorrow" intent */
const TOMORROW_PATTERNS = [
  /задани[яе]\s+на\s+завтра/i,
  /домашн[еи][еи]?\s+на\s+завтра/i,
  /дз\s+на\s+завтра/i,
  /завтра/i,
];

/** Patterns for "week" intent */
const WEEK_PATTERNS = [
  /задани[яе]\s+на\s+неделю/i,
  /на\s+эту\s+неделю/i,
  /на\s+неделю/i,
  /домашн[еи][еи]?\s+на\s+неделю/i,
];

/** Patterns for "schedule" intent */
const SCHEDULE_PATTERNS = [
  /расписание/i,
  /какие\s+уроки/i,
  /что\s+по\s+расписанию/i,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Fetch assignments for a given date and reply with formatted message.
 */
async function replyWithAssignments(
  ctx: Context,
  date: string,
  label: string,
): Promise<void> {
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
    .eq('due_date', date)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error({ error }, 'Error fetching assignments for text handler');
    await ctx.reply('Произошла ошибка при загрузке заданий.');
    return;
  }

  if (!assignments || assignments.length === 0) {
    await ctx.reply(`На ${label} заданий нет.`);
    return;
  }

  const message = formatAssignmentList(assignments, date, label);
  await ctx.reply(message, { parse_mode: 'HTML' });
}

/**
 * Handle natural language text messages.
 */
export async function textHandler(ctx: Context): Promise<void> {
  const text = ctx.message?.text?.trim();
  if (!text) return;

  if (!(await isAuthorized(ctx))) return;

  // Check patterns in order of specificity (week before today, since "today"
  // pattern is very broad)
  if (matchesAny(text, WEEK_PATTERNS)) {
    logger.info({ text }, 'Text matched: week');
    // Import week command logic inline to avoid circular deps
    const { weekCommand } = await import('../commands/week.js');
    // Create a fake CommandContext -- simpler to just call the fetch logic
    const now = dayjs();
    const currentDayOfWeek = now.day();
    const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    const monday = now.add(mondayOffset, 'day').format('YYYY-MM-DD');
    const sunday = now.add(mondayOffset + 6, 'day').format('YYYY-MM-DD');

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
      .gte('due_date', monday)
      .lte('due_date', sunday)
      .order('due_date', { ascending: true });

    if (error || !assignments || assignments.length === 0) {
      await ctx.reply('На эту неделю заданий нет.');
      return;
    }

    // Group by date
    const byDate = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const date = a.due_date as string;
      const group = byDate.get(date) ?? [];
      group.push(a);
      byDate.set(date, group);
    }

    const parts: string[] = ['<b>Задания на неделю:</b>\n'];
    for (const [date, dateAssignments] of byDate) {
      parts.push(formatAssignmentList(dateAssignments, date, dayjs(date).format('D.MM')));
    }

    await ctx.reply(parts.join('\n'), { parse_mode: 'HTML' });
    return;
  }

  if (matchesAny(text, SCHEDULE_PATTERNS)) {
    logger.info({ text }, 'Text matched: schedule');
    const { scheduleCommand } = await import('../commands/schedule.js');
    // We pass ctx which has the needed reply method
    await scheduleCommand(ctx as Parameters<typeof scheduleCommand>[0]);
    return;
  }

  if (matchesAny(text, TOMORROW_PATTERNS)) {
    logger.info({ text }, 'Text matched: tomorrow');
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
    await replyWithAssignments(ctx, tomorrow, 'завтра');
    return;
  }

  if (matchesAny(text, TODAY_PATTERNS)) {
    logger.info({ text }, 'Text matched: today');
    const today = dayjs().format('YYYY-MM-DD');
    await replyWithAssignments(ctx, today, 'сегодня');
    return;
  }

  // No match -- do not reply to avoid noise
  logger.debug({ text }, 'Text did not match any pattern');
}
