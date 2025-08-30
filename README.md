# Hacker News Curator

A cleaner, smarter Hacker News: gorgeous UI, AI summaries, semantic search, and personalized ranking.

## High-level

- **Frontend:** Next.js (App Router, Tailwind)
- **APIs:** Node gateway (REST matching `/contracts/openapi.yaml`)
- **AI services:** Python (FastAPI) for summaries/embeddings
- **Workers:** Python jobs for fetch → extract → summarize → embed → tag → rank
- **DB:** Postgres + pgvector (semantic) + tsvector (lexical)
- **Cache:** Redis (cache-first reads, ISR revalidate)
