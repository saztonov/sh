import type { FastifyPluginAsync } from 'fastify';
import { supabase } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import type { ScrapeRun, ScrapeLog } from '@homework/shared';

const scraperRoutes: FastifyPluginAsync = async (fastify) => {
  // Diagnostic log: check if auto-login env vars are available
  const hasGoogleEmail = !!process.env.GOOGLE_EMAIL;
  const hasGooglePassword = !!process.env.GOOGLE_PASSWORD;
  const hasEljurVendor = !!process.env.ELJUR_VENDOR;
  const hasEljurLogin = !!process.env.ELJUR_LOGIN;
  const hasEljurPassword = !!process.env.ELJUR_PASSWORD;
  fastify.log.info(
    { hasGoogleEmail, hasGooglePassword, hasEljurVendor, hasEljurLogin, hasEljurPassword },
    'Scraper routes registered — auto-login env vars status',
  );

  fastify.addHook('preHandler', authMiddleware);

  // ─── Google Classroom endpoints ───

  /**
   * POST /scraper/trigger - insert a new scrape_run with status 'pending'
   */
  fastify.post('/scraper/trigger', async (request, reply) => {
    const { data, error } = await supabase
      .from('scrape_runs')
      .insert({
        status: 'pending',
        started_at: new Date().toISOString(),
        source: 'google',
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
   */
  fastify.post('/scraper/capture-session', async (request, reply) => {
    const { data, error } = await supabase
      .from('scrape_runs')
      .insert({
        status: 'capture_session',
        started_at: new Date().toISOString(),
        source: 'google',
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
   * POST /scraper/force-save-session - signal the scraper to save current browser session immediately.
   */
  fastify.post('/scraper/force-save-session', async (request, reply) => {
    const { data, error } = await supabase
      .from('scrape_runs')
      .insert({
        status: 'force_save',
        started_at: new Date().toISOString(),
        source: 'google',
      })
      .select('*')
      .single();

    if (error) {
      request.log.error(error, 'Failed to trigger force save');
      return reply.code(500).send({ error: 'Failed to trigger force save' });
    }

    return reply.code(201).send({ data: data as ScrapeRun });
  });

  /**
   * POST /scraper/auto-login - insert a scrape_run with status 'auto_login'.
   */
  fastify.post('/scraper/auto-login', async (request, reply) => {
    const { data, error } = await supabase
      .from('scrape_runs')
      .insert({
        status: 'auto_login',
        started_at: new Date().toISOString(),
        source: 'google',
      })
      .select('*')
      .single();

    if (error) {
      request.log.error(error, 'Failed to trigger auto-login');
      return reply.code(500).send({ error: 'Failed to trigger auto-login' });
    }

    return reply.code(201).send({ data: data as ScrapeRun });
  });

  /**
   * GET /scraper/auto-login-available - check if GOOGLE_EMAIL is configured.
   */
  fastify.get('/scraper/auto-login-available', async (request, reply) => {
    const available = hasGoogleEmail && hasGooglePassword;
    request.log.info({ available }, 'Google auto-login availability check');
    return reply.send({ data: { available } });
  });

  /**
   * GET /scraper/session-status - Google Classroom session status.
   */
  fastify.get('/scraper/session-status', async (_request, reply) => {
    const { data: lastCapture } = await supabase
      .from('scrape_runs')
      .select('*')
      .in('status', ['success', 'error'])
      .or('source.is.null,source.eq.google')
      .order('finished_at', { ascending: false })
      .limit(1)
      .single();

    const { data: pendingCapture } = await supabase
      .from('scrape_runs')
      .select('id, status')
      .in('status', ['capture_session', 'auto_login', 'force_save'])
      .limit(1);

    const { data: runningCapture } = await supabase
      .from('scrape_runs')
      .select('id, source')
      .eq('status', 'running')
      .or('source.is.null,source.eq.google')
      .limit(1);

    const isCapturing =
      (pendingCapture && pendingCapture.length > 0) ||
      (runningCapture && runningCapture.length > 0);

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

  // ─── Eljur endpoints ───

  /**
   * POST /scraper/eljur/trigger - insert a new scrape_run with status 'eljur_scrape_diary'
   */
  fastify.post('/scraper/eljur/trigger', async (request, reply) => {
    const { data, error } = await supabase
      .from('scrape_runs')
      .insert({
        status: 'eljur_scrape_diary',
        started_at: new Date().toISOString(),
        source: 'eljur',
      })
      .select('*')
      .single();

    if (error) {
      request.log.error(error, 'Failed to trigger Eljur diary scrape');
      return reply.code(500).send({ error: 'Failed to trigger Eljur diary scrape' });
    }

    return reply.code(201).send({ data: data as ScrapeRun });
  });

  /**
   * POST /scraper/eljur/capture-session
   */
  fastify.post('/scraper/eljur/capture-session', async (request, reply) => {
    const { data, error } = await supabase
      .from('scrape_runs')
      .insert({
        status: 'eljur_capture_session',
        started_at: new Date().toISOString(),
        source: 'eljur',
      })
      .select('*')
      .single();

    if (error) {
      request.log.error(error, 'Failed to trigger Eljur session capture');
      return reply.code(500).send({ error: 'Failed to trigger Eljur session capture' });
    }

    return reply.code(201).send({ data: data as ScrapeRun });
  });

  /**
   * POST /scraper/eljur/force-save-session
   */
  fastify.post('/scraper/eljur/force-save-session', async (request, reply) => {
    const { data, error } = await supabase
      .from('scrape_runs')
      .insert({
        status: 'eljur_force_save',
        started_at: new Date().toISOString(),
        source: 'eljur',
      })
      .select('*')
      .single();

    if (error) {
      request.log.error(error, 'Failed to trigger Eljur force save');
      return reply.code(500).send({ error: 'Failed to trigger Eljur force save' });
    }

    return reply.code(201).send({ data: data as ScrapeRun });
  });

  /**
   * POST /scraper/eljur/auto-login
   */
  fastify.post('/scraper/eljur/auto-login', async (request, reply) => {
    const { data, error } = await supabase
      .from('scrape_runs')
      .insert({
        status: 'eljur_auto_login',
        started_at: new Date().toISOString(),
        source: 'eljur',
      })
      .select('*')
      .single();

    if (error) {
      request.log.error(error, 'Failed to trigger Eljur auto-login');
      return reply.code(500).send({ error: 'Failed to trigger Eljur auto-login' });
    }

    return reply.code(201).send({ data: data as ScrapeRun });
  });

  /**
   * GET /scraper/eljur/auto-login-available
   */
  fastify.get('/scraper/eljur/auto-login-available', async (request, reply) => {
    const available = hasEljurVendor && hasEljurLogin && hasEljurPassword;
    request.log.info({ available }, 'Eljur auto-login availability check');
    return reply.send({ data: { available } });
  });

  /**
   * GET /scraper/eljur/session-status
   */
  fastify.get('/scraper/eljur/session-status', async (_request, reply) => {
    const { data: lastCapture } = await supabase
      .from('scrape_runs')
      .select('*')
      .in('status', ['success', 'error'])
      .eq('source', 'eljur')
      .order('finished_at', { ascending: false })
      .limit(1)
      .single();

    const { data: pendingCapture } = await supabase
      .from('scrape_runs')
      .select('id, status')
      .in('status', ['eljur_capture_session', 'eljur_auto_login', 'eljur_force_save'])
      .limit(1);

    const { data: runningCapture } = await supabase
      .from('scrape_runs')
      .select('id')
      .eq('status', 'running')
      .eq('source', 'eljur')
      .limit(1);

    const isCapturing =
      (pendingCapture && pendingCapture.length > 0) ||
      (runningCapture && runningCapture.length > 0);

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

  // ─── Combined endpoints ───

  /**
   * POST /scraper/trigger-all - insert a single scrape_run with status 'scrape_all'
   * The scraper will execute Google Classroom → Eljur sequentially.
   */
  fastify.post('/scraper/trigger-all', async (request, reply) => {
    const { data, error } = await supabase
      .from('scrape_runs')
      .insert({
        status: 'scrape_all',
        started_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      request.log.error(error, 'Failed to trigger combined scrape');
      return reply.code(500).send({ error: 'Failed to trigger combined scrape' });
    }

    return reply.code(201).send({ data: data as ScrapeRun });
  });

  // ─── Common endpoints ───

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

  /**
   * GET /scraper/logs/:runId - return all scrape_logs for a given run
   */
  fastify.get<{ Params: { runId: string } }>('/scraper/logs/:runId', async (request, reply) => {
    const { runId } = request.params;

    const { data, error } = await supabase
      .from('scrape_logs')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });

    if (error) {
      request.log.error(error, 'Failed to fetch scrape logs');
      return reply.code(500).send({ error: 'Failed to fetch scrape logs' });
    }

    return { data: (data ?? []) as ScrapeLog[] };
  });

  /**
   * GET /scraper/scrape-logs - paginated scrape_runs history
   */
  fastify.get<{ Querystring: { page?: string; pageSize?: string } }>(
    '/scraper/scrape-logs',
    async (request, reply) => {
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(request.query.pageSize ?? '20', 10) || 20));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from('scrape_runs')
        .select('*', { count: 'exact' })
        .order('started_at', { ascending: false })
        .range(from, to);

      if (error) {
        request.log.error(error, 'Failed to fetch scrape logs page');
        return reply.code(500).send({ error: 'Failed to fetch scrape logs' });
      }

      return { data: (data ?? []) as ScrapeRun[], total: count ?? 0 };
    },
  );
};

export default scraperRoutes;
