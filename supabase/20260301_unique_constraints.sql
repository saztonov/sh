-- Миграция: очистка дубликатов заданий и создание уникальных индексов
-- Выполнить вручную в SQL-редакторе Supabase
-- Дата: 2026-03-01

BEGIN;

-- 1. Удалить дубликаты по classroom_id (оставить самую старую запись)
DELETE FROM assignments a
USING assignments b
WHERE a.classroom_id IS NOT NULL
  AND a.classroom_id = b.classroom_id
  AND a.created_at > b.created_at;

-- 2. Удалить дубликаты по (course_id, title, due_date) среди записей без classroom_id
DELETE FROM assignments a
USING assignments b
WHERE a.classroom_id IS NULL
  AND b.classroom_id IS NULL
  AND a.course_id = b.course_id
  AND a.title = b.title
  AND a.due_date IS NOT DISTINCT FROM b.due_date
  AND a.created_at > b.created_at;

-- 3. Частичный уникальный индекс на classroom_id (только для NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_classroom_id_unique
  ON assignments (classroom_id)
  WHERE classroom_id IS NOT NULL;

-- 4. Составной уникальный индекс как fallback для записей без classroom_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_course_title_due_unique
  ON assignments (course_id, title, due_date)
  WHERE classroom_id IS NULL;

COMMIT;
