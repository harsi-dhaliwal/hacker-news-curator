# Runbook (Ops)

## Health checks

- api-node: `/healthz` (DB ping)
- summarizer-py: `/healthz` (model ready)
- worker-py: emits heartbeat metric
- redis/postgres: liveness/readiness via compose/k8s

## Backfill (first run)

1. Seed tags/topics (already in SQL).
2. Ingest last 7–14 days (topstories/beststories), batch jobs.
3. `ANALYZE embedding;` after bulk embed.

## Rotating embedding model

1. Insert new row in `embedding_model` (key + dims).
2. Re-embed in background; keep old vectors during transition.
3. Switch query to prefer `model_key=new`.

## Rate limits

- `/api/search` semantic path: per-IP limiter + cache by normalized query.

## Incident playbook

- Redis outage → disable writes to cache, keep DB reads.
- Postgres degraded → raise TTLs, serve stale, shed semantic path.
- Third-party fetch blocked/paywall → mark story as preview-only (no article).
