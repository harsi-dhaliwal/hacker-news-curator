Purpose

- Implement GET /api/stories route handler matching StoriesPage schema.

Notes

- Validate query: q, tags, topics, domain, sort, since, limit<=100, offset>=0.
- Use lib/db.ts for Postgres; lib/queries.ts for SQL builders; lib/caching.ts for cache keys/TTL.
- Return JSON matching contracts/openapi.yaml → components.schemas.StoriesPage.
- Include Cache-Control and ETag per docs/CACHING_SSR.md.

Blocked by

- lib/db.ts, lib/queries.ts, lib/caching.ts, lib/redis.ts.

