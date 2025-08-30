# Ingest Node Service Specification

Purpose

- Ingest and normalize external Hacker News / RSS / other sources into internal canonical models.

Responsibilities

- Poll or consume feeds (Hacker News API, RSS, webhooks).
- Normalize to `StoryBase`/`Story` models and persist or publish to queue for downstream processing.
- Deduplicate and apply initial enrichment metadata.

Interfaces

- Input: external feeds, webhooks, or scheduled jobs.
- Output: publish normalized messages to queue (topic) consumed by worker/summarizer.
- Optional API: POST /ingest to accept one-off URLs.

Data Contracts

- Produce messages matching `StoryBase.json` or `Story.json` depending on pipeline stage.

Runtime & Environment

- Node.js (Dockerfile in `services/ingest-node/Dockerfile`).
- Environment variables (canonical):
  - DATABASE_URL - Postgres connection string
  - REDIS_URL - Redis connection (used as queue/broker in dev compose)
  - HN_POLL_INTERVAL_SEC (or POLL_INTERVAL)
  - LOG_LEVEL

Reliability & Idempotency

- Ensure idempotent ingest by tracking source IDs and hashes.
- Retry with backoff for transient failures.

Deployment

- Run as scheduled workers or as continuously-running consumer.
- Auto-scale based on feed volume.

Observability

- Emit metrics: items ingested, duplicates, failures.
- Logs with source, item id, and outcome.

Env checklist (canonical)

- DATABASE_URL
- REDIS_URL
- HN_POLL_INTERVAL_SEC
- LOG_LEVEL

Security

- Sanitize fetched content.
- Respect robots.txt and API rate limits.

Tests

- Integration tests that simulate feed input and assert queue output.

Acceptance Criteria

- Incoming items are normalized to `StoryBase` and published once.
- Duplicate items are not re-published.

References

- `docs/PIPELINE.md`, `jsonschemas/StoryBase.json`.
