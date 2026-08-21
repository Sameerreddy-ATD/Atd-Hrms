# Task Planner E2E topology (same-origin auth)

Production auth is unchanged. Cookies stay `httpOnly`, `SameSite=Lax`, and `secure` follows `COOKIE_SECURE`.

## Problem

API on `:4000` and Vite preview on `:4173` put the session cookie on the API origin.
The browser UI origin never receives that cookie, so Playwright “API login then open UI” fails.

## Solution (production-like reverse proxy)

```
Browser  →  http://localhost:4173          (Vite preview)
              │
              ├─ /login, /tasks, …         static SPA
              └─ /api/*  ──proxy──►  http://127.0.0.1:4000/*
                                         (Express API; /api prefix stripped)
```

1. Frontend build uses `VITE_API_BASE_URL=/api` (relative same-origin).
2. Vite `preview` / `server` proxy rewrites `/api` → backend root.
3. Login (`POST /api/auth/login`) and all subsequent fetches share origin `localhost:4173`.
4. Session cookies are stored for that origin — identical to nginx `/api` in production.

## Harness

- Disposable MySQL: `127.0.0.1:3308` (`docker-compose.org-test.yml`)
- Seed: `scripts/e2e-seed.mjs` (includes AWF project + role fixtures)
- Runner: `scripts/run-planner-e2e.sh`
- Spec: `tests/e2e/task-planner-foundation.spec.ts`
- API base in tests: `http://localhost:4173/api` (`E2E_API_BASE_URL`)

## Explicitly not done

- No SameSite / secure cookie weakening in production
- No auth bypass, fake React session injection, or skipped auth
