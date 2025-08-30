Purpose

- Server-rendered domain feed page at /domain/[name].

Notes

- Fetch via /api/stories?domain={name}; revalidate: 60s.
- Use StoryCard list; Filters; skeletons; empty state.

Blocked by

- components, lib/caching.ts.

