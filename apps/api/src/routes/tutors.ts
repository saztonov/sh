import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import { supabase } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import type {
  Tutor,
  TutorSession,
  TutorSessionException,
  TutorSessionResolved,
} from '@homework/shared';

dayjs.extend(isoWeek);

const weekOffsetSchema = z.object({
  week_offset: z.coerce.number().int().default(0),
});

const createTutorSchema = z.object({
  name: z.string().min(1),
});

const updateSubjectsSchema = z.object({
  subjects: z.array(z.string().min(1)),
});

const createSessionSchema = z.object({
  tutor_id: z.string().uuid(),
  subject: z.string().min(1),
  day_of_week: z.number().int().min(1).max(7),
  time_start: z.string().regex(/^\d{2}:\d{2}$/),
  duration_hours: z.number().refine((v) => [1, 1.5, 2].includes(v), { message: 'Must be 1, 1.5, or 2' }),
  is_recurring: z.boolean(),
  specific_date: z.string().nullable().optional(),
  effective_from: z.string().nullable().optional(),
});

const updateSessionSchema = z.object({
  time_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  duration_hours: z.number().refine((v) => [1, 1.5, 2].includes(v), { message: 'Must be 1, 1.5, or 2' }).optional(),
});

const rescheduleOneSchema = z.object({
  original_date: z.string(),
  new_date: z.string(),
  new_time: z.string().regex(/^\d{2}:\d{2}$/),
});

const rescheduleFollowingSchema = z.object({
  from_date: z.string(),
  new_day_of_week: z.number().int().min(1).max(7),
  new_time: z.string().regex(/^\d{2}:\d{2}$/),
});

const tutorRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authMiddleware);

  // ── Tutors directory ──

  fastify.get('/tutors', async (request, reply) => {
    const { data, error } = await supabase
      .from('tutors')
      .select('*, tutor_subjects(subject)')
      .order('name', { ascending: true });

    if (error) {
      request.log.error(error, 'Failed to fetch tutors');
      return reply.code(500).send({ error: 'Failed to fetch tutors' });
    }

    const tutors: Tutor[] = (data ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      subjects: (t.tutor_subjects ?? []).map((s: any) => s.subject),
      created_at: t.created_at,
    }));

    return { data: tutors };
  });

  fastify.post('/tutors', async (request, reply) => {
    const parsed = createTutorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const { data, error } = await supabase
      .from('tutors')
      .insert({ name: parsed.data.name })
      .select('*')
      .single();

    if (error) {
      request.log.error(error, 'Failed to create tutor');
      return reply.code(500).send({ error: 'Failed to create tutor' });
    }
    return reply.code(201).send({ data: data as Tutor });
  });

  fastify.put<{ Params: { id: string } }>('/tutors/:id', async (request, reply) => {
    const { id } = request.params;
    const parsed = createTutorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const { data, error } = await supabase
      .from('tutors')
      .update({ name: parsed.data.name })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      request.log.error(error, 'Failed to update tutor');
      return reply.code(404).send({ error: 'Tutor not found' });
    }
    return { data: data as Tutor };
  });

  fastify.delete<{ Params: { id: string } }>('/tutors/:id', async (request, reply) => {
    const { id } = request.params;
    const { error } = await supabase.from('tutors').delete().eq('id', id);

    if (error) {
      request.log.error(error, 'Failed to delete tutor');
      return reply.code(500).send({ error: 'Failed to delete tutor' });
    }
    return reply.code(204).send();
  });

  fastify.put<{ Params: { id: string } }>('/tutors/:id/subjects', async (request, reply) => {
    const { id } = request.params;
    const parsed = updateSubjectsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    // Delete existing subjects
    const { error: deleteError } = await supabase
      .from('tutor_subjects')
      .delete()
      .eq('tutor_id', id);

    if (deleteError) {
      request.log.error(deleteError, 'Failed to delete tutor subjects');
      return reply.code(500).send({ error: 'Failed to update subjects' });
    }

    // Insert new subjects
    if (parsed.data.subjects.length > 0) {
      const rows = parsed.data.subjects.map((subject) => ({ tutor_id: id, subject }));
      const { error: insertError } = await supabase
        .from('tutor_subjects')
        .insert(rows);

      if (insertError) {
        request.log.error(insertError, 'Failed to insert tutor subjects');
        return reply.code(500).send({ error: 'Failed to update subjects' });
      }
    }

    return { data: parsed.data.subjects };
  });

  // ── Tutor sessions ──

  /**
   * GET /tutor-sessions?week_offset=0
   * Returns resolved sessions for the target week.
   */
  fastify.get('/tutor-sessions', async (request, reply) => {
    const parsed = weekOffsetSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query parameters' });
    }

    const { week_offset } = parsed.data;
    const targetMonday = dayjs().isoWeekday(1).add(week_offset, 'week');
    const mondayStr = targetMonday.format('YYYY-MM-DD');
    const sundayStr = targetMonday.isoWeekday(7).format('YYYY-MM-DD');

    // Fetch all recurring sessions that overlap with this week
    const { data: sessions, error: sessionsError } = await supabase
      .from('tutor_sessions')
      .select('*, tutor:tutors!inner(name)')
      .order('day_of_week', { ascending: true })
      .order('time_start', { ascending: true });

    if (sessionsError) {
      request.log.error(sessionsError, 'Failed to fetch tutor sessions');
      return reply.code(500).send({ error: 'Failed to fetch tutor sessions' });
    }

    // Fetch exceptions for sessions that may affect this week
    const sessionIds = (sessions ?? []).map((s: any) => s.id);
    let exceptions: TutorSessionException[] = [];
    if (sessionIds.length > 0) {
      // Get exceptions where original_date is in this week OR new_date is in this week
      const { data: excData, error: excError } = await supabase
        .from('tutor_session_exceptions')
        .select('*')
        .in('session_id', sessionIds);

      if (excError) {
        request.log.error(excError, 'Failed to fetch session exceptions');
        return reply.code(500).send({ error: 'Failed to fetch session exceptions' });
      }
      exceptions = (excData ?? []) as TutorSessionException[];
    }

    // Build exception maps
    // session_id+original_date -> exception (cancelled or moved away)
    const cancelledMap = new Map<string, TutorSessionException>();
    // Exceptions that move sessions INTO this week
    const movedIntoWeek: { exception: TutorSessionException; session: any }[] = [];

    for (const exc of exceptions) {
      cancelledMap.set(`${exc.session_id}:${exc.original_date}`, exc);

      // If exception moves a session into this week
      if (exc.new_date && exc.new_date >= mondayStr && exc.new_date <= sundayStr) {
        const session = (sessions ?? []).find((s: any) => s.id === exc.session_id);
        if (session) {
          movedIntoWeek.push({ exception: exc, session });
        }
      }
    }

    const resolved: TutorSessionResolved[] = [];

    for (const session of (sessions ?? []) as any[]) {
      const tutorName = session.tutor?.name ?? '';

      if (session.is_recurring) {
        // Check if this recurring session is active during this week
        if (session.effective_from && session.effective_from > sundayStr) continue;
        if (session.effective_until && session.effective_until < mondayStr) continue;

        // Calculate the date for this day_of_week in the target week
        const sessionDate = targetMonday.isoWeekday(session.day_of_week).format('YYYY-MM-DD');

        // Check effective range for the specific date
        if (session.effective_from && sessionDate < session.effective_from) continue;
        if (session.effective_until && sessionDate > session.effective_until) continue;

        // Check if there's an exception cancelling this date
        const excKey = `${session.id}:${sessionDate}`;
        const exc = cancelledMap.get(excKey);
        if (exc) {
          // This date is cancelled/moved - skip it (the moved version is handled separately)
          continue;
        }

        resolved.push({
          session_id: session.id,
          tutor_id: session.tutor_id,
          tutor_name: tutorName,
          subject: session.subject,
          date: sessionDate,
          day_of_week: session.day_of_week,
          time_start: session.time_start,
          duration_hours: Number(session.duration_hours) || 1,
          is_recurring: true,
          is_exception: false,
        });
      } else {
        // One-time session
        if (
          session.specific_date &&
          session.specific_date >= mondayStr &&
          session.specific_date <= sundayStr
        ) {
          resolved.push({
            session_id: session.id,
            tutor_id: session.tutor_id,
            tutor_name: tutorName,
            subject: session.subject,
            date: session.specific_date,
            day_of_week: session.day_of_week,
            time_start: session.time_start,
            duration_hours: Number(session.duration_hours) || 1,
            is_recurring: false,
            is_exception: false,
          });
        }
      }
    }

    // Add sessions moved into this week via exceptions
    for (const { exception, session } of movedIntoWeek) {
      // Avoid duplicates - check if original_date is also in this week
      // (if so, the original was already skipped above via cancelledMap)
      const tutorName = session.tutor?.name ?? '';
      const newDate = exception.new_date!;
      const newDow = dayjs(newDate).isoWeekday();

      resolved.push({
        session_id: session.id,
        tutor_id: session.tutor_id,
        tutor_name: tutorName,
        subject: session.subject,
        date: newDate,
        day_of_week: newDow,
        time_start: exception.new_time ?? session.time_start,
        duration_hours: Number(session.duration_hours) || 1,
        is_recurring: session.is_recurring,
        is_exception: true,
      });
    }

    // Sort by date, then time
    resolved.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.time_start < b.time_start ? -1 : 1;
    });

    return { data: resolved };
  });

  fastify.post('/tutor-sessions', async (request, reply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const insertData: Record<string, unknown> = {
      tutor_id: parsed.data.tutor_id,
      subject: parsed.data.subject,
      day_of_week: parsed.data.day_of_week,
      time_start: parsed.data.time_start,
      duration_hours: parsed.data.duration_hours,
      is_recurring: parsed.data.is_recurring,
    };

    if (!parsed.data.is_recurring && parsed.data.specific_date) {
      insertData.specific_date = parsed.data.specific_date;
    }
    if (parsed.data.is_recurring) {
      insertData.effective_from = parsed.data.effective_from ?? dayjs().format('YYYY-MM-DD');
    }

    const { data, error } = await supabase
      .from('tutor_sessions')
      .insert(insertData)
      .select('*, tutor:tutors!inner(name)')
      .single();

    if (error) {
      request.log.error(error, 'Failed to create tutor session');
      return reply.code(500).send({ error: 'Failed to create tutor session' });
    }
    return reply.code(201).send({ data });
  });

  fastify.put<{ Params: { id: string } }>('/tutor-sessions/:id', async (request, reply) => {
    const { id } = request.params;
    const parsed = updateSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.time_start !== undefined) updateData.time_start = parsed.data.time_start;
    if (parsed.data.duration_hours !== undefined) updateData.duration_hours = parsed.data.duration_hours;

    const { data, error } = await supabase
      .from('tutor_sessions')
      .update(updateData)
      .eq('id', id)
      .select('*, tutor:tutors!inner(name)')
      .single();

    if (error || !data) {
      request.log.error(error, 'Failed to update tutor session');
      return reply.code(error ? 500 : 404).send({ error: 'Failed to update tutor session' });
    }
    return { data };
  });

  fastify.delete<{ Params: { id: string } }>('/tutor-sessions/:id', async (request, reply) => {
    const { id } = request.params;
    const { error } = await supabase.from('tutor_sessions').delete().eq('id', id);

    if (error) {
      request.log.error(error, 'Failed to delete tutor session');
      return reply.code(500).send({ error: 'Failed to delete tutor session' });
    }
    return reply.code(204).send();
  });

  // ── Reschedule operations ──

  /**
   * POST /tutor-sessions/:id/reschedule-one
   * Create an exception to move one occurrence.
   */
  fastify.post<{ Params: { id: string } }>(
    '/tutor-sessions/:id/reschedule-one',
    async (request, reply) => {
      const { id } = request.params;
      const parsed = rescheduleOneSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
      }

      const { data, error } = await supabase
        .from('tutor_session_exceptions')
        .insert({
          session_id: id,
          original_date: parsed.data.original_date,
          new_date: parsed.data.new_date,
          new_time: parsed.data.new_time,
        })
        .select('*')
        .single();

      if (error) {
        request.log.error(error, 'Failed to reschedule session');
        return reply.code(500).send({ error: 'Failed to reschedule session' });
      }
      return reply.code(201).send({ data: data as TutorSessionException });
    },
  );

  /**
   * POST /tutor-sessions/:id/reschedule-following
   * Close the current series and create a new one from the given date.
   */
  fastify.post<{ Params: { id: string } }>(
    '/tutor-sessions/:id/reschedule-following',
    async (request, reply) => {
      const { id } = request.params;
      const parsed = rescheduleFollowingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
      }

      // Get the original session
      const { data: original, error: fetchError } = await supabase
        .from('tutor_sessions')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !original) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      // Close the old series: effective_until = day before from_date
      const effectiveUntil = dayjs(parsed.data.from_date).subtract(1, 'day').format('YYYY-MM-DD');
      const { error: updateError } = await supabase
        .from('tutor_sessions')
        .update({ effective_until: effectiveUntil })
        .eq('id', id);

      if (updateError) {
        request.log.error(updateError, 'Failed to close old session series');
        return reply.code(500).send({ error: 'Failed to update session' });
      }

      // Create new session with new parameters
      const { data: newSession, error: createError } = await supabase
        .from('tutor_sessions')
        .insert({
          tutor_id: original.tutor_id,
          subject: original.subject,
          day_of_week: parsed.data.new_day_of_week,
          time_start: parsed.data.new_time,
          duration_hours: original.duration_hours ?? 1,
          is_recurring: true,
          effective_from: parsed.data.from_date,
        })
        .select('*, tutor:tutors!inner(name)')
        .single();

      if (createError) {
        request.log.error(createError, 'Failed to create new session series');
        return reply.code(500).send({ error: 'Failed to create new session series' });
      }

      return reply.code(201).send({ data: newSession });
    },
  );
};

export default tutorRoutes;
