# Production Deployment — 15 August 2026

Record of the stabilization release deployed to the live AWS Lightsail host, and the runbook that
was actually used. Read this together with [Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md).

## The live host as found

| Item            | Value                                                                    |
| --------------- | ------------------------------------------------------------------------ |
| Host            | AWS Lightsail, `13.204.5.57`, `ip-172-26-9-51`                           |
| DNS             | `hrms.anytime-diesel.com` (also `insidesales.anytime-diesel.com`)        |
| SSH             | `ssh -i /path/to/Downloads/hrms/InsidesalesHRMS.pem ubuntu@13.204.5.57` |
| OS / runtime    | Ubuntu 24.04.4 LTS, Node v22.23.2, npm 10.9.8                            |
| Size            | 2 vCPU, 7.8 GB RAM, 154 GB disk (7.6 GB used), **no swap**               |
| Application     | `/opt/anytime-crew-hub`, owned by `ubuntu`                               |
| Process manager | pm2 — `atd-backend` (:4000) and `atd-frontend` (`vite preview` on :8081) |
| Edge            | Caddy on :80/:443, terminates TLS                                        |
| Database        | MySQL on `127.0.0.1:3306`, schema `anytimediesel_hrms`                   |
| Face evidence   | `/var/lib/anytime-crew-hub/face-evidence` (mode 700)                     |

Caddy routes `/api/v1*` and `/api/*` to the backend on :4000 and everything else to the SPA on
:8081, with a 20 MB request body cap. That cap comfortably covers the ~1 MB face frame upload.

An unrelated `tele-dashboard` stack (Docker, its own MySQL, port 8088) shares the host. It was not
touched.

### Live data at the time of deploy

16 users, 15 employees, 130 attendance events, 1 task board, 0 tasks, 0 leave requests, 4 audit
log rows, and **one** approved face profile. Face verification was — and still is —
`verificationEnabled: false` in `face_attendance_settings`.

That last fact removed the main risk of this release. Enrolled face templates were generated in the
browser; server-side inference now derives its own. Because verification is switched off, no
employee could be locked out of attendance by a descriptor mismatch.

### Two things the existing docs got wrong

1. **`/opt/anytime-crew-hub` is not a git checkout.** It has no `.git`. The documented
   `git fetch && git pull --ff-only` update path cannot run there.
2. **The server has no GitHub credentials** — no deploy key in `~/.ssh`, no credential helper, and
   `ssh -T git@github.com` is refused. The read-only deploy key described in the upgrade guide is
   not present on this host.

Until a deploy key is provisioned, releases must be shipped as a code archive built from a local
clone. That is the procedure recorded below.

## What was deployed

Branch `stabilize/full-end-to-end-ui-security-face-attendance`, commit `c90a3d0`, 13 commits ahead
of `main`. Full list in `git log --oneline main..c90a3d0`. The load-bearing changes:

- **Server-side face inference.** Liveness, anti-spoof, confidence, and the face descriptor are now
  computed on the server from the uploaded frame; client-reported scores are ignored. See
  [Face Registration and Verified Attendance](FACE_ATTENDANCE_SECURITY.md).
- **Per-device sessions.** New `user_sessions` table; one account can stay signed in on several
  devices and Developer Admin can revoke them individually.
- **Module access gate fixed.** API paths are matched lowercase and Express now uses case-sensitive
  routing, so `GET /api/ASSETS` can no longer skip the COMPANY module gate.
- **Board policy is a hard gate.** Team or role visibility no longer opens a member-gated board.
- **Face GPS retention.** Attendance face rows stay inside the retention sweep instead of keeping
  coordinates forever.
- **Mobile.** Real Android system-bar insets, working FCM registration, offline app-shell cold
  start, and iOS safe-area corrections.

## Deployment steps as executed

### 1. Verify locally

```bash
npm run typecheck && npm run lint && npx vitest run --config vitest.config.ts
npm run build && npm run build:backend
```

