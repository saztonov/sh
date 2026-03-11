/**
 * /reset — clears the AI agent conversation history for the current user.
 */
import type { CommandContext, Context } from 'grammy';
import { isAuthorized } from '../middleware/auth.js';
import { resetConversation } from '../services/ai-agent.js';

export async function resetCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!(await isAuthorized(ctx))) return;
  const telegramId = ctx.from?.id;
  if (!telegramId) return;
  resetConversation(telegramId);
  await ctx.reply('Контекст диалога сброшен. Начинаем с чистого листа.');
}
