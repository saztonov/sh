import type { FastifyPluginAsync } from 'fastify';
import { supabase } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import type { ScrapeRun } from '@homework/shared';

const scraperRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * POST /scraper/trigger - insert a new scrape_run with status 'pending'
   */
  fastify.post('/scraper/trigger', async (request, reply) => {
    const { data, error } = await supabase
      .from('scrape_runs')
      .insert({
        status: 'pending',
        started_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      request.log.error(error, 'Failed to trigger scrape run');
      return reply.code(500).send({ error: 'Failed to trigger scrape run' });
    }

    return reply.code(201).send({ data: data as ScrapeRun });
  });

  /**
   * POST /scraper/capture-session - insert a scrape_run with status 'capture_session'
   * The scraper process picks this up and opens a visible browser for login.
   */
  fastify.post('/scraper/capture-session', async (request, reply) => {
    const { data, error } = await supabase
      .from('scrape_runs')
      .insert({
        status: 'capture_session',
        started_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      request.log.error(error, 'Failed to trigger session capture');
      return reply.code(500).send({ error: 'Failed to trigger session capture' });
    }

    return reply.code(201).send({ data: data as ScrapeRun });
  });

  /**
   * GET /scraper/session-status - check if a valid session file exists
   * Returns: { status: 'valid' | 'invalid' | 'no_session' | 'unknown', checked_at: string | null }
   */
  fastify.get('/scraper/session-status', async (_request, reply) => {
    // Check the latest session validation result from scrape_runs
    // A capture_session run with status 'success' means session was captured.
    // We also look at the last validation check stored as a special scrape_run.
    const { data: lastCapture } = await supabase
      .from('scrape_runs')
      .select('*')
      .in('status', ['success', 'error'])
      .order('finished_at', { ascending: false })
      .limit(1)
      .single();

    // Check if there's a pending capture_session
    const { data: pendingCapture } = await supabase
      .from('scrape_runs')
      .select('id')
      .eq('status', 'capture_session')
      .limit(1);

    const isCapturing = pendingCapture && pendingCapture.length > 0;

    // Try to determine session status from the latest successful scrape or capture
    // If the last run was successful, session is likely valid
    // If error with 'login' or 'session' in message, session is likely invalid
    let sessionStatus: 'valid' | 'invalid' | 'no_session' | 'unknown' = 'unknown';
    let checkedAt: string | null = null;

    if (lastCapture) {
      checkedAt = lastCapture.finished_at;
      if (lastCapture.status === 'success') {
        sessionStatus = 'valid';
      } else if (lastCapture.error_message?.toLowerCase().includes('session')) {
        sessionStatus = 'invalid';
      }
    }

    return reply.send({
      data: {
        status: sessionStatus,
        checked_at: checkedAt,
        is_capturing: isCapturing,
      },
    });
  });

  /**
   * GET /scraper/status - return the latest scrape_run
   */
  fastify.get('/scraper/status', async (request, reply) => {
    const { data, error } = await supabase
      .from('scrape_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // If no rows exist, single() returns an error, handle gracefully
      if (error.code === 'PGRST116') {
        return { data: null };
      }
      request.log.error(error, 'Failed to fetch scraper status');
      return reply.code(500).send({ error: 'Failed to fetch scraper status' });
    }

    return { data: data as ScrapeRun };
  });

  /**
   * GET /scraper/history - return last 20 scrape_runs ordered by started_at DESC
   */
  fastify.get('/scraper/history', async (request, reply) => {
    const { data, error } = await supabase
      .from('scrape_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);

    if (error) {
      request.log.error(error, 'Failed to fetch scraper history');
      return reply.code(500).send({ error: 'Failed to fetch scraper history' });
    }

    return { data: (data ?? []) as ScrapeRun[] };
  });
};

export default scraperRoutes;
