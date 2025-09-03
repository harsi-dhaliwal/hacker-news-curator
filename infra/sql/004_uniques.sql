-- Enforce one summary per article and one article per story
-- WARNING: This migration will modify existing data to satisfy uniqueness.

-- 1) Deduplicate summaries, keeping the newest per article_id
WITH ranked AS (
  SELECT id, article_id,
         ROW_NUMBER() OVER (PARTITION BY article_id ORDER BY created_at DESC) AS rn
  FROM summary
)
DELETE FROM summary
USING ranked r
WHERE summary.id = r.id AND r.rn > 1;

-- 2) Add unique constraint: exactly one summary per article
ALTER TABLE summary
  ADD CONSTRAINT summary_one_per_article UNIQUE (article_id);

-- 3) For stories that share the same article, detach older ones
WITH ranked_story AS (
  SELECT id, article_id,
         ROW_NUMBER() OVER (
           PARTITION BY article_id
           ORDER BY fetched_at DESC NULLS LAST, created_at DESC
         ) AS rn
  FROM story
  WHERE article_id IS NOT NULL
)
UPDATE story s
SET article_id = NULL
FROM ranked_story rs
WHERE s.id = rs.id AND rs.rn > 1;

-- 4) Add unique index: one story per article (when set)
CREATE UNIQUE INDEX IF NOT EXISTS story_article_unique
  ON story(article_id)
  WHERE article_id IS NOT NULL;

