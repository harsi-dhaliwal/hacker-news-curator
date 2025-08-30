Purpose

- Client-visible search results page consuming /api/search, with hybrid support.

Notes

- Server-rendered, uses searchParams; revalidate as appropriate or rely on client fetch.
- Render list of results with combined score; show match type (lexical/hybrid/semantic).

Blocked by

- /api/search implementation; components; utils URL helpers.

