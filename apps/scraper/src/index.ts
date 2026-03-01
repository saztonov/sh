/**
 * Entry point for the homework scraper application.
 *
 * - Loads configuration
 * - Sets up cron schedule for automatic scraping
 * - Sets up polling for manually-triggered scrape runs
 * - Optionally runs an immediate scrape when --now flag is passed
 */
import { config } from './config.js';
import { logger } from './logger.js';
import { setupCronSchedule, setupPendingRunsPoller } from './scheduler/cron.js';
import { runScrape } from './scraper/classroom.js';

async function main(): Promise<void> {
  logger.info({
    cron: config.scrape.cron,
    headless: config.playwright.headless,
    s3Bucket: config.s3.bucket,
  }, 'Homework scraper starting');

  // Set up scheduled scraping via cron
  const cronTask = setupCronSchedule();

  // Set up polling for pending scrape runs
  const pollInterval = setupPendingRunsPoller();

  // Run an immediate scrape if --now flag is passed
  const args = process.argv.slice(2);
  if (args.includes('--now')) {
    logger.info('--now flag detected, running immediate scrape');
    await runScrape();
  }

  // Graceful shutdown
  const shutdown = (): void => {
    logger.info('Shutting down...');
    cronTask.stop();
    clearInterval(pollInterval);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('Scraper is running. Waiting for schedule or pending runs...');
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Fatal error in scraper');
  process.exit(1);
});
