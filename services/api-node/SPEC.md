# API Node Service Specification

Purpose

- Primary HTTP API gateway for frontend and internal services. Orchestrates data access and business logic.

Responsibilities

- Serve REST endpoints for stories and articles.
- Authentication and rate limiting (if required).
- Validate and transform data against `jsonschemas/`.
- Expose health and metrics endpoints.

Primary Endpoints (from `contracts/openapi.yaml`)

- GET /stories - list with query, paging, ranking params (supports `q`, `semantic`, `tags`, `topics`, `domain`, `sort`, `since`, `limit`, `offset`)
- GET /stories/{id} - story detail (uuid)
- GET /search - hybrid search (lexical + semantic)
- GET /tags - list tags
- GET /topics - list topics
- POST /\_internal/ingest/hn - internal ingest endpoint (auth required)
- POST /\_internal/reindex - trigger reindex/rebuild embeddings/tsvector
- GET /healthz - health/readiness

Data & Contracts

- Uses `Story.json`, `StoryBase.json`, `Article.json` for request/response shapes.
- Return 4xx on validation errors, 5xx on server failures.

Runtime & Environment

- Node.js service (Dockerfile present at `services/api-node/Dockerfile`).
- Default dev port: 4000.
- Environment variables (canonical):
  - DATABASE_URL - Postgres connection string (postgres://postgres:postgres@db:5432/hn_curator)
  - REDIS_URL - Redis connection (redis://redis:6379)
  - PORT - service port (default 4000)
  - LOG_LEVEL
  - JWT_SECRET or AUTH config for internal endpoints

Deployment & Scaling

- Stateless HTTP service behind load balancer.
- Scale horizontally; keep sessions external (JWT/cookie backed by secrets store).

Observability & Health

- /metrics (Prometheus), /healthz.
- Structured JSON logs.

Env checklist (canonical)

- DATABASE_URL
- REDIS_URL
- PORT
- LOG_LEVEL
- JWT_SECRET (or other auth secrets)

Security

- Input validation, rate limiting, CORS policy allowing `apps/web` origin.
- Auth: require bearer tokens for write endpoints.

Tests

- Unit tests for controllers and schema validation.
- Integration tests against a test DB or mocked upstream services.

Acceptance Criteria

- Endpoints conform to JSON schemas.
- Health endpoint returns 200 when dependencies are reachable.
- Docker image builds and runs with configured PORT.

References

- `jsonschemas/`, `docs/ARCHITECTURE.md`, `docs/PIPELINE.md`.
