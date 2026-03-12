/**
 * Callback query handler for inline authorization buttons.
 * Handles auth_approve:<telegram_id> and auth_reject:<telegram_id> callbacks.
 */
import type { CallbackQueryContext, Context } from 'grammy';
import { config } from '../config.js';
import { supabase } from '../db.js';
import { logger } from '../logger.js';

export async function authCallbackHandler(ctx: CallbackQueryContext<Context>): Promise<void> {
  const callerId = ctx.from?.id;
  if (callerId !== config.telegram.adminId) {
    await ctx.answerCallbackQuery({ text: 'Только администратор может это сделать.' });
    return;
  }

  const data = ctx.callbackQuery.data;
  if (!data) return;

  const match = data.match(/^auth_(approve|reject):(\d+)$/);
  if (!match) return;

  const action = match[1];
  const targetId = parseInt(match[2], 10);

  if (action === 'approve') {
    const { data: user, error: fetchError } = await supabase
      .from('telegram_users')
      .select('id, telegram_username, is_authorized')
      .eq('telegram_id', targetId)
      .single();

    if (fetchError || !user) {
      await ctx.answerCallbackQuery({ text: 'Пользователь не найден.' });
      return;
    }

    if (user.is_authorized) {
      const name = user.telegram_username ? `@${user.telegram_username}` : `ID ${targetId}`;
      await ctx.editMessageText(`${name} — уже авторизован.`);
      await ctx.answerCallbackQuery();
      return;
    }

    const { error: updateError } = await supabase
      .from('telegram_users')
      .update({ is_authorized: true })
      .eq('id', user.id);

    if (updateError) {
      logger.error({ updateError, targetId }, 'Failed to authorize user via callback');
      await ctx.answerCallbackQuery({ text: 'Ошибка при авторизации.' });
      return;
    }

    const name = user.telegram_username ? `@${user.telegram_username}` : `ID ${targetId}`;
    logger.info({ targetId, name }, 'User authorized via inline button');
    await ctx.editMessageText(`${name} — авторизован.`);
    await ctx.answerCallbackQuery({ text: 'Пользователь авторизован.' });

    // Notify the user
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
      // User may have blocked the bot
    }
  } else {
    // Reject
    const { data: user } = await supabase
      .from('telegram_users')
      .select('telegram_username')
      .eq('telegram_id', targetId)
      .single();

    const name = user?.telegram_username ? `@${user.telegram_username}` : `ID ${targetId}`;
    await ctx.editMessageText(`${name} — отклонён.`);
    await ctx.answerCallbackQuery({ text: 'Запрос отклонён.' });

    logger.info({ targetId, name }, 'User rejected via inline button');

    // Notify the user
    try {
      await ctx.api.sendMessage(targetId, 'Ваш запрос на доступ отклонён.');
    } catch {
      // User may have blocked the bot
    }
  }
}
