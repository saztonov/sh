/**
 * /unresolved command handler.
 * Query and display unresolved difficulties.
 */
import type { CommandContext, Context } from 'grammy';
import { supabase } from '../db.js';
import { logger } from '../logger.js';
import { formatDifficultyList } from '../formatters/difficulty.js';
import { isAuthorized } from '../middleware/auth.js';

export async function unresolvedCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!(await isAuthorized(ctx))) return;

  logger.info('/unresolved command');

  const { data: difficulties, error } = await supabase
    .from('difficulties')
    .select('id, subject, title, comment, is_resolved, deadline, created_at')
    .eq('is_resolved', false)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    logger.error({ error }, 'Error fetching unresolved difficulties');
    await ctx.reply('Произошла ошибка при загрузке сложностей.');
    return;
  }

  if (!difficulties || difficulties.length === 0) {
    await ctx.reply('Нерешённых сложностей нет! 🎉');
    return;
  }

  const message = formatDifficultyList(difficulties);
  await ctx.reply(message, { parse_mode: 'HTML' });
}
