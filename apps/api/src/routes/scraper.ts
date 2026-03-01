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
