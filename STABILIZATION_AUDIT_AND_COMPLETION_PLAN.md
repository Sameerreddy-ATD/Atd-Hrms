# Stabilization Audit and Completion Plan

Branch: `stabilize/full-end-to-end-ui-security-face-attendance`

This records what was audited across the app, what was fixed, and what is knowingly left. It is
written for whoever picks this up next, including the version of us that has forgotten the details.

## How the audit was run

Seven parallel deep audits covered backend/RBAC, security infrastructure, frontend UI, mobile/PWA/
Capacitor, face attendance, the task board, and the database. Findings were then re-verified against
the working tree, because the tree was changing while the audits ran and several findings were
already fixed by the time they landed.

## Verified sound — do not "fix" these

Worth stating explicitly, because each of these looks suspicious until you read it closely:

- **Token, cookie, and session crypto.** HTTP-only cookies, CORS and CSRF handling, and the
  per-device session model are correct.
- **Upload validation.** Magic-byte sniffing is real, not extension-based.
- **Face data at rest.** AES-256-GCM with a `v1.` envelope, a fresh IV and auth tag per file, mode
  `0600`, and evidence keys that cannot be path-traversed.
- **Issue-key allocation.** `SELECT … FOR UPDATE` inside an interactive transaction. Concurrent
  creates serialize; they do not collide.
- **Optimistic concurrency.** Board archive, board config, task update, and task log all use
  versioned `updateMany` and check the affected count.
- **Responsive layout.** 20 routes at 4 widths, 320 to 1440, produced no page-level horizontal
  overflow.

## Fixed on this branch

### Authorization

- **Module-access gate failed open on casing.** `moduleForApiPath` compared the raw request path
  while Express matched routes case-insensitively, so `GET /ASSETS` reached the assets handler and
  skipped the `COMPANY` check. Paths are lowercased and routing is now case-sensitive, so the two
  cannot disagree again.
- **Board policy was bypassable.** `assertCanViewTask` and `assertCanAccessTask` treated board
  access as an alternative to the org-team rule, so a department head or HR could read a
  MEMBER_GATED board they were excluded from via any task with an assignee in their subtree.
  `getMutableBoard` skipped the check entirely for MAIN_ADMIN, CEO, and HR. Board policy is now a
  hard precondition on every board-linked task, which also closes the cross-board move that could
  launder a gated issue onto an OPEN board.
- **Cross-review IDOR** in `PATCH /lifecycle/performance/reviews/:id`: goal IDs must now belong to
  the review, and the update runs in a transaction.

### Face attendance

- **The server now runs its own inference** (`server/src/faceInference.ts`). Liveness, anti-spoof,
  confidence, and the descriptor are derived from the submitted frame via Human on the tfjs WASM
  backend. The client's numbers are diagnostic only. See `docs/FACE_ATTENDANCE_SECURITY.md`.
- **Enrollment templates are bound to the reviewed photos**, built from server-derived descriptors,
  so an admin can no longer approve a face that is not the one in the stored template.
- **`challengeCompleted` was `z.literal(true)`**, making the server's own check unreachable. It is a
  boolean again.
- **GPS was retained forever.** Attendance evidence rows were created with `deletedAt` already set —
  the field was overloaded to mean "no image" — so the retention sweep never matched them. Rows are
  created live and the sweep clears their coordinates on schedule.
- **Registration reset left photos on disk.** It now removes the files and rows and preserves the
  consent metadata in the audit entry.
- **Duplicate detection** now covers pending and rejected profiles, not only approved ones.
- **Auto-approval** no longer records the enrolling employee as their own approver.
- Face and change-password endpoints have dedicated rate limiters. Model packages are pinned exactly.

### Mobile, PWA, and native

- Capacitor `server.errorPath` so an offline Android cold start shows the bundled fallback.
- **Android push actually registers with FCM.** `register()` was skipped along with the Capacitor
  permission calls, but only the permission path triggers the Samsung NPE it was avoiding.
  `POST_NOTIFICATIONS` is requested natively in `MainActivity`, and FCM notification icon and colour
  metadata are declared.
- **Real system-bar insets.** Chromium derives `env(safe-area-inset-*)` from a display cutout only,
  so notchless phones reported zero while drawing edge-to-edge. `MainActivity` publishes actual
  `WindowInsets` as `--atd-inset-*`; they are `0px` off Android, so nothing else changes.
- The PWA caches each successful navigation as an app shell, so offline launches render the app
  instead of a 503 card. Navigation timeout raised to 15s.
