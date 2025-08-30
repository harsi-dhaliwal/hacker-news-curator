# Worker Service Specification

Purpose

- Background workers to process pipeline jobs: enrichment, linking, caching, indexing.

Responsibilities

- Consume queue messages from ingest or API triggers.
- Run tasks: fetch article content, extract metadata, trigger summarizer, update index.
- Retry failed tasks and route poison messages to DLQ.

Interfaces

- Input: message queue topics (ingest-normalized, summarizer-results).
- Output: DB updates, index writes, notifications.

Runtime & Environment

- Python (Dockerfile at `services/worker-py/Dockerfile`).
- Environment variables (canonical):
  - DATABASE_URL
  - REDIS_URL
  - INDEXER_URL (if using external search index)
  - LOG_LEVEL

Reliability

- Use visibility timeouts and checkpointing.
- Dead-letter queue for repeated failures.

Observability

- Task success/failure counts, processing latency.

Env checklist (canonical)

- DATABASE_URL
- REDIS_URL
- INDEXER_URL
- LOG_LEVEL

Security

- Validate inputs and limit resource usage per task.

Tests

- Worker integration tests with a local queue emulator.

Acceptance Criteria

- Tasks complete and side effects (DB/index) are correct for sample inputs.

References

- `docs/QUEUE_JOBS.md`, `docs/AGENTS/Worker.md`.
