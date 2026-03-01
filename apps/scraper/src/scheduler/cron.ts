/**
 * Scheduling logic for the scraper.
 * - Cron job triggers scrapes on a schedule (SCRAPE_CRON)
 * - Polling loop checks for 'pending' and 'capture_session' scrape_runs
 * - Session validation runs twice daily (8:00 and 20:00)
 */
import cron from 'node-cron';
import { config } from '../config.js';
import { supabase } from '../db.js';
import { logger } from '../logger.js';
import { runScrape } from '../scraper/classroom.js';
import { captureSession, validateSession } from '../scraper/browser.js';

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
 * Handle a capture_session request: open visible browser for Google login.
 */
async function handleCaptureSession(runId: string): Promise<void> {
  if (isRunning) {
    logger.warn('Another operation in progress, skipping session capture');
    return;
  }

  isRunning = true;
  try {
    // Mark as running
    await supabase
      .from('scrape_runs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', runId);

    const result = await captureSession();

    if (result.success) {
      await supabase
        .from('scrape_runs')
        .update({
          status: 'success',
          finished_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', runId);
      logger.info({ runId }, 'Session capture completed successfully');
    } else {
      await supabase
        .from('scrape_runs')
        .update({
          status: 'error',
          finished_at: new Date().toISOString(),
          error_message: result.error ?? 'Session capture failed',
        })
        .eq('id', runId);
      logger.error({ runId, error: result.error }, 'Session capture failed');
    }
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
 * Set up session validation cron (runs at 8:00 and 20:00 daily).
 */
export function setupSessionValidationCron(): cron.ScheduledTask {
  const task = cron.schedule('0 8,20 * * *', async () => {
    logger.info('Running scheduled session validation');
    try {
      const status = await validateSession();
      logger.info({ sessionStatus: status }, 'Session validation result');
    } catch (err) {
      logger.error({ err }, 'Session validation cron failed');
    }
  });

  logger.info('Session validation cron set up (8:00, 20:00 daily)');
  return task;
}

/**
 * Poll the scrape_runs table for 'pending' and 'capture_session' entries.
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
      // Find the oldest pending or capture_session run
      const { data: pendingRuns } = await supabase
        .from('scrape_runs')
        .select('id, status')
        .in('status', ['pending', 'capture_session'])
        .order('started_at', { ascending: true })
        .limit(1);

      if (pendingRuns && pendingRuns.length > 0) {
        const run = pendingRuns[0];
        const runId = run.id as string;
        const status = run.status as string;

        if (status === 'capture_session') {
          logger.info({ runId }, 'Found capture_session request, starting');
          await handleCaptureSession(runId);
        } else {
          logger.info({ runId }, 'Found pending scrape run, starting');
          await guardedScrape(runId);
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error polling for pending runs');
    }
  }, intervalMs);

  return interval;
}
