Purpose

- Provide lightweight /healthz for readiness checks (no DB work).

Notes

- Implement as a route handler returning 200 OK JSON without external calls.
- Keep minimal and constant-time.

