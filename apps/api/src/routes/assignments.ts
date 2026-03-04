import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import { supabase } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AssignmentWithCourse, AssignmentDetail } from '@homework/shared';

dayjs.extend(isoWeek);

const listQuerySchema = z.object({
  status: z.enum(['not_turned_in', 'turned_in', 'graded', 'returned']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  completed: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const patchBodySchema = z.object({
  is_completed: z.boolean(),
});

const assignmentRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /assignments - list assignments with optional filters & pagination
   */
  fastify.get('/assignments', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    }

    const { status, from, to, subject, completed, limit, offset } = parsed.data;

    let query = supabase
      .from('assignments')
      .select('*, course:courses!inner(classroom_name, subject)', { count: 'exact' })
      .eq('course.is_active', true)
      .order('due_date', { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (from) {
      query = query.gte('due_date', from);
    }
    if (to) {
      query = query.lte('due_date', to);
    }
    if (completed !== undefined) {
      query = query.eq('is_completed', completed);
    }
    if (subject) {
      query = query.eq('course.subject', subject);
    }

    const { data, error, count } = await query;

    if (error) {
      request.log.error(error, 'Failed to fetch assignments');
      return reply.code(500).send({ error: 'Failed to fetch assignments' });
    }

    return { data: (data ?? []) as AssignmentWithCourse[], total: count, limit, offset };
  });

  /**
   * GET /assignments/today - assignments due today
   */
  fastify.get('/assignments/today', async (request, reply) => {
    const today = dayjs().format('YYYY-MM-DD');

    const { data, error } = await supabase
      .from('assignments')
      .select('*, course:courses!inner(classroom_name, subject)')
      .eq('course.is_active', true)
      .eq('due_date', today)
      .order('is_completed', { ascending: true });

    if (error) {
      request.log.error(error, 'Failed to fetch today assignments');
      return reply.code(500).send({ error: 'Failed to fetch assignments' });
    }

    return { data: data as AssignmentWithCourse[] };
  });

  /**
   * GET /assignments/tomorrow - assignments due tomorrow
   */
  fastify.get('/assignments/tomorrow', async (request, reply) => {
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');

    const { data, error } = await supabase
      .from('assignments')
      .select('*, course:courses!inner(classroom_name, subject)')
      .eq('course.is_active', true)
      .eq('due_date', tomorrow)
      .order('is_completed', { ascending: true });

    if (error) {
      request.log.error(error, 'Failed to fetch tomorrow assignments');
      return reply.code(500).send({ error: 'Failed to fetch assignments' });
    }

    return { data: data as AssignmentWithCourse[] };
  });

  /**
   * GET /assignments/week - assignments due within the current ISO week (Mon-Sun)
   */
  fastify.get('/assignments/week', async (request, reply) => {
    const monday = dayjs().isoWeekday(1).format('YYYY-MM-DD');
    const sunday = dayjs().isoWeekday(7).format('YYYY-MM-DD');

    const { data, error } = await supabase
      .from('assignments')
      .select('*, course:courses!inner(classroom_name, subject)')
      .eq('course.is_active', true)
      .gte('due_date', monday)
      .lte('due_date', sunday)
      .order('due_date', { ascending: true })
      .order('is_completed', { ascending: true });

    if (error) {
      request.log.error(error, 'Failed to fetch week assignments');
      return reply.code(500).send({ error: 'Failed to fetch assignments' });
    }

    return { data: data as AssignmentWithCourse[] };
  });

  /**
   * GET /assignments/:id - single assignment with attachments
   */
  fastify.get<{ Params: { id: string } }>('/assignments/:id', async (request, reply) => {
    const { id } = request.params;

    const { data: assignment, error: assignmentError } = await supabase
      .from('assignments')
      .select('*, course:courses(classroom_name, subject)')
      .eq('id', id)
      .single();

    if (assignmentError || !assignment) {
      return reply.code(404).send({ error: 'Assignment not found' });
    }

    const { data: attachments, error: attachmentsError } = await supabase
      .from('attachments')
      .select('*')
      .eq('assignment_id', id)
      .order('created_at', { ascending: true });

    if (attachmentsError) {
      request.log.error(attachmentsError, 'Failed to fetch attachments');
      return reply.code(500).send({ error: 'Failed to fetch attachments' });
    }

    const detail: AssignmentDetail = {
      ...assignment,
      attachments: attachments ?? [],
    };

    return { data: detail };
  });

  /**
   * PATCH /assignments/:id - update is_completed
   */
  fastify.patch<{ Params: { id: string } }>('/assignments/:id', async (request, reply) => {
    const { id } = request.params;
    const parsed = patchBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const { data, error } = await supabase
      .from('assignments')
      .update({ is_completed: parsed.data.is_completed, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      request.log.error(error, 'Failed to update assignment');
      return reply.code(404).send({ error: 'Assignment not found or update failed' });
    }

    return { data };
  });
};

export default assignmentRoutes;
