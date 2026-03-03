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
  status: 'pending' | 'running' | 'success' | 'error' | 'capture_session' | 'force_save' | 'auto_login' | 'eljur_capture_session' | 'eljur_auto_login' | 'eljur_force_save' | 'eljur_scrape_diary';
  assignments_found: number | null;
  assignments_new: number | null;
  error_message: string | null;
  source?: 'google' | 'eljur' | null;
}

export interface TelegramUser {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  is_authorized: boolean;
  created_at: string;
}
