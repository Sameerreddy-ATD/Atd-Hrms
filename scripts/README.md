# Database Scripts

This project runs on **MySQL 8.0**. The Express backend and Prisma client both read `DATABASE_URL` from `.env`.

## `backup-to-gdrive.sh`

Daily production backup: full `mysqldump` of `DATABASE_URL` plus `FACE_EVIDENCE_DIR` → Google Drive
(`HrmsBackups/`, **3-day** retention) via rclone. Same approach as the Tele Dashboard backup. See
the script header and root `README.md` → **Daily backup → Google Drive**.

## `start-all.ps1`

Starts the project-managed MySQL instance, backend watcher, and frontend development server for a
complete Windows development session.

```powershell
$env:MYSQL_ROOT_PASSWORD = "use-a-strong-local-password"
$env:SEED_PASSWORD = "required only when initializing a fresh database"
npm run dev:with-db
```

If the database is already initialized, the script starts it without reseeding. Use `npm run
dev:all` when MySQL is managed separately or already running as a Windows service.

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

## `audit-database.mjs`

Performs a read-only audit of every table, all foreign keys, migration state, employee/account
synchronization, organization cycles, attendance, leave, expenses, HR documents, assets, Task data,
and credential-storage naming. It prints row counts and a machine-readable result without printing
employee personal data or secret values.

```bash
npm run db:audit
```

Use this after migrations and before enabling an integration. A non-zero exit code means a blocking
integrity issue was found. See `docs/DATABASE_INTEGRITY_AUDIT.md`.

## `audit-repository.mjs`

Performs a read-only repository check. It verifies required files, prevents generated or sensitive
paths from being tracked, rejects retired mock paths, validates local Markdown links, confirms every
guide is listed in the documentation index, and checks required npm scripts.

```bash
npm run repo:audit
```

Run it before every commit and after adding, moving, or deleting documentation.

## `check-i18n-keys.ts`

Compares every translation key the UI references against the English, Telugu, and Hindi locale
files. A missing key is a user-visible bug: i18next falls back to printing the key itself, so a
button reads `pages.assets.tabEquipment` instead of "Employee equipment". The check also reports
keys defined in English but absent from the other languages, and duplicate keys inside a locale
file, where the later copy silently wins.

```bash
npm run check:i18n
```

Keys assembled at runtime, such as `` t(`pages.settings.moduleLabels.${module}`) ``, cannot be
verified and are listed at the end of a passing run so they can be checked by hand. `npm run build`
runs this script through `prebuild`, so a missing key fails the build instead of reaching users.

## `smoke-tasks.ps1`

Runs the complete Work Planner flow against a disposable local database: board creation/configuration,
task creation and stage movement, activity logging, stale task/board write rejection, and board
archive/restore. It verifies assignment, stage/status synchronization, activity history, and
optimistic version increments.

```powershell
$env:DATABASE_URL = "mysql://root:password@127.0.0.1:3306/anytimediesel_task_validation"
$env:TASK_SMOKE_PASSWORD = "password-used-for-the-disposable-seed"
npm run build:backend
npm run test:tasks
```

The script refuses remote hosts and database names that do not contain `task_validation`.

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

## `smoke-reset-test-data.ps1`

Exercises the destructive reset only against a disposable localhost database whose name contains
`reset_validation`. It verifies the preserved Developer Admin session, branches, departments,
leave policies, removal of seeded users/employees, and creation of the first real account.

```powershell
$env:DATABASE_URL = "mysql://root:password@127.0.0.1:3306/anytimediesel_reset_validation"
$env:RESET_SMOKE_CONFIRMATION = "DISPOSABLE LOCAL RESET DATABASE"
$env:RESET_SMOKE_SEED_PASSWORD = "password-used-for-the-disposable-seed"
npm run test:data-reset
```

The script refuses remote hosts and database names that do not contain `reset_validation`.

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
