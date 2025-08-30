# Web App Specification

Purpose

- Frontend for Hacker News Curator: browse, search, and view curated stories and articles.

Responsibilities

- Render curated lists, story and article pages.
- Client-side search, results ranking UI hooks.
- Authentication UI (if present).
- SSR/SSG for performance and SEO.

API / Interfaces

- Consumes internal API (likely `api-node`) endpoints for:
  - GET /stories?query=&page=
  - GET /stories/:id
  - GET /articles/:id
- Uses JSON schemas from `jsonschemas/Story.json`, `Article.json` for rendering and validation.

Data Contracts

- Story shape: follow `jsonschemas/Story.json` and `StoryBase.json` for list vs detail.
- Article shape: follow `jsonschemas/Article.json`.

Runtime & Environment

- Node/Next.js app (see `package.json`).
- Default dev port: 3000.
- Environment variables (minimal):
  - DATABASE_URL - Postgres connection string (used by server-side code)
  - REDIS_URL - Redis connection for queues/cache
  - NEXT_PUBLIC_API_BASE_URL - base URL for backend API (e.g. http://localhost:4000)
  - NEXT_PUBLIC_BASE_URL - public URL for the site (e.g. http://localhost:3000)
  - NODE_ENV

Deployment

- Dockerfile and Dockerfile.dev present in `apps/web/`.
- Should run with build-time next build and serve or next start for production.
- Expose port 3000 by default.

Health & Observability

- Health endpoint: `/healthz` (service readiness). Frontend should also expose a lightweight `/healthz` for deployment checks or rely on the proxy's health.
- Capture frontend telemetry (errors, performance) and user interaction metrics.

Env checklist (canonical)

- DATABASE_URL (postgres://postgres:postgres@db:5432/hn_curator)
- REDIS_URL (redis://redis:6379)
- NEXT_PUBLIC_API_BASE_URL
- NEXT_PUBLIC_BASE_URL
- OPENAI_API_KEY (optional for summarizer integrations)

Security

- Sanitize and escape user content.
- Limit injected HTML; use a safe sanitizer for summaries.

Tests & QA

- Unit tests for components and small integration tests for pages.
- E2E tests to validate search and story detail flows.

Acceptance Criteria

- Page lists render from API responses matching `Story` schema.
- Story/Article pages render and metadata (title/description) are present for SEO.
- Production Docker image builds and serves the site.

References

- `jsonschemas/`, `docs/` (SEARCH_RANKING.md, AGENTS/Web.md, DATA_MODEL.md).
