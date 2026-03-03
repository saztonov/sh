import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import { supabase } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  DAY_NAMES,
  type DayOfWeek,
  type ScheduleSlot,
  type MergedScheduleDay,
  type MergedSlot,
  type SlotAssignment,
  type AssignmentWithCourse,
} from '@homework/shared';

dayjs.extend(isoWeek);

const weekOffsetSchema = z.object({
  week_offset: z.coerce.number().int().default(0),
});

const scheduleRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /schedule - all schedule slots ordered by day_of_week, lesson_number
   */
  fastify.get('/schedule', async (request, reply) => {
    const { data, error } = await supabase
      .from('schedule_slots')
      .select('*')
      .order('day_of_week', { ascending: true })
      .order('lesson_number', { ascending: true });

    if (error) {
      request.log.error(error, 'Failed to fetch schedule');
      return reply.code(500).send({ error: 'Failed to fetch schedule' });
    }

    return { data: data as ScheduleSlot[] };
  });

  /**
   * GET /schedule/merged?week_offset=0 - merged schedule with assignments
   *
   * Returns MergedScheduleDay[] for the target week.
   * Each slot includes assignments whose subject matches and whose
   * due_date is associated with that lesson day -- specifically,
   * an assignment shows on the LAST lesson of that subject on or
   * before the due_date within the week.
   */
  fastify.get('/schedule/merged', async (request, reply) => {
    const parsed = weekOffsetSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query parameters' });
    }

    const { week_offset } = parsed.data;

    // Calculate the Monday and Friday of the target week
    const targetMonday = dayjs().isoWeekday(1).add(week_offset, 'week');
    const mondayStr = targetMonday.format('YYYY-MM-DD');
    const sundayStr = targetMonday.isoWeekday(7).format('YYYY-MM-DD');

    // Fetch schedule slots
    const { data: slots, error: slotsError } = await supabase
      .from('schedule_slots')
      .select('*')
      .order('day_of_week', { ascending: true })
      .order('lesson_number', { ascending: true });

    if (slotsError) {
      request.log.error(slotsError, 'Failed to fetch schedule slots');
      return reply.code(500).send({ error: 'Failed to fetch schedule slots' });
    }

    // Fetch assignments due within the week, joined with courses
    const { data: assignments, error: assignmentsError } = await supabase
      .from('assignments')
      .select('*, course:courses(classroom_name, subject)')
      .gte('due_date', mondayStr)
      .lte('due_date', sundayStr)
      .order('due_date', { ascending: true });

    if (assignmentsError) {
      request.log.error(assignmentsError, 'Failed to fetch assignments');
      return reply.code(500).send({ error: 'Failed to fetch assignments' });
    }

    const typedSlots = (slots ?? []) as ScheduleSlot[];
    const typedAssignments = (assignments ?? []) as AssignmentWithCourse[];

    // Group slots by day_of_week
    const slotsByDay = new Map<DayOfWeek, ScheduleSlot[]>();
    for (const slot of typedSlots) {
      const daySlots = slotsByDay.get(slot.day_of_week) ?? [];
      daySlots.push(slot);
      slotsByDay.set(slot.day_of_week, daySlots);
    }

    // Build maps for the merge algorithm:
    // 1. subject -> sorted list of day_of_week values that have that subject
    // 2. subject+day -> last (highest) lesson_number for that subject on that day
    const subjectDays = new Map<string, DayOfWeek[]>();
    const subjectDayLastLesson = new Map<string, number>(); // key: "day-subject" -> lesson_number

    for (const slot of typedSlots) {
      const days = subjectDays.get(slot.subject) ?? [];
      if (!days.includes(slot.day_of_week)) {
        days.push(slot.day_of_week);
      }
      subjectDays.set(slot.subject, days);

      // Track the last (highest) lesson number for this subject on this day
      const daySubjectKey = `${slot.day_of_week}-${slot.subject}`;
      const current = subjectDayLastLesson.get(daySubjectKey) ?? 0;
      if (slot.lesson_number > current) {
        subjectDayLastLesson.set(daySubjectKey, slot.lesson_number);
      }
    }
    // Sort each subject's days
    for (const [subject, days] of subjectDays) {
      subjectDays.set(subject, days.sort((a, b) => a - b));
    }

    // For each assignment, determine which day_of_week + specific slot it should appear on.
    // Rule: show on the LAST lesson of that subject on or before the due_date.
    // If due date is before all lessons of the subject in the week, show on the FIRST one.
    // key: "dayOfWeek-date-subject-lessonNumber"
    const assignmentPlacement = new Map<string, SlotAssignment[]>();

    for (const assignment of typedAssignments) {
      const subject = assignment.course?.subject;
      if (!subject || !assignment.due_date) continue;

      const dueDate = dayjs(assignment.due_date);
      const dueDayOfWeek = dueDate.isoWeekday(); // 1-7 (may be 6/7 for weekends)

      const daysWithSubject = subjectDays.get(subject);
      if (!daysWithSubject || daysWithSubject.length === 0) continue;

      // Find the last day_of_week <= dueDayOfWeek that has a lesson for this subject
      let targetDay: DayOfWeek | null = null;
      for (let i = daysWithSubject.length - 1; i >= 0; i--) {
        if (daysWithSubject[i] <= dueDayOfWeek) {
          targetDay = daysWithSubject[i];
          break;
        }
      }

      // If no day found on or before due date (e.g., due Monday but subject only Wed/Fri),
      // place on the FIRST upcoming lesson of that subject
      if (targetDay === null) {
        targetDay = daysWithSubject[0];
      }

      // Find the last lesson number for this subject on the target day
      const daySubjectKey = `${targetDay}-${subject}`;
      const lastLesson = subjectDayLastLesson.get(daySubjectKey) ?? 0;

      const placementDate = targetMonday.isoWeekday(targetDay).format('YYYY-MM-DD');
      const key = `${targetDay}-${placementDate}-${subject}-${lastLesson}`;

      const slotAssignment: SlotAssignment = {
        id: assignment.id,
        title: assignment.title,
        dueDate: assignment.due_date,
        isCompleted: assignment.is_completed,
        status: assignment.status,
        source: assignment.source ?? null,
      };

      const existing = assignmentPlacement.get(key) ?? [];
      existing.push(slotAssignment);
      assignmentPlacement.set(key, existing);
    }

    // Build the final merged schedule
    const days: DayOfWeek[] = [1, 2, 3, 4, 5];
    const result: MergedScheduleDay[] = days.map((dow) => {
      const date = targetMonday.isoWeekday(dow).format('YYYY-MM-DD');
      const daySlots = slotsByDay.get(dow) ?? [];

      const mergedSlots: MergedSlot[] = daySlots.map((slot) => {
        const key = `${dow}-${date}-${slot.subject}-${slot.lesson_number}`;
        const slotAssignments = assignmentPlacement.get(key) ?? [];

        return {
          lessonNumber: slot.lesson_number,
          timeStart: slot.time_start,
          timeEnd: slot.time_end,
          subject: slot.subject,
          assignments: slotAssignments,
        };
      });

      return {
        dayOfWeek: dow,
        dayName: DAY_NAMES[dow] ?? '',
        date,
        slots: mergedSlots,
      };
    });

    return { data: result };
  });
};

export default scheduleRoutes;
