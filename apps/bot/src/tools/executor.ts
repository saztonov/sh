/**
 * Tool executor: implements each agent tool by querying Supabase directly.
 * Uses the service-role client (bypasses RLS) — the same pattern as all bot commands.
 */
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import { supabase } from '../db.js';
import { config } from '../config.js';

dayjs.extend(isoWeek);

// ── Assignments ────────────────────────────────────────────────────────────────

export async function getAssignments(args: {
  period?: 'today' | 'tomorrow' | 'week';
  week_offset?: number;
  date?: string;       // YYYY-MM-DD
  subject?: string;
  is_completed?: boolean;
}) {
  let query = supabase
    .from('assignments')
    .select('id, title, due_date, due_raw, status, is_completed, source, course:courses!inner(classroom_name, subject), attachments(id, original_name)')
    .order('due_date', { ascending: true });

  if (args.period === 'today') {
    query = query.eq('due_date', dayjs().format('YYYY-MM-DD'));
  } else if (args.period === 'tomorrow') {
    query = query.eq('due_date', dayjs().add(1, 'day').format('YYYY-MM-DD'));
  } else if (args.period === 'week') {
    const offset = args.week_offset ?? 0;
    const monday = dayjs().isoWeekday(1).add(offset, 'week').format('YYYY-MM-DD');
    const sunday = dayjs().isoWeekday(1).add(offset, 'week').add(6, 'day').format('YYYY-MM-DD');
    query = query.gte('due_date', monday).lte('due_date', sunday);
  } else if (args.date) {
    query = query.eq('due_date', args.date);
  }

  if (args.subject) {
    query = query.eq('courses.subject', args.subject);
  }
  if (args.is_completed !== undefined) {
    query = query.eq('is_completed', args.is_completed);
  }

  const { data, error } = await query.limit(50);
  if (error) throw new Error(error.message);

  // Build download URLs via API proxy (Cloud.ru S3 doesn't support direct public access)
  const apiBase = config.apiUrl.replace(/\/+$/, '');
  return (data ?? []).map((a: any) => ({
    ...a,
    attachments: a.attachments?.map((att: any) => ({
      id: att.id,
      original_name: att.original_name,
      download_url: `${apiBase}/files/${att.id}/download/${encodeURIComponent(att.original_name)}`,
    })) ?? [],
  }));
}

export async function getAssignmentDetails(args: { id: string }) {
  const { data, error } = await supabase
    .from('assignments')
    .select('*, course:courses!inner(classroom_name, subject), attachments(*)')
    .eq('id', args.id)
    .single();
  if (error) throw new Error(error.message);

  // Build download URLs via API proxy
  const apiBase = config.apiUrl.replace(/\/+$/, '');
  if (data.attachments && Array.isArray(data.attachments)) {
    data.attachments = data.attachments.map((att: any) => ({
      ...att,
      download_url: `${apiBase}/files/${att.id}/download/${encodeURIComponent(att.original_name)}`,
    }));
  }

  return data;
}

export async function toggleAssignmentCompletion(args: { id: string }) {
  const { data: current, error: fetchError } = await supabase
    .from('assignments')
    .select('is_completed')
    .eq('id', args.id)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const { data, error } = await supabase
    .from('assignments')
    .update({ is_completed: !current.is_completed })
    .eq('id', args.id)
    .select('id, title, is_completed')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Schedule ───────────────────────────────────────────────────────────────────

export async function getSchedule(args: { week_offset?: number }) {
  const offset = args.week_offset ?? 0;
  const monday = dayjs().isoWeekday(1).add(offset, 'week');

  const { data: slots, error } = await supabase
    .from('schedule_slots')
    .select('id, day_of_week, lesson_number, time_start, time_end, subject')
    .order('day_of_week')
    .order('lesson_number');
  if (error) throw new Error(error.message);

  const weekStart = monday.format('YYYY-MM-DD');
  const weekEnd = monday.add(4, 'day').format('YYYY-MM-DD');

  const { data: assignments } = await supabase
    .from('assignments')
    .select('id, title, due_date, is_completed, status, source, course:courses(subject)')
    .gte('due_date', weekStart)
    .lte('due_date', weekEnd);

  return { slots: slots ?? [], assignments: assignments ?? [], week_start: weekStart };
}

// ── Tutor sessions ─────────────────────────────────────────────────────────────

export async function listTutors() {
  const { data, error } = await supabase
    .from('tutors')
    .select('id, name, created_at, tutor_subjects(subject)')
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    subjects: (t.tutor_subjects ?? []).map((s: any) => s.subject),
  }));
}

