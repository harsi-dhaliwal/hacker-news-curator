# Implementation Plan

This plan stitches together docs in `docs/`, contracts in `contracts/`, and service specs in `services/*/SPEC.md`. It focuses on minimizing cross-team blockers while delivering a working ingest→process→serve pipeline.

## Ground Rules

- Source of truth for APIs: `contracts/openapi.yaml` (no drift). Types generated only from this file.
- Source of truth for DB: `infra/sql/001_init.sql` (do not reshape in code).
- Queues and message shapes follow `docs/QUEUE_JOBS.md`.
- Idempotency: upserts by `hn_id` (story) and `content_hash` (article). Job keys de-duplicate retries.

## Infra & Tooling (Global)

- Postgres + Redis available for all services; load `infra/sql/001_init.sql`.
- Env vars: `DATABASE_URL`, `REDIS_URL`, `LOG_LEVEL` (plus service-specific ones).
- Local dev: docker-compose or dev containers (out of scope to write here, but assumed available).
- Observability: structured JSON logs; `/healthz` for HTTP services; counters for workers.

## Delivery Phases (to unblock teams early)

1) Phase A — Contracts + DB + API (lexical only)
   - Freeze `contracts/openapi.yaml`; generate TS types for API Node and Web.
   - Apply `infra/sql/001_init.sql`.
   - Implement `services/api-node` endpoints with lexical queries and pagination; shape matches OpenAPI.
   - Seed minimal data or rely on manual inserts for Web to integrate.

2) Phase B — Ingestion + Article Fetch
   - Implement `services/ingest-node` HN poller → upsert `story` → enqueue `FETCH_ARTICLE`.
   - Implement `services/worker-py` `FETCH_ARTICLE` task: fetch HTML, extract, canonicalize URL, compute `content_hash`, upsert `article`, link `story.article_id`.

3) Phase C — Summaries + Embeddings + Hybrid Search
   - Implement `services/summarizer-py` FastAPI: `/summarize`, `/embed`; read `article.text`, upsert `summary`/`embedding` (respect `embedding_model.dimensions`).
   - Integrate `services/worker-py` tasks `SUMMARIZE`, `EMBED`, `TAG` orchestration; schedule `REFRESH_HN_STATS`.
   - Upgrade `services/api-node` to support hybrid search when `semantic` param present; default to lexical when absent.

4) Phase D — Web UI + Caching + Ranking polish
   - Implement `apps/web` route handlers (`/api/stories`, `/api/search`) and pages; Redis cache, ETag, `Cache-Control`.
   - Ranking polish via `rank_signals.hot_score`; ensure `/` feeds ordered and deterministic.

This ordering lets Web and API teams start immediately (Phase A) while ingest/worker/summarizer stand up in parallel, reducing cross-team waiting.

## Dependencies Matrix (summary)

- API Node → depends on: Postgres, contracts; optional: embeddings for hybrid.
- Web → depends on: API Node contracts; optional: Redis for perf.
- Ingest Node → depends on: Postgres, Redis (queue).
- Worker Py → depends on: Postgres, Redis, Summarizer (for summarize/embed), extractor utilities.
- Summarizer Py → depends on: Postgres (read article, write summary/embedding), model provider.

## Service Workstreams

### services/api-node

- Endpoints (from OpenAPI):
  - `GET /stories`, `GET /stories/{id}`
  - `GET /search` (lexical initially; hybrid joins embeddings later)
  - `GET /tags`, `GET /topics`
  - Internal: `POST /_internal/reindex` (stub ok)
- Data access:
  - Lexical queries over `story_list` + `article.tsv` GIN index.
  - Hybrid: CTE returning `k` nearest `embedding.vector` then join to stories when `semantic` present.
- Validation & safety:
  - Validate query params; parameterized SQL; enforce `limit<=100`, `offset>=0`.
- Perf:
  - Confirm index usage via EXPLAIN; document in code comments.

### services/ingest-node

- HN poller (newstories/topstories/updates):
  - Normalize to `StoryBase`; dedupe by `hn_id`.
  - Upsert into `story`; enqueue `FETCH_ARTICLE(story_id)` if `url` present; for Ask HN/Jobs create `article` from `item.text` and enqueue `SUMMARIZE`/`EMBED`/`TAG`.
- Reliability:
  - Idempotent publishing via job keys; backoff retries; metrics for ingested/dupes/failures.

### services/worker-py

- Queues: `FETCH_ARTICLE`, `SUMMARIZE`, `EMBED`, `TAG`, `REFRESH_HN_STATS`.
- Utilities:
  - URL canonicalizer; robots.txt checker; extractor; `content_hash(text[, canonical_url])`.
- Tasks:
  - `FETCH_ARTICLE`: fetch, extract, upsert `article`, link `story.article_id`, enqueue next tasks.
  - `SUMMARIZE`/`EMBED`: call summarizer; ensure idempotency.
  - `TAG`: heuristics/model to upsert tags and `story_tag` rows.
  - `REFRESH_HN_STATS`: refresh points/comments; recompute `rank_signals.hot_score`.

### services/summarizer-py

- FastAPI endpoints:
  - `POST /summarize` → `{ article_id, model, lang }` → upsert `summary`.
  - `POST /embed` → `{ article_id, model_key }` → upsert `embedding` with correct dims.
- Behavior:
  - Read `article.text`; respect `embedding_model.dimensions` by `model_key`.
  - Idempotent writes; throughput target ~50 req/min in dev; mock models allowed.

### apps/web (Next.js)

- Route handlers: `GET /api/stories`, `GET /api/search` map to OpenAPI shapes.
- Pages/components: `/` hot feed; `/tag/[slug]`, `/topic/[slug]`, `/domain/[name]`; `StoryCard`, `Filters`, `SearchBox`.
- Caching: Redis-first; ETag; `Cache-Control`; revalidate 60s for hot feed.

## Milestones & Exit Criteria

- M1 (Phase A): API Node serves `/stories` and `/search` (lexical), Web renders hot feed with seed data.
- M2 (Phase B): Ingest + Worker `FETCH_ARTICLE` populate `article` and link to `story`.
- M3 (Phase C): Summaries/embeddings present for new items; API hybrid search enabled.
- M4 (Phase D): Tags/topics views live; hot ranking polished; scheduled refresh running.

## Testing & Validation

- API Node: unit tests for controllers/validators; integration tests against test DB.
- Ingest/Worker: integration tests using a local queue emulator; asserts DB side effects.
- Summarizer: unit tests with mock model; DB upsert idempotency.
- Web: snapshot/SSR tests for pages; API handler contract tests.

## Risks & Mitigations

- Embedding dims mismatch → enforce via FK to `embedding_model(key)`; validate before insert.
- Duplicate articles → `content_hash` UNIQUE and idempotent job keys.
- Hybrid query perf → ensure ANN index on `embedding.vector` and tune `lists`; fall back to lexical when `semantic` absent.

## Open Questions

- Queue tech choice (Redis Streams, RQ, Celery, BullMQ) — spec assumes Redis-backed in dev.
- Auth for internal endpoints — default bearer token?
- Rate limits for HN API — poll interval tuning.

