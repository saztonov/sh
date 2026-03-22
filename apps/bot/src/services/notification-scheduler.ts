/**
 * Notification scheduler for tutor session reminders.
 *
 * Two notification types:
 * 1. 1 hour before a session — per-session reminder
 * 2. Daily at 20:00 — 7-day tutor schedule
 *
 * Uses node-cron with Europe/Moscow timezone.
 * Deduplication via in-memory Set (cleared at midnight).
 */
import cron, { type ScheduledTask } from 'node-cron';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import 'dayjs/locale/ru.js';
import type { Bot, Context } from 'grammy';
import { supabase } from '../db.js';
import { logger } from '../logger.js';
import { resolveSessionsForRange } from './tutor-resolver.js';
import { formatSessionReminder, formatWeeklySchedule } from '../formatters/tutor-notification.js';

dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');

const TZ = 'Europe/Moscow';

const sentNotifications = new Set<string>();
const tasks: ScheduledTask[] = [];

/**
 * Get all authorized Telegram user IDs.
 */
async function getAuthorizedUserIds(): Promise<number[]> {
  const { data, error } = await supabase
    .from('telegram_users')
    .select('telegram_id')
    .eq('is_authorized', true);

  if (error) {
    logger.error({ err: error }, 'Failed to fetch authorized users');
    return [];
  }

  return (data ?? []).map((u) => u.telegram_id);
}

/**
 * Send a message to all authorized users, sequentially.
 */
async function broadcast(bot: Bot<Context>, message: string): Promise<void> {
  const userIds = await getAuthorizedUserIds();

  for (const userId of userIds) {
    try {
      await bot.api.sendMessage(userId, message, { parse_mode: 'HTML' });
    } catch (err) {
      logger.error({ err, userId }, 'Failed to send notification');
    }
  }
}

/**
 * Check for sessions starting in ~1 hour and send reminders.
 * Runs every minute.
 */
async function checkUpcomingReminders(bot: Bot<Context>): Promise<void> {
  try {
    const now = dayjs().tz(TZ);
    const today = now.format('YYYY-MM-DD');

    const sessions = await resolveSessionsForRange(today, today);

    for (const session of sessions) {
      const [hours, minutes] = session.time_start.split(':').map(Number);
      const sessionTime = now.hour(hours).minute(minutes).second(0);
      const diffMinutes = sessionTime.diff(now, 'minute');

      // Window: 55–65 minutes before the session
      if (diffMinutes >= 55 && diffMinutes <= 65) {
        const dedupKey = `1h:${session.session_id}:${session.date}`;
        if (sentNotifications.has(dedupKey)) continue;

        const message = formatSessionReminder(session);
        await broadcast(bot, message);
        sentNotifications.add(dedupKey);

        logger.info(
          { session_id: session.session_id, date: session.date, time: session.time_start },
          'Sent 1-hour reminder',
        );
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error in checkUpcomingReminders');
  }
}

/**
 * Send 7-day tutor schedule. Runs daily at 20:00.
 */
async function sendDailySchedule(bot: Bot<Context>): Promise<void> {
  try {
    const now = dayjs().tz(TZ);
    const dedupKey = `daily:${now.format('YYYY-MM-DD')}`;
    if (sentNotifications.has(dedupKey)) return;

    const tomorrow = now.add(1, 'day').format('YYYY-MM-DD');
    const weekEnd = now.add(7, 'day').format('YYYY-MM-DD');

    const sessions = await resolveSessionsForRange(tomorrow, weekEnd);

    if (sessions.length === 0) {
      sentNotifications.add(dedupKey);
      return;
    }

    const message = formatWeeklySchedule(sessions);
    await broadcast(bot, message);
    sentNotifications.add(dedupKey);

    logger.info({ count: sessions.length }, 'Sent daily tutor schedule');
  } catch (err) {
    logger.error({ err }, 'Error in sendDailySchedule');
  }
}

/**
 * Start the notification scheduler.
 */
export function startScheduler(bot: Bot<Context>): void {
  // Every minute — check for 1-hour reminders
  const reminderTask = cron.schedule(
    '* * * * *',
    () => { checkUpcomingReminders(bot); },
    { timezone: TZ },
  );
  tasks.push(reminderTask);

  // Daily at 20:00 — send 7-day schedule
  const dailyTask = cron.schedule(
    '0 20 * * *',
    () => { sendDailySchedule(bot); },
    { timezone: TZ },
  );
  tasks.push(dailyTask);

  // Midnight — clear dedup set
  const cleanupTask = cron.schedule(
    '0 0 * * *',
    () => { sentNotifications.clear(); },
    { timezone: TZ },
  );
  tasks.push(cleanupTask);

  logger.info('Notification scheduler started (timezone: Europe/Moscow)');
}

/**
 * Stop all scheduled tasks.
 */
export function stopScheduler(): void {
  for (const task of tasks) {
    task.stop();
  }
  tasks.length = 0;
  logger.info('Notification scheduler stopped');
}
