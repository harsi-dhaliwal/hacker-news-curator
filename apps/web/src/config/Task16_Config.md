Plan

- Read and validate env vars:
  - NEXT_PUBLIC_API_BASE_URL (for client fetch if needed)
  - NEXT_PUBLIC_BASE_URL
  - DATABASE_URL (server-only, if using direct DB reads)
  - REDIS_URL (server-only)
- Provide constants for cache TTLs.

