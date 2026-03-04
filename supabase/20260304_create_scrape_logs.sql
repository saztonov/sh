-- Таблица детальных логов для scrape_runs
CREATE TABLE IF NOT EXISTS scrape_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES scrape_runs(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  level       text NOT NULL DEFAULT 'info',
  step        text,
  message     text NOT NULL,
  details     jsonb,
  duration_ms int4
);

CREATE INDEX idx_scrape_logs_run_id ON scrape_logs(run_id);
CREATE INDEX idx_scrape_logs_created_at ON scrape_logs(created_at);

ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scrape_logs"
  ON scrape_logs FOR SELECT
  TO authenticated
  USING (true);
