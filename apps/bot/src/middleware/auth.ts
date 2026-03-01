/**
 * Authorization middleware/helper for the Telegram bot.
 * Checks if the user sending a message is authorized in the telegram_users table.
 */
import type { Context } from 'grammy';
import { supabase } from '../db.js';
import { logger } from '../logger.js';

/**
 * Check if the current user is authorized.
 * Sends a reply and returns false if not authorized.
 */
export async function isAuthorized(ctx: Context): Promise<boolean> {
  const telegramId = ctx.from?.id;

  if (!telegramId) {
    await ctx.reply('Не удалось определить ваш Telegram ID.');
    return false;
  }

  const { data: user, error } = await supabase
    .from('telegram_users')
    .select('is_authorized')
    .eq('telegram_id', telegramId)
    .single();

  if (error || !user) {
    logger.warn({ telegramId }, 'Unauthorized user attempted access');
    await ctx.reply(
      'Вы не авторизованы. Используйте /start для запроса доступа.',
    );
    return false;
  }

  if (!user.is_authorized) {
    await ctx.reply('Ваш запрос на доступ ещё не подтверждён. Ожидайте.');
    return false;
  }

  return true;
}
