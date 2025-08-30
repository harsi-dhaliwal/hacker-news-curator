# Data Model

## Entities

- **story**: one per HN post (or source). Fields: id, source, hn_id, title, url, domain, author, points, comments_count, created_at, fetched_at, article_id (nullable).
- **article**: normalized content shared by many stories. Fields: id, language, html, text, word_count, content_hash (UNIQUE), tsv (generated).
- **summary**: per-article, multiple model/lang variants. Fields: id, article_id, model, lang, summary, created_at.
- **embedding**: per-article per `model_key`. Fields: id, article_id, model_key, vector, created_at.
- **tag/topic** with M2M: `story_tag`, `story_topic`.
- **rank_signals** per story: hot_score, decay_ts, click_count, dwell_ms_avg.

## Invariants

- `article.content_hash` is unique (dedupe).
- Summaries/embeddings always reference `article_id` (never story).
- `story.article_id` can be NULL until FETCH_ARTICLE/Ask HN creates it.

See SQL: `infra/sql/001_init.sql`.
