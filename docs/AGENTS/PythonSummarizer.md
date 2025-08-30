# Coding Agent Context — Python Summarizer/Embeddings (FastAPI)

## Role

Provide `/summarize` and `/embed` endpoints for workers/gateway.

## Inputs

- `docs/DATA_MODEL.md` (works with article.text)
- `infra/sql/001_init.sql` (embedding_model dims)

## Deliverables

- `POST /summarize`:
  - Input: `{ "article_id": "uuid", "model": "gpt-4.1", "lang": "en" }`
  - Output: `{ "article_id": "uuid", "summary": "..." }`
- `POST /embed`:
  - Input: `{ "article_id": "uuid", "model_key": "default" }`
  - Output: `{ "article_id": "uuid", "model_key": "default", "dims": 1536 }`
- Reads article text from DB (read-only).
- Writes rows into `summary` / `embedding`.

## Constraints

- Respect `embedding_model.dimensions`.
- Idempotent: re-running should upsert (same article_id, model/lang or model_key).

## Acceptance criteria

- Pydantic types mirror OpenAPI expectations where applicable.
- Throughput: 50 req/min sustained on local stack (mock models acceptable in dev).
