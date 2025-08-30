# Coding Agent Context — Worker (Python)

## Role

Run the job pipeline reliably.

## Inputs

- `docs/PIPELINE.md`
- `docs/QUEUES_JOBS.md`
- `docs/DATA_MODEL.md`

## Deliverables

- Queues + processors: `FETCH_ARTICLE`, `SUMMARIZE`, `EMBED`, `TAG`, `REFRESH_HN_STATS`.
- Utilities:
  - URL canonicalizer, robots.txt checker, extractor (Readability → fallback).
  - `content_hash(text[, canonical_url])`.
  - Idempotent upserts and `story.article_id` linking.
- Job state: retries, backoff, dead-letter; structured logs.

## Acceptance criteria

- No duplicate `article` rows for same content (hash).
- Ask HN/Jobs create `article.text` from `item.text`.
- After a story is processed, `/api/stories` shows it with summary present (if model available).
