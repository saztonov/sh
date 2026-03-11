/**
 * /authorize <telegram_id> — admin-only command.
 * Authorizes a pending user by their Telegram ID.
 *
 * Usage:
 *   /authorize 987654321
 */
import type { CommandContext, Context } from 'grammy';
import { config } from '../config.js';
import { supabase } from '../db.js';
import { logger } from '../logger.js';

export async function authorizeCommand(ctx: CommandContext<Context>): Promise<void> {
  const callerId = ctx.from?.id;

  // Only admin can use this command
  if (callerId !== config.telegram.adminId) {
    await ctx.reply('Эта команда доступна только администратору.');
    return;
  }

  const arg = ctx.match?.trim();
  const targetId = arg ? parseInt(arg, 10) : NaN;

  if (!arg || isNaN(targetId)) {
    await ctx.reply('Укажите Telegram ID пользователя.\nПример: /authorize 987654321');
    return;
  }

  const { data: user, error: fetchError } = await supabase
    .from('telegram_users')
    .select('id, telegram_username, is_authorized')
    .eq('telegram_id', targetId)
    .single();

  if (fetchError || !user) {
    await ctx.reply(
      `Пользователь с ID ${targetId} не найден.\nОн должен сначала написать боту /start.`,
    );
    return;
  }

  if (user.is_authorized) {
    const name = user.telegram_username ? `@${user.telegram_username}` : `ID ${targetId}`;
    await ctx.reply(`Пользователь ${name} уже авторизован.`);
    return;
  }

  const { error: updateError } = await supabase
    .from('telegram_users')
    .update({ is_authorized: true })
    .eq('id', user.id);

  if (updateError) {
    logger.error({ updateError, targetId }, 'Failed to authorize telegram user');
    await ctx.reply('Произошла ошибка при авторизации. Попробуйте позже.');
    return;
  }

  const name = user.telegram_username ? `@${user.telegram_username}` : `ID ${targetId}`;
  logger.info({ targetId, name }, 'User authorized by admin');
  await ctx.reply(`Пользователь ${name} авторизован.`);

  // Notify the authorized user
  try {
    await ctx.api.sendMessage(
      targetId,
      'Вы авторизованы! Теперь у вас есть доступ к боту.\n\n' +
      'Доступные команды:\n' +
      '/today — задания на сегодня\n' +
      '/tomorrow — задания на завтра\n' +
      '/week — задания на неделю\n' +
      '/schedule — расписание на сегодня',
    );
  } catch {
    // User may have blocked the bot — not critical
  }
}
