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
import { runEljurDiaryScrape } from '../scraper/eljur-diary.js';
import { captureSession, captureSessionAuto, validateSession } from '../scraper/browser.js';
import { captureEljurSession, captureEljurSessionAuto, validateEljurSession } from '../scraper/eljur-browser.js';

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
 * Handle an Eljur session capture request (manual or auto-login).
 */
async function handleEljurSessionCapture(
  runId: string,
  mode: 'eljur_capture_session' | 'eljur_auto_login',
): Promise<void> {
  if (isRunning) {
    logger.warn('Another operation in progress, skipping Eljur session capture');
    return;
  }

  isRunning = true;
  try {
    await supabase
      .from('scrape_runs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', runId);

    const result = mode === 'eljur_auto_login'
      ? await captureEljurSessionAuto()
      : await captureEljurSession();

    if (result.success) {
      await supabase
        .from('scrape_runs')
        .update({
          status: 'success',
          finished_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', runId);
      logger.info({ runId, mode }, 'Eljur session capture completed successfully');
    } else {
      await supabase
        .from('scrape_runs')
        .update({
          status: 'error',
          finished_at: new Date().toISOString(),
          error_message: result.error ?? 'Eljur session capture failed',
        })
        .eq('id', runId);
      logger.error({ runId, mode, error: result.error }, 'Eljur session capture failed');
    }
  } finally {
    isRunning = false;
  }
}

/**
 * Handle an Eljur diary scrape request.
 */
async function handleEljurDiaryScrape(runId: string): Promise<void> {
  if (isRunning) {
    logger.warn('Another operation in progress, skipping Eljur diary scrape');
    return;
  }

  isRunning = true;
  try {
    await runEljurDiaryScrape(runId);
  } finally {
    isRunning = false;
  }
}

/**
 * Handle a session capture request (manual or auto-login).
 */
async function handleSessionCapture(
  runId: string,
  mode: 'capture_session' | 'auto_login',
): Promise<void> {
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

    const result = mode === 'auto_login'
      ? await captureSessionAuto()
      : await captureSession();

    if (result.success) {
      await supabase
        .from('scrape_runs')
        .update({
          status: 'success',
          finished_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', runId);
      logger.info({ runId, mode }, 'Session capture completed successfully');
    } else {
      await supabase
        .from('scrape_runs')
        .update({
          status: 'error',
          finished_at: new Date().toISOString(),
          error_message: result.error ?? 'Session capture failed',
        })
        .eq('id', runId);
      logger.error({ runId, mode, error: result.error }, 'Session capture failed');
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
      logger.info({ sessionStatus: status }, 'Google Classroom session validation result');
    } catch (err) {
      logger.error({ err }, 'Google Classroom session validation cron failed');
    }
    try {
      const eljurStatus = await validateEljurSession();
      logger.info({ sessionStatus: eljurStatus }, 'Eljur session validation result');
    } catch (err) {
      logger.error({ err }, 'Eljur session validation cron failed');
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
      // Find the oldest pending, capture_session, or auto_login run
      // Note: force_save is handled inside captureSession() loop
      const { data: pendingRuns } = await supabase
        .from('scrape_runs')
        .select('id, status')
        .in('status', ['pending', 'capture_session', 'auto_login', 'eljur_capture_session', 'eljur_auto_login', 'eljur_scrape_diary'])
        .order('started_at', { ascending: true })
        .limit(1);

      if (pendingRuns && pendingRuns.length > 0) {
        const run = pendingRuns[0];
        const runId = run.id as string;
        const status = run.status as string;

        if (status === 'eljur_scrape_diary') {
          logger.info({ runId, status }, 'Found Eljur diary scrape request, starting');
          await handleEljurDiaryScrape(runId);
        } else if (status === 'eljur_capture_session' || status === 'eljur_auto_login') {
          logger.info({ runId, status }, 'Found Eljur session capture request, starting');
          await handleEljurSessionCapture(runId, status as 'eljur_capture_session' | 'eljur_auto_login');
        } else if (status === 'capture_session' || status === 'auto_login') {
          logger.info({ runId, status }, 'Found session capture request, starting');
          await handleSessionCapture(runId, status as 'capture_session' | 'auto_login');
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
