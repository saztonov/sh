export interface Tutor {
  id: string;
  name: string;
  created_at: string;
}

export interface TutorSession {
  id: string;
  tutor_id: string;
  subject: string;
  day_of_week: number;
  time_start: string;
  is_recurring: boolean;
  specific_date: string | null;
  effective_from: string | null;
  effective_until: string | null;
  created_at: string;
}

export interface TutorSessionException {
  id: string;
  session_id: string;
  original_date: string;
  new_date: string | null;
  new_time: string | null;
  created_at: string;
}

/** Resolved session for a specific date (returned by GET /tutor-sessions) */
export interface TutorSessionResolved {
  session_id: string;
  tutor_id: string;
  tutor_name: string;
  subject: string;
  date: string;
  day_of_week: number;
  time_start: string;
  is_recurring: boolean;
  is_exception: boolean;
}
