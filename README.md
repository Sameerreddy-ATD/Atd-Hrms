# AnytimeDiesel HRMS

Production-oriented HRMS frontend plus Node/Express backend for secure login, RBAC, employee management, branch/device management, attendance movement timelines, leave, profile requests, reports, and audit logs.

The application uses **MySQL 8.0** as its only runtime database. Prisma connects through `DATABASE_URL`; the frontend never talks to the database directly.

## Prerequisites

- Node.js 22+
- MySQL Server 8.0+
- npm

## Install

```bash
npm install
```

## Environment

Create `.env` from `.env.example` and set strong secrets:

```bash
cp .env.example .env
```

Important variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection string for Prisma and the backend |
| `MYSQL_ROOT_PASSWORD` | Optional. Used by `npm run db:start-mysql` on Windows |
| `FRONTEND_ORIGIN` | Exact frontend origin, for example `http://localhost:5173` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Strong, different production secrets |
| `COOKIE_SECURE` | Set `true` in production behind HTTPS |

Example `DATABASE_URL`:

```text
mysql://root:your-password@127.0.0.1:3306/anytimediesel_hrms
```

Do not commit `.env` or real secrets.

## Database (MySQL)

### Daily development

1. Start MySQL.
2. Apply migrations if the schema changed.
3. Start the backend and frontend.

```bash
npm run db:start-mysql   # Windows project-local MySQL helper
npm run db:deploy        # production-safe migration apply
npm run dev:backend
npm run dev
```

Use `npm run db:migrate` instead of `db:deploy` only when you are actively authoring new Prisma migrations in development.

### First-time setup

If you already have MySQL Server installed and running as a Windows service, create the database once:

```sql
CREATE DATABASE anytimediesel_hrms
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

If the Windows `MySQL80` service is unavailable, this repo can run a project-local MySQL instance from `.mysql-data-clean/`:

```bash
npm run db:start-mysql
```

Then deploy the schema and seed baseline data:

```bash
npm run db:deploy
npm run db:seed
```

Verify the backend can reach MySQL:

```bash
npm run db:verify
curl http://localhost:4000/health/db
```

Expected health response:

```json
{ "ok": true, "provider": "mysql", "database": "reachable" }
```

### Database scripts

| Command | Purpose |
| --- | --- |
| `npm run db:start-mysql` | Start project-local MySQL on `127.0.0.1:3306` |
| `npm run db:migrate` | Create/apply Prisma migrations in development |
| `npm run db:deploy` | Apply committed migrations in dev or production |
| `npm run db:seed` | Seed predefined password and demo data on empty DB |
| `npm run db:verify` | Confirm Prisma can read from MySQL |

Script files live in `scripts/`:

- `start-mysql.ps1` — starts the local MySQL data directory
- `verify-mysql.mjs` — quick Prisma connectivity check
- `migrate-postgres-to-mysql.ps1` — one-time legacy transfer utility only

### Seed credentials

The initial seed configures a predefined temporary login password:

```text
ChangeMe@12345
```

Seed users include Developer Admin, CEO, HR, Manager, Employee, Sales, and Driver accounts. The seed also creates two branches, two biometric devices, biometric mappings, leave types, and a sample full movement day: Branch 1 thumb in/out, Branch 2 thumb in/out, then client GPS check-in/check-out.

If you migrated from an existing database, user passwords remain whatever they were before migration.

### Predefined new-account password

HR, Main Admin, and Developer Admin can:

- Update the predefined password from **System Settings**
- Use it when creating new logins from **User Logins → Create Login**
- Reset individual user passwords from **User Logins**

Only the bcrypt hash is stored in the MySQL `system_settings` table.

### Prisma migrations

Active migrations are MySQL-native and live in `prisma/migrations/`.

Legacy PostgreSQL migration history is archived in `prisma/postgresql-migrations/` for audit only. Do not run those files against MySQL.

## Run Locally

Backend:

```bash
npm run dev:backend
```

Frontend:

```bash
npm run dev
```

Both together:

```bash
npm run dev:all
```

Open the frontend at the Vite URL and sign in with your account credentials. The frontend talks to `VITE_API_BASE_URL` if set, otherwise `http://localhost:4000`.

## Production Build

```bash
npm run build
npm run build:backend
```

Before starting the backend in production:

```bash
npm run db:deploy
```

Deploy the frontend output from `.output` according to the TanStack/Nitro target. Deploy the backend with the compiled `dist-server/server/src/index.js` or run the TypeScript entry with a managed Node process if your platform supports it.

Set `DATABASE_URL` to your production MySQL instance. The backend and Prisma client both use this single connection string.

## Security Notes

- Browser auth uses HTTP-only cookies, not localStorage tokens.
- Passwords are hashed with bcrypt.
- Auth endpoints are rate-limited.
- Helmet secure headers and explicit CORS are enabled.
- No public signup route exists.
- User creation rules and object-level attendance access are enforced on the backend.
- Sensitive actions write audit logs.
- Production startup rejects wildcard/empty CORS origin and weak JWT secrets.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run db:verify
npm run build
npm run build:backend
npm run audit:deps
```

Current lint status may include Fast Refresh warnings from existing shared UI modules, but no lint errors.
