Purpose

- Server-rendered topic feed page at /topic/[slug].

Notes

- Fetch via /api/stories?topics=slug; revalidate: 60s.
- Use StoryCard list; Filters; skeletons; empty state.

Blocked by

- components, lib/caching.ts.