- Safe-area handling for `AlertDialog`, the top `Sheet` close button, and `Drawer`. Viewport opts
  into `interactive-widget=resizes-content`. iOS status-bar style and URI scheme corrected.

### UI and platform

- **The Profile save bar was broken for everyone without reduced motion.** `.aw-page-enter` resolved
  to `transform: translateY(0)`, and any non-`none` transform makes that element the containing
  block for `position: fixed` descendants. The resting keyframe is `transform: none`.
- Face-security photo dialog scrolls instead of clipping.
- CSV exports escape formula-leading cells, so a crafted employee name cannot execute in Excel.
- Malformed request bodies return 400/413/415 instead of 500.
- Service-worker build ID is back in sync with `APP_BUILD_ID`.

### Infrastructure

- MySQL 8 on Docker for local verification; schema annotated so `migrate diff` reports no drift.
- `scripts/verify-api-flows.mjs` (44 HTTP checks) and a Playwright responsive sweep.
- `npm audit --omit=dev` is clean.

## Accepted, not fixed

Each of these was a deliberate call, not an oversight.

- **The shared support password stays.** It can sign in as any non-Developer-Admin account. It is
  audited distinctly as break-glass, rate-limited, time-boxed to 1–24 hours, and forces a password
  change. Product decision: operationally necessary.
- **Check-out is not face-verified**, so half of each attendance pair is unverified. The verifier
  already supports it; enabling it is a policy decision.
- **Geofencing is computed but not enforced.** Out-of-radius punches are recorded as unattributed
  rather than rejected.
- **A pending registration can be swapped after review.** Approve carries no reference to the
  evidence version the admin looked at. Fix is the optimistic-concurrency pattern already used for
  correction requests.

## Still open, in priority order

1. **Task board.** No attachment download route (uploads are write-only); attachment mime types are
   client-asserted with no allowlist; `POST /tasks/:id/logs` has no write-permission check;
   `CANCELLED` nulls `stageId` and hides the issue from the kanban view; the board directory fetches
   every open task id for every board.
2. **Kanban drag-and-drop does not work on touch devices.** It is HTML5 DnD only, and kanban is the
   default view — so on the Play Store build there is no way to move a card. Needs pointer-event DnD
   or an explicit "Move to…" control.
3. **Frontend consistency.** Empty states render on error with no retry; several forms allow
   double-submit; roughly 134 `Label`s lack `htmlFor`.
4. **Play Store submission.** Screenshots do not exist. App Links claim the whole host including
   `/privacy` and `/terms`, which reviewers need to reach as web pages. Maskable icons lack the
   80% safe zone.
5. **SPA security headers.** `vite preview` serves without helmet/CSP/HSTS.
6. **Integration tests for board access.** Coverage is schema-only; every board P0 above would have
   been caught by a modest route-level suite.

## Acceptance suite

| Check | Command | Status |
| --- | --- | --- |
| Prisma schema | `npx prisma validate` | pass |
| Types | `npm run typecheck` | pass |
| Lint | `npm run lint` | 0 errors, 10 warnings (shadcn `react-refresh`) |
| Unit/integration | `npm test` | 151 pass |
| Frontend build | `npm run build` | pass |
| Backend build | `npm run build:backend` | pass |
| Dependencies | `npm run audit:deps` | 0 vulnerabilities |
| Database | `npm run db:verify && npm run db:audit` | pass |
| API flows | `node scripts/verify-api-flows.mjs` | 44/44 |
| Responsive | `npx playwright test tests/e2e/responsive.spec.ts` | 320 assertions pass |

## Gotchas for the next person

- **The face enrollment gate masks RBAC.** Testing without approved faces returns 403 everywhere and
  makes RBAC look green when it is not. Run `npx tsx scripts/seed-test-faces.ts` first.
- **Do not bump `@vladmandic/human` casually.** A descriptor-space change silently breaks matching
  against every stored template. Treat it as a migration requiring re-enrollment.
- **Do not regenerate the migrations that narrow `company_assets.notes`.** Prisma will offer to
  shrink it from `VARCHAR(1000)` to `191`. It is annotated in the schema for this reason.
- **Local MySQL runs on port 3308**, not 3307 — 3307 was taken by another project.
- Prefer surgical fixes that match existing patterns: `ErrorState`/`EmptyState`, `h-11 sm:h-9` touch
  targets, and the dialog scroll shell used in `_app.employees.tsx`.
