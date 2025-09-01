# Coding Agent Context — Python Summarizer Worker (Redis + LLM)

## Role

Run a Redis-backed worker that reads distilled article payloads, calls an LLM to summarize/classify, validates/normalizes the result, and emits a writer-ready JSON to an output Redis stream. No Postgres access.

## Inputs

- Input stream (`INPUT_QUEUE`, default `summarizer:in`) — messages shaped as:
  ```json
  {
    "trace_id":"ulid-or-uuid",
    "story": {"id":"uuid","hn_id":41300000,"source":"hn","title":"…","url":"https://…","domain":"phoronix.com","created_at":"2025-08-31T05:12:00Z"},
    "article": {"id":"uuid","language":"en","word_count":860,"is_pdf":false,"is_paywalled":false,"text_head":"…","headings":["h1…","h2…"],"text_tail":"…"},
    "hints": {"candidate_tags":["Linux","Btrfs","Meta"],"source_reputation":0.78},
    "metrics": {"points":145,"comments":58,"captured_at":"…"},
    "attempt":0,
    "schema_version":1
  }
  ```

## Deliverables

- Output stream (`OUTPUT_QUEUE`, default `summarizer:out`) — messages shaped as:
  ```json
  {
    "trace_id":"…",
    "story_id":"uuid",
    "article_id":"uuid",
    "model":"gpt-<name>",
    "lang":"en",
    "summary":"≤ ~1–2 short paras or 3 bullets",
    "classification": {"primary_category":"…","type":"news","tags":["…"],"topics":["…"]},
    "ui": {"summary_140":"…","quicktake":["…"],"audience":["…"],"impact_score":62,"confidence":0.83,"reading_time_min":4,"link_props":{"paywall":false,"format":"html","is_pdf":false}},
    "embedding": {"model_key":"default","dimensions":1536,"vector":null},
    "timestamps": {"summarized_at":"ISO8601"},
    "schema_version":1
  }
  ```

## Constraints

- Redis Streams with consumer group `summarizer`; idempotency key `summarizer:done:{article_id}:{model}` with TTL.
- Retries with backoff; DLQ after `MAX_RETRIES` with reason codes.
- Strict Pydantic validation (length caps, ranges, controlled vocab, schema_version match).

## Observability

- Structured JSON logs on stdout: `event`, `level`, `story_id`, `article_id`, `trace_id`, `attempt`, `latency_ms`, `model`, `queue`, `err`.
- `/healthz` HTTP endpoint reports Redis status and last successful LLM call timestamp.

## Acceptance criteria

- Given 3 valid inputs enqueued, worker emits 3 validated outputs to the output stream and acks inputs with idempotency keys set.
