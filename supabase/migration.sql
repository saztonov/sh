-- Homework Portal: Full database schema
-- Run this in Supabase SQL Editor

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_name text NOT NULL UNIQUE,
  subject text,
  classroom_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE course_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL UNIQUE,
  subject text,
  priority smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  classroom_id text UNIQUE,
  classroom_url text,
  title text NOT NULL,
  description text,
  author text,
  points integer,
  due_date date,
  due_raw text,
  status text NOT NULL DEFAULT 'not_turned_in',
  is_completed boolean NOT NULL DEFAULT false,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  original_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  s3_key text NOT NULL,
  s3_url text NOT NULL,
  classroom_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE schedule_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  lesson_number smallint NOT NULL,
  time_start time,
  time_end time,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_of_week, lesson_number)
);

CREATE TABLE scrape_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  assignments_found integer,
  assignments_new integer,
  error_message text
);

CREATE TABLE telegram_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL UNIQUE,
  telegram_username text,
  is_authorized boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_assignments_course_id ON assignments(course_id);
CREATE INDEX idx_assignments_due_date ON assignments(due_date);
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_assignments_is_completed ON assignments(is_completed);
CREATE INDEX idx_attachments_assignment_id ON attachments(assignment_id);
CREATE INDEX idx_schedule_slots_day ON schedule_slots(day_of_week);
CREATE INDEX idx_course_mappings_keyword ON course_mappings(keyword);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_assignments_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read everything
CREATE POLICY "Authenticated users can read courses"
  ON courses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read course_mappings"
  ON course_mappings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read assignments"
  ON assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read attachments"
  ON attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read schedule_slots"
  ON schedule_slots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read scrape_runs"
  ON scrape_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read telegram_users"
  ON telegram_users FOR SELECT TO authenticated USING (true);

-- Authenticated users can update assignments (toggle completion)
CREATE POLICY "Authenticated users can update assignments"
  ON assignments FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Authenticated users can manage course mappings
CREATE POLICY "Authenticated users can insert course_mappings"
  ON course_mappings FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update course_mappings"
  ON course_mappings FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete course_mappings"
  ON course_mappings FOR DELETE TO authenticated USING (true);

-- Authenticated users can update courses (change subject mapping)
CREATE POLICY "Authenticated users can update courses"
  ON courses FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Authenticated users can manage telegram_users
CREATE POLICY "Authenticated users can manage telegram_users"
  ON telegram_users FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Service role (scraper) bypasses RLS automatically

-- ============================================
-- SEED COURSE MAPPINGS
-- ============================================

INSERT INTO course_mappings (keyword, subject, priority) VALUES
  ('литература', 'Литература', 0),
  ('русский язык', 'Русский язык', 0),
  ('биология', 'Биология', 0),
  ('физика', 'Физика', 0),
  ('химия', 'Химия', 0),
  ('алгебра', 'Алгебра', 0),
  ('геометрия', 'Геометрия', 0),
  ('история', 'История', 0),
  ('география', 'География', 0),
  ('обществознание', 'Обществознание', 0),
  ('английский', 'Англ. яз.', 0),
  ('немецкий', 'Немец. яз.', 0),
  ('deutsch', 'Немец. яз.', 0),
  ('информатика', 'Инф. и ИКТ', 0),
  ('икт', 'Инф. и ИКТ', 0),
  ('право', 'Право', 0),
  ('экономика', 'Экономика', 0),
  ('мхк', 'МХК', 0),
  ('физкультура', 'Физкультура', 0),
  ('физическая', 'Физкультура', 0),
  ('ров', 'РоВ', 0),
  ('россия', 'РоВ', 0),
  ('твис', 'ТВиС', 0),
  ('вероятность', 'ТВиС', 0),
  ('психолог', NULL, 0),
  ('старшая школа', NULL, 0),
  ('архив', NULL, 0)
ON CONFLICT (keyword) DO NOTHING;