Result: typecheck clean, 152 tests across 26 files passing, lint reporting warnings only, both
bundles building.

### 2. Back up production

Backups live in `/opt/backups/predeploy-<timestamp>/`. This release used
`/opt/backups/predeploy-2026-08-15_13-42-20/`:

```bash
BK=/opt/backups/predeploy-$(date +%F_%H-%M-%S); mkdir -p "$BK"
cd /opt/anytime-crew-hub
MYSQL_PWD="$PW" mysqldump -h 127.0.0.1 -u "$USER" --single-transaction --routines --triggers \
  --databases anytimediesel_hrms | gzip > "$BK/db-anytimediesel_hrms.sql.gz"
cp .env "$BK/env.backup"
tar czf "$BK/code.tar.gz" --exclude=node_modules --exclude=dist --exclude=dist-server .
sudo tar czf "$BK/face-evidence.tar.gz" -C /var/lib/anytime-crew-hub face-evidence
pm2 save && cp ~/.pm2/dump.pm2 "$BK/"
```

Verify the dump before continuing — a dump that gzips fine can still be truncated:

```bash
gzip -t "$BK"/db-*.sql.gz
zcat "$BK"/db-*.sql.gz | grep -c '^CREATE TABLE'      # expect 79
zcat "$BK"/db-*.sql.gz | tail -3 | grep 'Dump completed'
```

`mysqldump` prints `Access denied; you need (at least one of) the PROCESS privilege` while trying to
dump tablespaces. That warning is expected with this grant set and does not affect table data.

### 3. Ship the code

From a clean local clone at the release commit:

```bash
git archive --format=tar.gz -o /tmp/atd-deploy.tar.gz HEAD
scp -i InsidesalesHRMS.pem /tmp/atd-deploy.tar.gz ubuntu@13.204.5.57:/tmp/
```

On the host:

```bash
cd /opt/anytime-crew-hub
tar xzf /tmp/atd-deploy.tar.gz -C /opt/anytime-crew-hub   # .env and runtime dirs are not in the archive
git rev-parse HEAD > DEPLOYED_COMMIT                       # recorded from the build machine
mv node_modules node_modules.predeploy                     # instant, reversible rollback of the install
npm ci --no-audit --no-fund
```

Keeping the old `node_modules` under a rename means a failed install is undone with a second
rename rather than a re-download.

### 4. Migrate, build, restart

```bash
cd /opt/anytime-crew-hub && set -a && . ./.env && set +a
npx prisma generate
npx prisma migrate status      # expect only 20260815120000_user_device_sessions pending
npx prisma migrate deploy
npm run build && npm run build:backend
pm2 restart atd-backend --update-env
pm2 restart atd-frontend --update-env
pm2 save
```

`npm run build` writes to `dist/client` and `dist/server` (TanStack Start layout). The face model
weights land in `dist/client/face-models`, not `dist/face-models`.

`prisma migrate status` also reports two rows for `20260725190000_leave_review_metadata` present in
the database but absent from `prisma/migrations`. That drift predates this release, is only a
warning, and did not block `migrate deploy`. It is listed under open items below.

### 5. Environment additions

```
FACE_SERVER_INFERENCE=true
FACE_MODELS_DIR=/opt/anytime-crew-hub/public/face-models
```

Both match the code defaults, and are written explicitly so the rollback lever is visible in the
file. Setting `FACE_SERVER_INFERENCE=false` and restarting the backend returns face checks to the
old client-trust model without a redeploy.

### 6. Security headers at the edge

The SPA is served by `vite preview`, which sets no security headers. The backend sets its own
through helmet, so headers were added in the Caddyfile scoped to the SPA route only —
`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
and a `Permissions-Policy` that keeps camera and geolocation first-party. The previous Caddyfile is
saved as `/etc/caddy/Caddyfile.bak-<timestamp>`. Apply with
`sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.

