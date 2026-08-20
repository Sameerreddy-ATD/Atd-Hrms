# Platform Foundation — Maintenance Mode

Deployment-controlled update window so employees never see raw 502/503 pages, Prisma errors, or half-migrated APIs while production is being updated.

**Do not use the database as the only source of truth.** Maintenance may be required while migrations run.

## Architecture

```
Internet
   ↓
Caddy  ←── checks /opt/anytime-crew-hub/shared/maintenance.on
   ├─ HTML navigations → public/maintenance.html (works if Vite preview is restarting)
   ├─ /api/health*, /api/maintenance/status → always proxied
   └─ /api/* → Express
         ↓
      maintenanceMiddleware (file: shared/maintenance.json)
         ↓
      JSON 503 { maintenance, code: APP_UPDATE_IN_PROGRESS, … }
         ↓
      React / Capacitor / PWA API client → MaintenanceGate (session preserved)
```

Source of truth (outside release directories when possible):

| Path | Purpose |
|------|---------|
| `/opt/anytime-crew-hub/shared/maintenance.json` | Structured state |
| `/opt/anytime-crew-hub/shared/maintenance.on` | Flag for Caddy `file.exists` |
| Local / CI fallback | `<repo>/shared/maintenance.json` |
| Override | `MAINTENANCE_FILE=/absolute/path.json` |

Conceptual JSON:

```json
{
  "enabled": true,
  "reason": "DEPLOYMENT",
  "message": "The application is being updated by the developer. Please try again after 5–10 minutes.",
  "retryAfterSeconds": 600,
  "startedAt": "2026-08-20T12:00:00.000Z",
  "startedBy": "deployment"
}
```

## Activation / deactivation

Idempotent:

```bash
npm run maintenance:on
npm run maintenance:status
npm run maintenance:off
```

Or: `bash scripts/maintenance.sh {on|off|status}`

On production, prefer creating `/opt/anytime-crew-hub/shared` once:

```bash
sudo install -d -m 775 -o ubuntu -g ubuntu /opt/anytime-crew-hub/shared
```

Reload Caddy after deploying an updated Caddyfile (`sudo systemctl reload caddy`). Flag toggles do not require a Caddy reload.

## HTTP / API behavior

When enabled, normal API routes return:

- Status: `503 Service Unavailable`
- Header: `Retry-After: 600`
- Body:

```json
{
  "maintenance": true,
  "code": "APP_UPDATE_IN_PROGRESS",
  "message": "The application is being updated by the developer. Please try again after 5–10 minutes.",
  "retryAfterSeconds": 600,
  "error": "…"
}
```

`error` mirrors `message` so older clients that only read `error` still show a human sentence (compatible with Android 1.0.15).

Exempt (always available when the process is up):

- `GET /health`
- `GET /health/db` (when registered)
- `GET /maintenance/status` (and `/api/maintenance/status` via strip)

No public `?maintenance=false` bypass. No user bypass in v1.

## Session preservation

**401/403 ≠ 503 maintenance.**

- Do not clear cookies, refresh tokens, or force `/login` on maintenance.
- Frontend `MaintenanceError` / `MaintenanceGate` preserve session storage.
- Auth restore ignores maintenance failures instead of wiping the cached user.

## Mutations

Mutations are rejected **before** route handlers (middleware). UI message for writes:

> Application update is in progress. Your change was not submitted. Please try again after the update.

Do not show success. Do not implement generic offline mutation replay here (Attendance module later).

## Android (Play Store 1.0.15)

- Backend/Caddy remain compatible: JSON still includes `error` string.
- New app builds: API client maps `code=APP_UPDATE_IN_PROGRESS` → full-screen maintenance; Try Again probes `/maintenance/status` or `/health`.
- Do not bump `versionCode` for this web/backend feature alone.

## PWA / iOS Add to Home Screen

- Service worker does **not** permanently cache maintenance HTML as the app shell.
- `/maintenance.html` may be precached as a branded offline fallback only.
- After maintenance ends, Try Again / reload loads the new build; SW activate still purges old static caches via build id.

