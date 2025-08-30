# Architecture

## Components

- `apps/web`: Next.js UI + route handlers (`/api/stories`, `/api/search`).
- `services/api-node`: Node gateway implementing OpenAPI contracts; runs hybrid SQL.
- `services/summarizer-py`: FastAPI exposing `/summarize`, `/embed`.
- `services/worker-py`: Celery/RQ workers for FETCH_ARTICLE / SUMMARIZE / EMBED / TAG / REFRESH_HN_STATS.
- `services/ingest-node`: HN poller → upserts story → enqueues jobs.
- `postgres`: Semantic (pgvector) + lexical (tsvector) storage.
- `redis`: Cache + queue broker (depending on choice).

## Read path

CDN/Edge → Next.js Route Handler → Redis (hit) → return OR → Postgres hybrid query → set Redis → return with ETag/Cache-Control → optional ISR revalidate.

## Write path

HN poller → upsert `story` → enqueue `FETCH_ARTICLE` → extract → upsert `article` (dedupe by `content_hash`) → enqueue `SUMMARIZE` + `EMBED` + `TAG` → compute `rank_signals` → optionally warm cache + revalidate ISR.

## Contracts

Source of truth at `contracts/openapi.yaml`. TS/Py types generated from this file only.
