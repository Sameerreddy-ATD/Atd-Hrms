# Database Scripts

This project runs on **MySQL 8.0**. The Express backend and Prisma client both read `DATABASE_URL` from `.env`.

## `start-mysql.ps1`

Starts the project-local MySQL server on `127.0.0.1:3306` using the drive-root
`mysql-data` directory. The drive-root location avoids a Windows/InnoDB path comparison
problem seen with deeply nested workspace paths.

```powershell
$env:MYSQL_ROOT_PASSWORD = "use-a-strong-local-password"
$env:SEED_PASSWORD = "use-a-strong-initial-admin-password"
npm run db:start-mysql
```

Use this when the Windows `MySQL80` service is not running. The credentials are required
only for first-time initialization. On a fresh data directory the script initializes MySQL,
creates `anytimediesel_hrms`, deploys every migration, and seeds baseline accounts. It stops
with a non-zero exit code if any of those steps fail. It is a no-op if MySQL is already listening.

## `verify-mysql.mjs`

Checks that Prisma can connect to MySQL, reports key table counts, and fails when linked
User/Employee profiles or lifecycle states have drifted. It also reports legacy expense
attachments that lack the Google Drive sharing confirmation.

```bash
npm run db:verify
```

## `smoke-employee-api.ps1`

Runs the complete versioned Employee API flow against a local test database: API-key
creation and revocation, scoped authentication, employee create/read/update/deactivate,
idempotent replay, optimistic conflict handling, change events, login-profile mirroring,
and expense-history retention. The script refuses non-local database hosts.

```powershell
$env:DATABASE_URL = "mysql://root:password@127.0.0.1:3306/anytimediesel_hrms"
$env:SMOKE_CONFIRMATION = "LOCAL TEST DATABASE"
$env:SMOKE_ADMIN_EMAIL = "developer@example.com"
$env:SMOKE_ADMIN_PASSWORD = "local-admin-password"
npm run test:employee-api
```

The test intentionally writes local test records. Never point it at staging or production.

## `start-local-ui-test.ps1`

Starts the compiled backend and Vite frontend for browser verification. It uses the same
`127.0.0.1` hostname on both sides so browser cookies are sent consistently.

```powershell
$env:DATABASE_URL = "mysql://root:password@127.0.0.1:3306/anytimediesel_hrms"
npm run test:local-ui:start
```

## `migrate-postgres-to-mysql.ps1`

One-time legacy utility for copying data from an old PostgreSQL database into MySQL.

Requirements:

- PostgreSQL source still available on `127.0.0.1:5432`
- Empty MySQL target tables created by `npm run db:deploy`
- `psql` and `mysql` client binaries installed

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/migrate-postgres-to-mysql.ps1
```

This script is not part of normal development after the MySQL cutover.

## Script Safety

- Run scripts from the repository root.
- Back up production before migration or bulk data operations.
- Never place passwords directly in scripts or commit generated SQL/database files.
- Production uses `npm run db:deploy`; `npm run db:migrate` is development-only.
