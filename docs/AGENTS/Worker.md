# Coding Agent Context — Scraper Worker (Python)

## Role

Fetch, normalize, and extract article content for stories from the ingest pipeline, dedupe and write to Postgres, then enqueue summarizer-ready messages to `summarizer:in`. Robust retries, DLQ, and structured logs.

## Inputs

- `docs/PIPELINE.md`
- `docs/DATA_MODEL.md`

## Deliverables

- Redis queues/streams: input `ingest:out` (BLPOP), output `summarizer:in` (XADD), plus `scraper:retry` and `scraper:dlq`.
- Modules: `redis_io.py`, `fetcher.py`, `extractor.py`, `normalize.py`, `db.py`, `payloads.py`, `logging.py`, `worker.py`.
- Idempotency: `scraper:done:{story_id}` TTL 7d; `FORCE=true` override.
- Structured JSON logs and counters (log-derived).

## Acceptance criteria

- New articles are upserted with content_hash de-duplication; `story.article_id` linked.
- Messages are emitted to `summarizer:in` matching the summarizer’s expected schema.
- Retryable failures back off and DLQ is populated for non-retryable or exhausted attempts.