## Desktop / Mac browsers

`https://hrms.anytime-diesel.com/` should show the branded page (Caddy HTML and/or in-app gate). Verified layouts: 320×568, 390×844, 768×1024, 1440×900.

## Polling / SSE

`openCredentialedEventSource` pauses reconnect storms while maintenance is active and resumes after clear. Auth keepalive skips renew during maintenance. Notification polling already swallows errors (no toast spam).

## Deployment order

```
PRE-DEPLOY CHECKS
→ BACKUP
→ ENABLE MAINTENANCE
→ VERIFY maintenance UI/API
→ BUILD in staging/release dir (scripts/release-build.sh)
→ VALIDATE artifacts
→ PRISMA MIGRATE
→ VERIFY DB
→ RESTART BACKEND → health
→ RESTART FRONTEND → smoke
→ VERIFY CADDY
→ SMOKE LOGIN/API
→ DISABLE MAINTENANCE
→ VERIFY NORMAL APP
→ MONITOR LOGS
```

**If any critical step fails: leave maintenance ON** while rolling back. Do not auto-disable.

## Build hardening

Problem (Module 1): `NODE_ENV=production npm ci` omitted Vite (devDependency) → broken frontend → then a `build:dev` caused `jsxDEV` SSR 500.

Deterministic build:

```bash
npm run release:build
# = npm ci --include=dev
# + stamp app-version / APP_BUILD_ID / sw.js
# + prisma generate
# + production vite build (with asset retention)
# + backend tsc
# + artifact checks
```

Separate **BUILD** (devDependencies allowed) from **RUNTIME** (`NODE_ENV=production` for PM2).

Never switch the live release until artifacts exist (`dist/client`, `dist-server`, `app-version.json`, `maintenance.html`).

## Release identity

`scripts/stamp-app-version.mjs` writes:

```json
{
  "buildId": "2026-08-20-<shortsha>",
  "gitSha": "<full>",
  "builtAt": "<iso>",
  "androidVersionCode": 16,
  "androidVersionName": "1.0.15",
  …
}
```

Android codes are preserved from the previous file unless you change them intentionally.

## Release directory model (current → future)

**Current production:** flat `/opt/anytime-crew-hub` with PM2 cwd there (no `releases/` symlink yet). Archive deploy + in-place build is used today.

**Safe evolution (optional, not forced now):**

```
/opt/anytime-crew-hub/releases/<release-id>/
/opt/anytime-crew-hub/current → releases/<release-id>
/opt/anytime-crew-hub/shared/   # maintenance.json, uploads, .env link
```

Until then: build/validate first, then copy into place; keep previous `code.tar.gz` backup for rollback.

## Security

- No predictable public bypass.
- Status endpoint exposes only `maintenance`, message, retry seconds — no host, paths, or migration details.
- Flag file is local to the host (not world-writable preferred).

## Troubleshooting

| Symptom | Check |
|---------|--------|
| API 503 but browser shows SPA errors | Caddyfile not updated / flag missing → HTML path still hits Vite |
| Maintenance stuck ON | `npm run maintenance:status`; remove `.on` + set JSON `enabled:false` |
| Old PWA after OFF | Hard refresh / Try Again; confirm new `app-version.json` / SW build id |
| Build missing Vite | Use `npm ci --include=dev` / `release:build`, never bare `npm ci` under NODE_ENV=production for build |

## Test process

```bash
npx vitest run tests/maintenance.test.ts tests/maintenance-client.test.ts
npx playwright test tests/e2e/maintenance.spec.ts --project=chromium
npm run release:build   # local dry-run when ready
```

Disposable flow: `maintenance:on` → hit `/api/employees` (503) → `/api/health` (200) → restart backend → still 503 if flag remains → `maintenance:off` → 200.

## Related

- [Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md)
- [Production Deployment 2026-08-15](PRODUCTION_DEPLOYMENT_2026-08-15.md)
- Reference Caddyfile: `deploy/caddy/Caddyfile`
