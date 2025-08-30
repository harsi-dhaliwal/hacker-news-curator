# Python Summarizer Service Specification

Purpose

- Generate summaries and derived text (e.g., short summary, long summary, embeddings) for stories and articles.

Responsibilities

- Consume messages (story/article) from queue, fetch full text if needed, produce summaries and metadata.
- Optionally call external LLMs or local models for summarization.
- Persist summaries or publish enriched messages for indexing.

Interfaces

- Input: queue messages with `Story` or `Article` payloads.
- Output: enriched message with fields: summary_short, summary_long, embeddings, reading_time.
- Health endpoint for readiness.

Runtime & Environment

- Python service (Dockerfile at `services/summarizer-py/Dockerfile`).
- Default dev port: 8000.
- Environment variables (canonical):
  - DATABASE_URL
  - REDIS_URL
  - OPENAI_API_KEY or MODEL_API_KEY / MODEL_URL
  - EMBEDDING_MODEL_KEY (default)
  - PORT (default 8000)
  - LOG_LEVEL

Performance & Costs

- Batch processing preferred where possible to amortize model calls.
- Rate-limit and monitor token usage if using a paid LLM.

Reliability

- At-least-once processing with de-duplication downstream.
- Idempotent writes for summaries.

Security & Privacy

- Mask or avoid sending PII to third-party models where required.

Observability

- Metrics: processed_count, failures, avg_latency per item.

Env checklist (canonical)

- DATABASE_URL
- REDIS_URL
- OPENAI_API_KEY (or MODEL_API_KEY)
- EMBEDDING_MODEL_KEY
- PORT

Tests

- Unit tests for summarization pipeline and integration tests with a mock model.

Acceptance Criteria

- For a sample set, summaries meet quality thresholds (e.g., ROUGE or human review).
- Summaries are attached to original messages and stored/published.

References

- `docs/AGENTS/PythonSummarizer.md`, `jsonschemas/Article.json`.
