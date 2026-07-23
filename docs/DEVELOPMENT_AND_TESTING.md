# Development and Testing Guide

This guide covers repeatable local development and the checks required before a release.

## Prerequisites

- Node.js 22 or newer
- npm
- MySQL 8
- PowerShell for Windows helper and smoke scripts
- Chromium installed by Playwright when browser tests are required

## First-Time Windows Setup

```powershell
Set-Location D:\Employee-Management-System
npm ci
Copy-Item .env.example .env
```

Set strong local values in `.env`. To initialize the project-managed local MySQL database:

```powershell
$env:MYSQL_ROOT_PASSWORD = "local-root-password"
$env:SEED_PASSWORD = "initial-developer-admin-password"
npm run db:start-mysql
```

For a separately managed MySQL instance, create an empty `utf8mb4` database, configure
`DATABASE_URL`, then run:

```powershell
npm run db:deploy
npm run db:seed
```

Run `db:seed` only for a new development or demo database.

## Daily Development

With MySQL already running:

```powershell
npm run dev:all
```

Or start the services separately with `npm run dev:backend` and `npm run dev`. The browser uses
`http://localhost:5173`; backend health endpoints are `http://localhost:4000/health` and
`http://localhost:4000/health/db`.

`npm run dev:with-db` starts the project-managed MySQL service and both development processes. See
`scripts/README.md` for its required environment variables and behavior.

## Database Changes

1. Update `prisma/schema.prisma`.
2. Create a development migration with `npm run db:migrate` against a disposable/local database.
3. Review generated SQL for destructive changes, locks, backfills, and constraint compatibility.
4. Regenerate Prisma Client if required: `npx prisma generate`.
5. Run `npm run db:audit` against a representative database.
6. Update database, integration, upgrade, and reset documentation as applicable.

Production uses only `npm run db:deploy`. Never run `prisma migrate dev` in production and never
modify an already-applied migration.

## Required Pull-Request Checks

```powershell
npx prisma validate
npm run repo:audit
npm run typecheck
npm run lint
npm test
npm run build
npm run build:backend
npm run audit:deps
```

When a MySQL database is available, also run:

```powershell
npm run db:verify
npm run db:audit
```

The repository currently permits known `react-refresh/only-export-components` warnings in shared
UI/auth modules; lint errors are blocking.

## Test Matrix

| Command                     | Scope                                                                       | Data impact                                               |
| --------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| `npm test`                  | Unit, business-rule, schema, RBAC, and security tests                       | None                                                      |
| `npm run test:e2e`          | Desktop Chromium and Pixel 7 role/navigation flows                          | Uses configured browser environment                       |
| `npm run test:tasks`        | Board config/archive, assignment, activity, stage, and conflict persistence | Writes only to guarded disposable local database          |
| `npm run test:employee-api` | Credential, CRUD, synchronization, idempotency, and retention               | Writes local test records; explicit confirmation required |
| `npm run test:data-reset`   | Destructive reset and first-real-login flow                                 | Deletes data only in guarded disposable local database    |
| `npm run repo:audit`        | Required files, forbidden tracked content, and local documentation links    | Read-only                                                 |
| `npm run db:audit`          | Tables, foreign keys, migrations, and cross-table invariants                | Read-only                                                 |
| `npm run audit:deps`        | Known production dependency vulnerabilities                                 | Read-only network request                                 |

Smoke scripts intentionally reject production/remote databases. Follow `scripts/README.md` exactly.

## Browser and Mobile Acceptance

For screens changed in a release, verify:

- desktop Chromium and a narrow mobile viewport;
- loading, error, empty, populated, and permission-denied states;
- keyboard focus, accessible names, and dialog close/cancel behavior;
- no document-level horizontal overflow at 320 px and 390 px;
- API failures produce a clear message and do not create duplicate writes; and
- role-restricted controls remain enforced by the backend.

## Commit Hygiene

- Keep commits focused and include their migration/documentation updates.
- Run `git diff --check` and `npm run repo:audit` before committing.
- Do not commit `.env`, secrets, database dumps, generated output, test reports, or temporary data.
- Explain destructive migrations and rollback limitations in the commit and upgrade guide.
