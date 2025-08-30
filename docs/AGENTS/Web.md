# Coding Agent Context — Web (Next.js)

## Role

Implement the Next.js app and route handlers that read from Redis/Postgres and render the UI.

## Inputs

- Contracts: `contracts/openapi.yaml`
- DB: `infra/sql/001_init.sql`
- Read flow/caching: `docs/CACHING_SSR.md`
- Queries: `docs/SEARCH_RANKING.md`

## Deliverables

- Route handlers:
  - `GET /api/stories` (matches OpenAPI StoriesPage)
  - `GET /api/search` (matches OpenAPI SearchResults)
- Server components/pages:
  - `/` hot feed (SSR, revalidate 60s, tag `feed:hot`)
  - `/tag/[slug]`, `/topic/[slug]`, `/domain/[name]`
- Lib:
  - `lib/db.ts` Postgres pool
  - `lib/redis.ts`
  - `lib/caching.ts` (key builder; TTL constants)
  - `lib/queries.ts` (SQL builders; hybrid join hooks)
- UI:
  - `StoryCard`, `Filters`, `SearchBox`
  - Skeletons & empty states

## Non-goals

- No write endpoints. No auth.

## Acceptance criteria

- Cache-first: Redis hit returns in <20ms; miss falls back to DB and caches.
- OpenAPI shape exactly matched (keys, types).
- Headers: `Cache-Control` and ETag present on API responses.
- Pages render deterministically with provided query params.
