-- Speed up latest-K summaries by article
CREATE INDEX IF NOT EXISTS summary_article_created_idx
  ON summary(article_id, created_at DESC);