export async function createTutor(args: { name: string; subjects?: string[] }) {
  const { data, error } = await supabase
    .from('tutors')
    .insert({ name: args.name })
    .select('id, name')
    .single();
  if (error) throw new Error(error.message);

  if (args.subjects && args.subjects.length > 0) {
    await supabase
      .from('tutor_subjects')
      .insert(args.subjects.map((s) => ({ tutor_id: data.id, subject: s })));
  }

  return data;
}

export async function updateTutor(args: { id: string; name: string }) {
  const { data, error } = await supabase
    .from('tutors')
    .update({ name: args.name })
    .eq('id', args.id)
    .select('id, name')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteTutor(args: { id: string }) {
  const { error } = await supabase.from('tutors').delete().eq('id', args.id);
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function getTutorSessions(args: { week_offset?: number }) {
  const offset = args.week_offset ?? 0;
  const monday = dayjs().isoWeekday(1).add(offset, 'week');
  const sunday = monday.add(6, 'day');

  // Get recurring sessions
  const { data: sessions, error } = await supabase
    .from('tutor_sessions')
    .select('*, tutor:tutors(name)')
    .or(`is_recurring.eq.true,and(is_recurring.eq.false,specific_date.gte.${monday.format('YYYY-MM-DD')},specific_date.lte.${sunday.format('YYYY-MM-DD')})`);
  if (error) throw new Error(error.message);

  // Get exceptions for this week
  const { data: exceptions } = await supabase
    .from('tutor_session_exceptions')
    .select('*')
    .gte('original_date', monday.format('YYYY-MM-DD'))
    .lte('original_date', sunday.format('YYYY-MM-DD'));

  return {
    sessions: sessions ?? [],
    exceptions: exceptions ?? [],
    week_start: monday.format('YYYY-MM-DD'),
    week_end: sunday.format('YYYY-MM-DD'),
  };
}

export async function createTutorSession(args: {
  tutor_id?: string;
  tutor_name?: string;
  subject: string;
  day_of_week: number;
  time_start: string;
  duration_hours: number;
  is_recurring: boolean;
  specific_date?: string;
  effective_from?: string;
}) {
  let tutorId = args.tutor_id;

  if (!tutorId) {
    if (!args.tutor_name) {
      throw new Error('Необходимо указать tutor_id или tutor_name');
    }
    const { data: tutors, error: searchError } = await supabase
      .from('tutors')
      .select('id, name')
      .ilike('name', `%${args.tutor_name}%`);
    if (searchError) throw new Error(searchError.message);

    if (!tutors || tutors.length === 0) {
      throw new Error(`Репетитор «${args.tutor_name}» не найден`);
    }
    if (tutors.length > 1) {
      const names = tutors.map((t) => `${t.name} (${t.id})`).join(', ');
      throw new Error(`Найдено несколько репетиторов: ${names}. Уточните имя.`);
    }
    tutorId = tutors[0].id;
  }

  const { tutor_name: _, ...rest } = args;
  const { data, error } = await supabase
    .from('tutor_sessions')
    .insert({ ...rest, tutor_id: tutorId })
    .select('id, tutor_id, subject, day_of_week, time_start, duration_hours, is_recurring')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateTutorSession(args: {
  id: string;
  time_start?: string;
  duration_hours?: number;
}) {
  const update: Record<string, unknown> = {};
  if (args.time_start !== undefined) update.time_start = args.time_start;
  if (args.duration_hours !== undefined) update.duration_hours = args.duration_hours;

  const { data, error } = await supabase
    .from('tutor_sessions')
    .update(update)
    .eq('id', args.id)
    .select('id, time_start, duration_hours')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function rescheduleTutorSessionOnce(args: {
  session_id: string;
  original_date: string;
  new_date: string;
  new_time: string;
}) {
  const { data, error } = await supabase
    .from('tutor_session_exceptions')
    .insert({
      session_id: args.session_id,
      original_date: args.original_date,
      new_date: args.new_date,
      new_time: args.new_time,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { success: true, exception_id: data.id };
}

export async function deleteTutorSession(args: { id: string }) {
  const { error } = await supabase.from('tutor_sessions').delete().eq('id', args.id);
  if (error) throw new Error(error.message);
  return { success: true };
}

// ── Difficulties ──────────────────────────────────────────────────────────────

export async function getDifficulties(args: {
  status?: 'unresolved' | 'resolved' | 'all';
  subject?: string;
}) {
  let query = supabase
    .from('difficulties')
    .select('id, subject, title, comment, is_resolved, deadline, created_at')
    .order('created_at', { ascending: false });

  const status = args.status ?? 'unresolved';
  if (status === 'unresolved') {
    query = query.eq('is_resolved', false);
  } else if (status === 'resolved') {
    query = query.eq('is_resolved', true);
  }

  if (args.subject) {
    query = query.eq('subject', args.subject);
  }

  const { data, error } = await query.limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDifficultyDetails(args: { id: string }) {
  const { data: difficulty, error: diffError } = await supabase
    .from('difficulties')
    .select('*')
    .eq('id', args.id)
    .single();
  if (diffError) throw new Error(diffError.message);

  const { data: comments } = await supabase
    .from('difficulty_comments')
    .select('id, text, created_at')
    .eq('difficulty_id', args.id)
    .order('created_at', { ascending: true });

  const { data: attachments } = await supabase
    .from('difficulty_attachments')
    .select('id, file_name, mime_type, size, created_at')
    .eq('difficulty_id', args.id)
    .order('created_at', { ascending: true });

  return {
    ...difficulty,
    comments: comments ?? [],
    attachments: attachments ?? [],
  };
}

export async function createDifficulty(args: {
  subject: string;
  title: string;
  comment?: string;
  deadline?: string;
}) {
  const { data, error } = await supabase
    .from('difficulties')
    .insert({
      subject: args.subject,
      title: args.title,
      comment: args.comment ?? null,
      deadline: args.deadline ?? null,
    })
    .select('id, subject, title, deadline, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateDifficulty(args: {
  id: string;
  subject?: string;
  title?: string;
  comment?: string;
  deadline?: string;
  is_resolved?: boolean;
}) {
  const { id, ...fields } = args;
  const update: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() };

  if (args.is_resolved === true) {
    update.resolved_at = new Date().toISOString();
  } else if (args.is_resolved === false) {
    update.resolved_at = null;
  }

  const { data, error } = await supabase
    .from('difficulties')
    .update(update)
    .eq('id', id)
    .select('id, subject, title, is_resolved, deadline')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function addDifficultyComment(args: {
  difficulty_id: string;
  text: string;
}) {
  const { data, error } = await supabase
    .from('difficulty_comments')
    .insert({ difficulty_id: args.difficulty_id, text: args.text })
    .select('id, text, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Files ──────────────────────────────────────────────────────────────────────

export async function getFileInfo(args: { attachment_id: string }) {
  const { data, error } = await supabase
    .from('attachments')
    .select('id, original_name, mime_type, size_bytes, s3_key, s3_url, classroom_url')
    .eq('id', args.attachment_id)
    .single();
  if (error) throw new Error(error.message);

  const apiBase = config.apiUrl.replace(/\/+$/, '');
  return {
    id: data.id,
    original_name: data.original_name,
    mime_type: data.mime_type,
    size_bytes: data.size_bytes,
    download_url: `${apiBase}/files/${data.id}/download/${encodeURIComponent(data.original_name)}`,
    classroom_url: data.classroom_url,
  };
}

// ── Scraper ────────────────────────────────────────────────────────────────────

export async function triggerScraper(args: { source: 'google' | 'eljur' | 'all' }) {
  const statusMap = {
    google: 'pending',
    eljur: 'eljur_scrape_diary',
    all: 'scrape_all',
  };

  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ status: statusMap[args.source] })
    .select('id, status, started_at')
    .single();
  if (error) throw new Error(error.message);
  return { success: true, run_id: data.id, status: data.status };
}
