/**
 * Entry point for the homework scraper application.
 *
 * - Loads configuration
 * - Sets up cron schedule for automatic scraping
 * - Sets up polling for manually-triggered scrape runs
 * - Optionally runs an immediate scrape when --now flag is passed
 */
import { logger } from './logger.js';

async function main(): Promise<void> {
  // Validate config — if env vars are missing, log warning and keep running
  let config: typeof import('./config.js').config;
  try {
    config = (await import('./config.js')).config;
  } catch (err) {
    logger.warn({ err }, 'Scraper config incomplete — running in standby mode. Fix .env and restart.');
    // Keep process alive so it doesn't crash other dev services
    await new Promise(() => {});
    return;
  }

  // Check that Playwright is available
  try {
    await import('playwright');
  } catch {
    logger.warn('Playwright not installed. Run: npx playwright install chromium');
    logger.warn('Scraper running in standby mode — will poll for pending runs but cannot scrape.');
  }

  const { setupCronSchedule, setupPendingRunsPoller, setupSessionValidationCron } = await import('./scheduler/cron.js');
  const { runScrape } = await import('./scraper/classroom.js');

  logger.info({
    cron: config.scrape.cron,
    headless: config.playwright.headless,
    s3Bucket: config.s3.bucket,
  }, 'Homework scraper starting');

  // Set up scheduled scraping via cron
  const cronTask = setupCronSchedule();

  // Set up polling for pending scrape runs (triggered from web UI)
  const pollInterval = setupPendingRunsPoller();

  // Set up session validation cron (2x daily)
  const sessionValidationTask = setupSessionValidationCron();

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
    sessionValidationTask.stop();
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
