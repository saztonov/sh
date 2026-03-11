/**
 * Create and configure the Grammy Bot instance.
 * Registers all commands and text handlers.
 */
import { Bot } from 'grammy';
import { config } from './config.js';
import { logger } from './logger.js';
import { startCommand } from './commands/start.js';
import { todayCommand } from './commands/today.js';
import { tomorrowCommand } from './commands/tomorrow.js';
import { weekCommand } from './commands/week.js';
import { scheduleCommand } from './commands/schedule.js';
import { resetCommand } from './commands/reset.js';
import { authorizeCommand } from './commands/authorize.js';
import { textHandler } from './handlers/text.js';

export function createBot(): Bot {
  const bot = new Bot(config.telegram.botToken);

  // Error handler
  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update }, 'Bot error');
  });

  // Register commands
  bot.command('start', startCommand);
  bot.command('today', todayCommand);
  bot.command('tomorrow', tomorrowCommand);
  bot.command('week', weekCommand);
  bot.command('schedule', scheduleCommand);
  bot.command('reset', resetCommand);
  bot.command('authorize', authorizeCommand);

  // Natural language text handler (must be registered after commands)
  bot.on('message:text', textHandler);

  logger.info('Bot commands registered');

  return bot;
}
