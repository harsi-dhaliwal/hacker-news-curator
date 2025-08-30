Scope

- App Router scaffold for routes and API handlers. Do not implement code here; use this checklist to build pages and handlers later.

Tasks

- Add GET route handlers:
  - app/api/stories/route.ts → returns StoriesPage (contracts/openapi.yaml) with Cache-Control + ETag (docs/CACHING_SSR.md).
  - app/api/search/route.ts → returns SearchResults (lexical+hybrid hooks in lib/queries.ts).
- Pages (SSR, revalidate 60s):
  - app/page.tsx → hot feed using /api/stories.
  - app/tag/[slug]/page.tsx → filtered feed; cache key tag:slug.
  - app/topic/[slug]/page.tsx → filtered feed; cache key topic:slug.
  - app/domain/[name]/page.tsx → filtered feed; cache key domain:name.
- Metadata: implement generateMetadata with canonical URLs.
- Error/loading UI: use Skeletons and EmptyState components.

References

- docs/AGENTS/Web.md, docs/CACHING_SSR.md, docs/SEARCH_RANKING.md, contracts/openapi.yaml.

