Plan

- db.ts: Server-only Postgres pool with safe parameterization.
- redis.ts: Redis client for caching.
- caching.ts: Key builders (feed:hot, feed:tag:{slug}, search:{q}), TTL constants, ETag helpers.
- queries.ts: SQL builders for feeds and hybrid search; confirm index usage per docs/AGENTS/NodeGateway.md queries logic but adapted for web.

Constraints

- Read-only operations; no writes from Web.
- Exact OpenAPI shapes for API route responses.

