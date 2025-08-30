Purpose

- Implement GET /api/search route handler matching SearchResults (OpenAPI).

Notes

- Accept q (lexical), semantic (optional), k (1..100).
- On cache hit, return cached JSON with ETag; on miss execute query:
  - Lexical: ts_rank on article.tsv.
  - Hybrid: when semantic is present, join embedding ANN CTE; combine scores per docs/SEARCH_RANKING.md.
- Respect pagination/windowing strategy if needed.

Blocked by

- lib/queries.ts hybrid hooks; lib/db.ts; lib/caching.ts; lib/redis.ts.