A Content-Security-Policy was deliberately **not** added at the edge. The app loads WASM and uses
blob workers and camera streams, so a CSP needs browser testing on real devices first.

## Verification performed after deploy

| Check                                   | Result                                                    |
| --------------------------------------- | --------------------------------------------------------- |
| `/health`, `/health/db`                 | `{"ok":true}`, MySQL reachable                            |
| Public site and API through Caddy       | HTTP 200 on both                                          |
| Row counts after migration              | 16 users, 130 attendance events — unchanged               |
| `user_sessions` table                   | Created, all 11 columns present                           |
| Login with bad credentials              | 401 with a clean message, no 500                          |
| Refresh with a garbage cookie           | 401, no 500 — legacy tokens without `sid` fail safely     |
| Malformed login body                    | 400 with field errors                                     |
| `GET /api/ASSETS` vs `/api/assets`      | 404 vs 401 — the case-sensitivity bypass is closed        |
| CSRF without Origin/Referer             | 403                                                       |
| Service worker build id                 | `2026-08-15-p0-security-hardening`                        |
| Security headers on the SPA             | All five present                                          |
| Face inference on the host              | conf 1.0, liveness 0.93, anti-spoof 0.86, 1024-dim vector |
| Face inference latency (2 vCPU)         | ~1.07 s cold, ~0.45 s warm                                |
| Frame containing no face                | Rejected, not silently accepted                           |
| Backend / frontend memory after restart | ~66 MB each                                               |

## Rollback

The database migration is additive — it creates `user_sessions` and touches nothing else — so a code
rollback needs no database rollback.

```bash
cd /opt/anytime-crew-hub
BK=/opt/backups/predeploy-2026-08-15_13-42-20
rm -rf node_modules && mv node_modules.predeploy node_modules   # if the install is at fault
tar xzf "$BK/code.tar.gz" -C /opt/anytime-crew-hub              # previous code
cp "$BK/env.backup" .env
npm run build && npm run build:backend
pm2 restart atd-backend atd-frontend --update-env
```

Smaller levers, in order of preference:

- Face verification behaving unexpectedly → `FACE_SERVER_INFERENCE=false`, `pm2 restart atd-backend`.
- Edge headers suspected → restore `/etc/caddy/Caddyfile.bak-<timestamp>` and reload Caddy.
- Full data restore → `zcat "$BK"/db-*.sql.gz | mysql -u <user> -p`.

## Expected user-visible effects

- **Everyone is signed out once.** Access tokens now carry a session id, and tokens issued before
  this release do not. The apps redirect to the login screen; they do not error.
- **Old browser tabs may fail a face check-in** until they reload, because the previous bundle does
  not upload the frame that the server now needs. The service worker build id changed, so a reload
  picks up the new bundle. Only relevant once face verification is switched on.
- **Repeated "missed check-in" pushes stop.** They were being resent on every settlement sweep.

## Open items

- **No swap** on a 2 vCPU / 7.8 GB host. Face inference is CPU-bound and holds the models in the
  backend process. Add a 2 GB swap file before enabling face verification for the full workforce.
- **Prisma drift**: `20260725190000_leave_review_metadata` is recorded twice in
  `_prisma_migrations` but does not exist in `prisma/migrations`. Reconcile before the next
  migration-bearing release.
- **No deploy key on the host**, so releases cannot be pulled from GitHub. Provision a read-only
  deploy key and restore `/opt/anytime-crew-hub` as a real checkout to get back to the documented
  update path.
- **No CSP** on the SPA. Needs device testing because of WASM, blob workers, and camera use.
- **pm2 restart counts** were already 67 and 93 before this release. Worth understanding whether
  those are operator restarts or crash loops.
- **Re-enrollment before enabling face verification.** The single existing face template was built
  from browser-derived descriptors. Filters and detector rotation were measured to produce
  byte-identical embeddings under Node, so the two should be compatible, but with one enrolled user
  it is cheaper to re-register than to rely on that.
