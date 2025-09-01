# Ingest & Processing Pipeline

## Jobs (in order)

1. **HN_POLL** (ingest-node)

   - Poll HN (`newstories`, `topstories`, `updates`).
   - Upsert `story` by `hn_id`.
   - If `url`: enqueue **FETCH_ARTICLE(story_id)**.
   - If text-only (Ask HN/Jobs): create article from `item.text`; enqueue **SUMMARIZE**, **EMBED**, **TAG**.

2. **FETCH_ARTICLE** (scraper-py)

   - Fetch HTML (respect robots.txt), extract main content.
   - Canonicalize URL, compute `content_hash`.
   - Upsert `article` by `content_hash`. Link `story.article_id`.
   - Enqueue **SUMMARIZE**, **EMBED**, **TAG**.

3. **SUMMARIZE** (scraper-py → summarizer-py)

   - Input: `article_id`.
   - Output: `summary(article_id, model, lang, summary)`.

4. **EMBED** (future) (summarizer-py)

   - Input: `article_id`, `model_key`.
   - Output: `embedding(article_id, model_key, vector)`.

5. **TAG** (future)

   - Heuristics/model → tag slugs.
   - Upsert `tag`, insert `story_tag`.

6. **REFRESH_HN_STATS** (scheduled)
   - Refresh `points/comments_count` for recent stories; recompute `rank_signals.hot_score`.

## Idempotency

- Upserts keyed by `hn_id` (story), `content_hash` (article).
- Job keys: e.g., `FETCH_ARTICLE:{story_id}:{content_hash}` to avoid dupes.
- Retries with backoff; DLQ after N attempts.
