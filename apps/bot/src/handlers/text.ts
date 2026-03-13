/**
 * Natural language text handler.
 * All text messages are routed to the AI agent.
 */
import type { Context } from 'grammy';
import { logger } from '../logger.js';
import { isAuthorized } from '../middleware/auth.js';
import { runAgent, logIncomingMessage } from '../services/ai-agent.js';

const TG_MSG_LIMIT = 4096;

/** Split text into chunks that fit Telegram's message size limit, breaking at line boundaries. */
function splitMessage(text: string, limit = TG_MSG_LIMIT): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf('\n', limit);
    if (splitAt <= 0) splitAt = limit;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, '');
  }

  return chunks;
}

/** Send response chunks, falling back to plain text on HTML parse errors. */
async function sendResponse(ctx: Context, text: string): Promise<void> {
  const chunks = splitMessage(text);

  for (const chunk of chunks) {
    try {
      await ctx.reply(chunk, { parse_mode: 'HTML' });
    } catch {
      // HTML parse error or message too long — retry without formatting
      try {
        await ctx.reply(chunk);
      } catch (err) {
        logger.error({ err, chunkLength: chunk.length }, 'Failed to send message chunk');
      }
    }
  }
}

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

  // Keep "typing..." indicator alive while waiting for LLM
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction('typing').catch(() => {});
  }, 4000);
  await ctx.replyWithChatAction('typing');

  try {
    const response = await runAgent(telegramId, text);
    await sendResponse(ctx, response);
  } catch (err) {
    logger.error({ err, telegramId }, 'Unhandled error in text handler');
    try {
      await ctx.reply('Произошла ошибка при обработке запроса.');
    } catch { /* ignore */ }
  } finally {
    clearInterval(typingInterval);
  }
}
