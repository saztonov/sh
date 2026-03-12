/**
 * Natural language text handler.
 * All text messages are routed to the AI agent.
 */
import type { Context } from 'grammy';
import { logger } from '../logger.js';
import { isAuthorized } from '../middleware/auth.js';
import { runAgent, logIncomingMessage } from '../services/ai-agent.js';

/**
 * Handle natural language text messages.
 */
export async function textHandler(ctx: Context): Promise<void> {
  const text = ctx.message?.text?.trim();
  if (!text) return;

  if (!(await isAuthorized(ctx))) return;

  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  // Log every incoming message
  await logIncomingMessage(telegramId, text);

  // Route to AI agent
  logger.debug({ text }, 'Routing text to AI agent');
  await ctx.replyWithChatAction('typing');
  const response = await runAgent(telegramId, text);
  await ctx.reply(response, { parse_mode: 'HTML' });
}
