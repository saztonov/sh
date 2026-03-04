import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabase } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import type { Course, CourseMapping } from '@homework/shared';

const patchCourseSchema = z.object({
  subject: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

const createMappingSchema = z.object({
  keyword: z.string().min(1),
  subject: z.string().nullable(),
  priority: z.number().int().min(0).default(0),
});

const updateMappingSchema = z.object({
  keyword: z.string().min(1).optional(),
  subject: z.string().nullable().optional(),
  priority: z.number().int().min(0).optional(),
});

const courseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /courses - list all courses
   */
  fastify.get('/courses', async (request, reply) => {
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .order('classroom_name', { ascending: true });

    if (error) {
      request.log.error(error, 'Failed to fetch courses');
      return reply.code(500).send({ error: 'Failed to fetch courses' });
    }

    return { data: data as Course[] };
  });

  /**
   * GET /courses/active-subjects - distinct subjects with at least one active course
   */
  fastify.get('/courses/active-subjects', async (request, reply) => {
    const { data, error } = await supabase
      .from('courses')
      .select('subject')
      .eq('is_active', true)
      .not('subject', 'is', null);

    if (error) {
      request.log.error(error, 'Failed to fetch active subjects');
      return reply.code(500).send({ error: 'Failed to fetch active subjects' });
    }

    const subjects = [...new Set((data ?? []).map((r) => r.subject as string))].sort();
    return { data: subjects };
  });

  /**
   * PATCH /courses/:id - update subject and/or is_active
   */
  fastify.patch<{ Params: { id: string } }>('/courses/:id', async (request, reply) => {
    const { id } = request.params;
    const parsed = patchCourseSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject;
    if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;

    const { data, error } = await supabase
      .from('courses')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      request.log.error(error, 'Failed to update course');
      return reply.code(404).send({ error: 'Course not found or update failed' });
    }

    return { data: data as Course };
  });

  /**
   * GET /course-mappings - list all mappings ordered by priority DESC
   */
  fastify.get('/course-mappings', async (request, reply) => {
    const { data, error } = await supabase
      .from('course_mappings')
      .select('*')
      .order('priority', { ascending: false });

    if (error) {
      request.log.error(error, 'Failed to fetch course mappings');
      return reply.code(500).send({ error: 'Failed to fetch course mappings' });
    }

    return { data: data as CourseMapping[] };
  });

  /**
   * POST /course-mappings - create a new mapping
   */
  fastify.post('/course-mappings', async (request, reply) => {
    const parsed = createMappingSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const { data, error } = await supabase
      .from('course_mappings')
      .insert(parsed.data)
      .select('*')
      .single();

    if (error) {
      request.log.error(error, 'Failed to create course mapping');
      return reply.code(500).send({ error: 'Failed to create course mapping' });
    }

    return reply.code(201).send({ data: data as CourseMapping });
  });

  /**
   * PUT /course-mappings/:id - update a mapping
   */
  fastify.put<{ Params: { id: string } }>('/course-mappings/:id', async (request, reply) => {
    const { id } = request.params;
    const parsed = updateMappingSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const { data, error } = await supabase
      .from('course_mappings')
      .update(parsed.data)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      request.log.error(error, 'Failed to update course mapping');
      return reply.code(404).send({ error: 'Course mapping not found or update failed' });
    }

    return { data: data as CourseMapping };
  });

  /**
   * DELETE /course-mappings/:id - delete a mapping
   */
  fastify.delete<{ Params: { id: string } }>('/course-mappings/:id', async (request, reply) => {
    const { id } = request.params;

    const { error } = await supabase
      .from('course_mappings')
      .delete()
      .eq('id', id);

    if (error) {
      request.log.error(error, 'Failed to delete course mapping');
      return reply.code(500).send({ error: 'Failed to delete course mapping' });
    }

    return reply.code(204).send();
  });
};

export default courseRoutes;
