# AnytimeDiesel HRMS

Production-oriented HRMS frontend plus Node/Express backend for secure login, RBAC, employee management, branch/device management, attendance movement timelines, leave, profile requests, reports, and audit logs.

## Prerequisites

- Node.js 22+
- PostgreSQL 15+
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

- `DATABASE_URL`: PostgreSQL connection string.
- `FRONTEND_ORIGIN`: exact frontend origin, for example `http://localhost:5173`.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: strong, different production secrets.
- `COOKIE_SECURE=true` in production behind HTTPS.

Do not commit `.env` or real secrets.

## Database

Create a local database:

```sql
CREATE DATABASE anytimediesel_hrms;
```

Run migrations and seed data:

```bash
npm run db:migrate
npm run db:seed
```

Seed login password for all seeded users:

```text
ChangeMe@12345
```

Seed users include Developer Admin, CEO, HR, Manager, Employee, Sales, and Driver accounts. The seed also creates two branches, two biometric devices, biometric mappings, leave types, and a sample full movement day: Branch 1 thumb in/out, Branch 2 thumb in/out, then client GPS check-in/check-out.

## Run Locally

Backend:

```bash
npm run dev:backend
```

Frontend:

```bash
npm run dev
```

Open the frontend at the Vite URL and use the seeded credentials. The frontend talks to `VITE_API_BASE_URL` if set, otherwise `http://localhost:4000`.

## Production Build

```bash
npm run build
npm run build:backend
```

Deploy the frontend output from `.output` according to the TanStack/Nitro target. Deploy the backend with the compiled `dist-server/server/src/index.js` or run the TypeScript entry with a managed Node process if your platform supports it.

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
npm run build
npm run build:backend
npm run audit:deps
```

Current lint status may include Fast Refresh warnings from existing shared UI modules, but no lint errors.
