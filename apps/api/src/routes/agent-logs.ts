/**
 * Agent logs API — admin only.
 * Provides paginated log access and token usage statistics.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabase } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
  telegram_id: z.coerce.number().int().optional(),
  event_type: z.string().optional(),
  provider: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  session_id: z.string().uuid().optional(),
});

const agentLogsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', adminMiddleware);

  // GET /agent-logs — paginated list with filters
  fastify.get('/agent-logs', async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }

    const { page, page_size, telegram_id, event_type, provider, date_from, date_to, session_id } =
      query.data;
    const offset = (page - 1) * page_size;

    let q = supabase
      .from('agent_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + page_size - 1);

    if (telegram_id !== undefined) q = q.eq('telegram_id', telegram_id);
    if (event_type) q = q.eq('event_type', event_type);
    if (provider) q = q.eq('provider', provider);
    if (session_id) q = q.eq('session_id', session_id);
    if (date_from) q = q.gte('created_at', date_from);
    if (date_to) q = q.lte('created_at', date_to + 'T23:59:59Z');

    const { data, error, count } = await q;
    if (error) return reply.code(500).send({ error: error.message });

    return reply.send({
      data,
      pagination: {
        page,
        page_size,
        total: count ?? 0,
        total_pages: Math.ceil((count ?? 0) / page_size),
      },
    });
  });

  // GET /agent-logs/session/:sessionId — all events for a session
  fastify.get('/agent-logs/session/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    const { data, error } = await supabase
      .from('agent_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ data });
  });

  // GET /agent-logs/stats — token usage statistics
  fastify.get('/agent-logs/stats', async (request, reply) => {
    const querySchema = z.object({
      period: z.enum(['day', 'week', 'month', 'all']).default('week'),
    });
    const q = querySchema.safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: q.error.flatten() });

    const periodDays = { day: 1, week: 7, month: 30, all: 3650 };
    const days = periodDays[q.data.period];
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Total tokens
    const { data: totals, error: totErr } = await supabase
      .from('agent_logs')
      .select('tokens_in, tokens_out, provider, telegram_id')
      .gte('created_at', since)
      .eq('event_type', 'model_response');

    if (totErr) return reply.code(500).send({ error: totErr.message });

    const rows = totals ?? [];
    const totalIn = rows.reduce((s, r) => s + (r.tokens_in ?? 0), 0);
    const totalOut = rows.reduce((s, r) => s + (r.tokens_out ?? 0), 0);

    // By provider
    const byProvider: Record<string, { tokens_in: number; tokens_out: number; requests: number }> =
      {};
    for (const r of rows) {
      const p = r.provider ?? 'unknown';
      if (!byProvider[p]) byProvider[p] = { tokens_in: 0, tokens_out: 0, requests: 0 };
      byProvider[p].tokens_in += r.tokens_in ?? 0;
      byProvider[p].tokens_out += r.tokens_out ?? 0;
      byProvider[p].requests += 1;
    }

    // By user
    const byUser: Record<string, { tokens_in: number; tokens_out: number; requests: number }> = {};
    for (const r of rows) {
      const u = String(r.telegram_id ?? 'unknown');
      if (!byUser[u]) byUser[u] = { tokens_in: 0, tokens_out: 0, requests: 0 };
      byUser[u].tokens_in += r.tokens_in ?? 0;
      byUser[u].tokens_out += r.tokens_out ?? 0;
      byUser[u].requests += 1;
    }

    // Session count
    const { data: sessions } = await supabase
      .from('agent_logs')
      .select('session_id')
      .gte('created_at', since)
      .eq('event_type', 'user_message');

    const uniqueSessions = new Set((sessions ?? []).map((s) => s.session_id)).size;

    return reply.send({
      period: q.data.period,
      since,
      totals: {
        tokens_in: totalIn,
        tokens_out: totalOut,
        tokens_total: totalIn + totalOut,
        requests: rows.length,
        sessions: uniqueSessions,
      },
      by_provider: byProvider,
      by_user: byUser,
    });
  });
};

export default agentLogsRoutes;
