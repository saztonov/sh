/**
 * /start command handler.
 * Welcomes the user and handles authorization.
 * - If telegram_id matches TELEGRAM_ADMIN_ID, auto-authorize.
 * - Otherwise create a telegram_users record with is_authorized=false.
 */
import type { CommandContext, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { supabase } from '../db.js';
import { logger } from '../logger.js';

export async function startCommand(ctx: CommandContext<Context>): Promise<void> {
  const telegramId = ctx.from?.id;
  const username = ctx.from?.username ?? null;

  if (!telegramId) {
    await ctx.reply('Не удалось определить ваш Telegram ID.');
    return;
  }

  logger.info({ telegramId, username }, '/start command received');

  // Check if user already exists
  const { data: existing } = await supabase
    .from('telegram_users')
    .select('id, is_authorized')
    .eq('telegram_id', telegramId)
    .single();

  const isAdmin = telegramId === config.telegram.adminId;

  if (existing) {
    if (existing.is_authorized) {
      await ctx.reply(
        'Добро пожаловать обратно! Вы уже авторизованы.\n\n' +
        'Доступные команды:\n' +
        '/today -- задания на сегодня\n' +
        '/tomorrow -- задания на завтра\n' +
        '/week -- задания на неделю\n' +
        '/schedule -- расписание на сегодня',
      );
      return;
    }

    // Auto-authorize admin
    if (isAdmin) {
      await supabase
        .from('telegram_users')
        .update({ is_authorized: true })
        .eq('id', existing.id);

      await ctx.reply(
        'Вы авторизованы как администратор.\n\n' +
        'Доступные команды:\n' +
        '/today -- задания на сегодня\n' +
        '/tomorrow -- задания на завтра\n' +
        '/week -- задания на неделю\n' +
        '/schedule -- расписание на сегодня',
      );
      return;
    }

    await ctx.reply('Ваш запрос на доступ уже отправлен. Ожидайте подтверждения.');
    // Re-send notification to admin in case they missed it
    await notifyAdminAboutNewUser(ctx, telegramId, username);
    return;
  }

  // Create new user record
  const { error } = await supabase.from('telegram_users').insert({
    telegram_id: telegramId,
    telegram_username: username,
    is_authorized: isAdmin,
  });

  if (error) {
    logger.error({ error, telegramId }, 'Failed to create telegram user');
    await ctx.reply('Произошла ошибка. Попробуйте позже.');
    return;
  }

  if (isAdmin) {
    await ctx.reply(
      'Добро пожаловать! Вы авторизованы как администратор.\n\n' +
      'Доступные команды:\n' +
      '/today -- задания на сегодня\n' +
      '/tomorrow -- задания на завтра\n' +
      '/week -- задания на неделю\n' +
      '/schedule -- расписание на сегодня',
    );
  } else {
    await ctx.reply(
      'Добро пожаловать! Для доступа к боту необходима авторизация.\n' +
      'Ожидайте подтверждения.',
    );

    // Notify admin with inline approve/reject buttons
    await notifyAdminAboutNewUser(ctx, telegramId, username);
  }
}

async function notifyAdminAboutNewUser(
  ctx: CommandContext<Context>,
  telegramId: number,
  username: string | null,
): Promise<void> {
  try {
    const displayName = username ? `@${username}` : `ID ${telegramId}`;
    const keyboard = new InlineKeyboard()
      .text('Подтвердить', `auth_approve:${telegramId}`)
      .text('Отклонить', `auth_reject:${telegramId}`);

    await ctx.api.sendMessage(
      config.telegram.adminId,
      `Новый запрос на доступ от ${displayName}`,
      { reply_markup: keyboard },
    );
  } catch (err) {
    logger.warn({ err, telegramId }, 'Failed to notify admin about new user');
  }
}
