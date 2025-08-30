# Queues & Jobs

## Queues

- `FETCH_ARTICLE`
- `SUMMARIZE`
- `EMBED`
- `TAG`
- `REFRESH_HN_STATS`

## Message shape (suggested)

```json
{
  "job_key": "FETCH_ARTICLE:6d1c...:a1b2...",
  "story_id": "uuid",
  "article_id": "uuid/null",
  "model_key": "default",
  "attempt": 1
}
```

Job lifecycle

Status: queued → running → done | error → (retry) → dead-letter after N tries.

Backoff: exponential (e.g., 2^n \* base).

Observability: log with hn_id, story_id, article_id, job_key.
