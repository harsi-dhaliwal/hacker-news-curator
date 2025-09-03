-- Add rich summary metadata fields
ALTER TABLE summary
  ADD COLUMN IF NOT EXISTS classification_json jsonb,
  ADD COLUMN IF NOT EXISTS ui_json jsonb,
  ADD COLUMN IF NOT EXISTS summarized_at timestamptz;

-- Optional: future index ideas
-- CREATE INDEX IF NOT EXISTS summary_ui_json_gin ON summary USING gin (ui_json);
-- CREATE UNIQUE INDEX IF NOT EXISTS summary_dedupe_unique
--   ON summary (article_id, model, lang, md5(summary));

