-- Add source column to scrape_runs and assignments tables
-- to distinguish between Google Classroom and Eljur data.

ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS source text DEFAULT NULL;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS source text DEFAULT NULL;

-- Backfill existing records as Google Classroom
UPDATE scrape_runs SET source = 'google' WHERE source IS NULL;
UPDATE assignments SET source = 'google' WHERE source IS NULL;
