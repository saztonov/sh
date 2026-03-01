/**
 * Entry point for the homework Telegram bot.
 *
 * - Loads configuration
 * - Creates and starts the bot in long-polling mode
 * - Handles graceful shutdown on SIGINT/SIGTERM
 */
import { config } from './config.js';
import { logger } from './logger.js';
import { createBot } from './bot.js';

async function main(): Promise<void> {
  logger.info(
    { adminId: config.telegram.adminId },
    'Homework bot starting',
  );

  const bot = createBot();

  // Set bot commands for Telegram menu
  await bot.api.setMyCommands([
    { command: 'start', description: 'Начать работу с ботом' },
    { command: 'today', description: 'Задания на сегодня' },
    { command: 'tomorrow', description: 'Задания на завтра' },
    { command: 'week', description: 'Задания на неделю' },
    { command: 'schedule', description: 'Расписание на сегодня' },
  ]);

  // Graceful shutdown
  const shutdown = (): void => {
    logger.info('Shutting down bot...');
    bot.stop();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start long polling
  logger.info('Bot is starting long polling...');
  await bot.start({
    onStart: () => {
      logger.info('Bot is running');
    },
  });
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Fatal error in bot');
  process.exit(1);
});
