/**
 * Scheduling logic for the scraper.
 * - Cron job triggers scrapes on a schedule (SCRAPE_CRON)
 * - Polling loop checks for 'pending' scrape_runs (for manual trigger via UI/API)
 */
import cron from 'node-cron';
import { config } from '../config.js';
import { supabase } from '../db.js';
import { logger } from '../logger.js';
import { runScrape } from '../scraper/classroom.js';

let isRunning = false;

/**
 * Guard to prevent concurrent scrape runs.
 */
async function guardedScrape(runId?: string): Promise<void> {
  if (isRunning) {
    logger.warn('Scrape already in progress, skipping');
    return;
  }

  isRunning = true;
  try {
    await runScrape(runId);
  } finally {
    isRunning = false;
  }
}

/**
 * Set up the cron job for scheduled scraping.
 */
export function setupCronSchedule(): cron.ScheduledTask {
  const cronExpression = config.scrape.cron;

  logger.info({ cron: cronExpression }, 'Setting up scrape cron schedule');

  const task = cron.schedule(cronExpression, () => {
    logger.info('Cron triggered scrape');
    guardedScrape().catch((err) => {
      logger.error({ err }, 'Cron scrape failed');
    });
  });

  return task;
}

/**
 * Poll the scrape_runs table for 'pending' entries.
 * When found, claim and run them. This supports manual trigger from the UI/API.
 */
export function setupPendingRunsPoller(): NodeJS.Timeout {
  const intervalMs = config.scrape.pollIntervalMs;

  logger.info(
    { intervalMs },
    'Setting up pending scrape runs poller',
  );

  const interval = setInterval(async () => {
    if (isRunning) return;

    try {
      // Find the oldest pending run
      const { data: pendingRuns } = await supabase
        .from('scrape_runs')
        .select('id')
        .eq('status', 'pending')
        .order('started_at', { ascending: true })
        .limit(1);

      if (pendingRuns && pendingRuns.length > 0) {
        const runId = pendingRuns[0].id as string;
        logger.info({ runId }, 'Found pending scrape run, starting');
        await guardedScrape(runId);
      }
    } catch (err) {
      logger.error({ err }, 'Error polling for pending runs');
    }
  }, intervalMs);

  return interval;
}
