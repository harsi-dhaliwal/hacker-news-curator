Purpose

- Server-rendered tag feed page at /tag/[slug].

Notes

- Fetch via internal /api/stories?tags=slug; revalidate: 60s.
- Use StoryCard list, Filters, and empty/skeleton states.
- Add generateMetadata using slug name.

Blocked by

- components, lib/caching.ts, lib/queries.ts.

