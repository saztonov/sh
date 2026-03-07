export interface Course {
  id: string;
  classroom_name: string;
  subject: string | null;
  classroom_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CourseMapping {
  id: string;
  keyword: string;
  subject: string | null;
  priority: number;
  created_at: string;
}

export interface ScrapeRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'pending' | 'running' | 'success' | 'error' | 'capture_session' | 'force_save' | 'auto_login' | 'eljur_capture_session' | 'eljur_auto_login' | 'eljur_force_save' | 'eljur_scrape_diary' | 'scrape_all';
  assignments_found: number | null;
  assignments_new: number | null;
  error_message: string | null;
  source?: 'google' | 'eljur' | null;
  google_status?: 'success' | 'error' | null;
  google_found?: number | null;
  google_new?: number | null;
  google_error?: string | null;
  eljur_status?: 'success' | 'error' | null;
  eljur_found?: number | null;
  eljur_new?: number | null;
  eljur_error?: string | null;
}

export type ScrapeLogLevel = 'info' | 'warn' | 'error' | 'debug';

export type ScrapeLogStep =
  | 'browser_launch'
  | 'session_load'
  | 'session_check'
  | 'auto_login'
  | 'manual_login_wait'
  | 'session_save'
  | 'navigate'
  | 'fetch_courses'
  | 'fetch_assignments'
  | 'fetch_detail'
  | 'download_attachment'
  | 'db_upsert'
  | 'finish';

export interface ScrapeLog {
  id: string;
  run_id: string;
  created_at: string;
  level: ScrapeLogLevel;
  step: ScrapeLogStep | null;
  message: string;
  details: Record<string, unknown> | null;
  duration_ms: number | null;
}

export interface TelegramUser {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  is_authorized: boolean;
  created_at: string;
}
