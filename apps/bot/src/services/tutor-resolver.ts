/**
 * Resolves tutor sessions for a given date range,
 * handling recurring sessions, effective_from/until, exceptions, and one-time sessions.
 *
 * Ported from apps/api/src/routes/tutors.ts (GET /tutor-sessions).
 */
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import type { TutorSessionException, TutorSessionResolved } from '@homework/shared';
import { supabase } from '../db.js';

dayjs.extend(isoWeek);

export async function resolveSessionsForRange(
  startDate: string,
  endDate: string,
): Promise<TutorSessionResolved[]> {
  // Fetch all sessions with tutor name
  const { data: sessions, error: sessionsError } = await supabase
    .from('tutor_sessions')
    .select('*, tutor:tutors!inner(name)')
    .order('day_of_week', { ascending: true })
    .order('time_start', { ascending: true });

  if (sessionsError) {
    throw new Error(`Failed to fetch tutor sessions: ${sessionsError.message}`);
  }

  if (!sessions || sessions.length === 0) return [];

  // Fetch exceptions
  const sessionIds = sessions.map((s: any) => s.id);
  let exceptions: TutorSessionException[] = [];

  const { data: excData, error: excError } = await supabase
    .from('tutor_session_exceptions')
    .select('*')
    .in('session_id', sessionIds);

  if (excError) {
    throw new Error(`Failed to fetch session exceptions: ${excError.message}`);
  }
  exceptions = (excData ?? []) as TutorSessionException[];

  // Build exception maps
  const cancelledMap = new Map<string, TutorSessionException>();
  const movedIntoRange: { exception: TutorSessionException; session: any }[] = [];

  for (const exc of exceptions) {
    cancelledMap.set(`${exc.session_id}:${exc.original_date}`, exc);

    if (exc.new_date && exc.new_date >= startDate && exc.new_date <= endDate) {
      const session = sessions.find((s: any) => s.id === exc.session_id);
      if (session) {
        movedIntoRange.push({ exception: exc, session });
      }
    }
  }

  const resolved: TutorSessionResolved[] = [];

  // Compute all Mondays that cover the date range
  const rangeStart = dayjs(startDate);
  const rangeEnd = dayjs(endDate);

  for (const session of sessions as any[]) {
    const tutorName = session.tutor?.name ?? '';

    if (session.is_recurring) {
      if (session.effective_from && session.effective_from > endDate) continue;
      if (session.effective_until && session.effective_until < startDate) continue;

      // Iterate over each week in the range
      let weekMonday = rangeStart.isoWeekday(1);
      // If weekMonday is after rangeStart, go back one week
      if (weekMonday.isAfter(rangeStart)) {
        weekMonday = weekMonday.subtract(1, 'week');
      }

      while (weekMonday.isoWeekday(7).format('YYYY-MM-DD') >= startDate) {
        const sessionDate = weekMonday.isoWeekday(session.day_of_week).format('YYYY-MM-DD');

        // Check if sessionDate is within our range
        if (sessionDate >= startDate && sessionDate <= endDate) {
          // Check effective range
          if (session.effective_from && sessionDate < session.effective_from) {
            weekMonday = weekMonday.add(1, 'week');
            continue;
          }
          if (session.effective_until && sessionDate > session.effective_until) {
            weekMonday = weekMonday.add(1, 'week');
            continue;
          }

          // Check if cancelled/moved
          const excKey = `${session.id}:${sessionDate}`;
          if (!cancelledMap.has(excKey)) {
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
          }
        }

        weekMonday = weekMonday.add(1, 'week');
        if (weekMonday.format('YYYY-MM-DD') > endDate) break;
      }
    } else {
      // One-time session
      if (
        session.specific_date &&
        session.specific_date >= startDate &&
        session.specific_date <= endDate
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

  // Add sessions moved into range via exceptions
  for (const { exception, session } of movedIntoRange) {
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

  return resolved;
}
