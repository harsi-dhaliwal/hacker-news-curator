# Coding Agent Context — Node Gateway

## Role

Implement the REST API (contracts/\*) and hybrid SQL queries against Postgres; coordinate with summarizer/worker only if needed.

## Inputs

- `contracts/openapi.yaml`
- `docs/SEARCH_RANKING.md`
- `docs/DATA_MODEL.md`

## Deliverables

- Endpoints:
  - `GET /stories`
  - `GET /stories/{id}`
  - `GET /search`
  - `GET /tags`, `GET /topics`
  - (internal) `POST /_internal/reindex` (noop stub ok)
- SQL:
  - Lexical-only queries
  - Hybrid query that LEFT JOINs semantic CTE results when `semantic=` is present
- Perf:
  - Pagination (`limit<=100`, `offset>=0`)
  - Index use confirmed by EXPLAIN (document in comments)

## Acceptance criteria

- 1:1 with OpenAPI schemas.
- Hybrid returns ordered by combined score; tie-break by `rank_signals.hot_score` then `created_at`.
- Safe parameterization (no SQL injection), robust input validation.
