# Anytime Diesel HRMS

Anytime Diesel HRMS is a production-oriented employee operations system for login management, employee records, branch setup, attendance, leave, notifications, reports, audit logs, and role-based dashboards.

The application uses **MySQL 8.0** at runtime. Prisma connects through `DATABASE_URL`; the frontend communicates only with the Express backend APIs.

## Documentation

- [User Guide](docs/USER_GUIDE.md) - HR, manager, employee, field staff, and leadership usage.
- [Technical Overview](docs/TECHNICAL_OVERVIEW.md) - architecture, setup, API areas, database model, and verification.
- [Linux Local Deployment Guide](docs/LINUX_LOCAL_DEPLOYMENT.md) - step-by-step local Linux deployment for 200-300 users.
- [Database Scripts](scripts/README.md) - MySQL helper scripts and migration utilities.

## Core Features

- Secure login with HTTP-only cookies.
- First-login password update with automatic sign-in after password change.
- No public signup; HR/Admin creates accounts.
- Role-based access for Developer Admin, Main Admin, CEO, HR, Manager, Employee, Sales, Driver, and Field Staff.
- Employee profiles with department, branch, reporting manager, gender, employment type, birthday, and attendance mode.
- User lifecycle management: create, update, suspend, deactivate, delete, and reset password.
- Department head assignment.
- Branch, holiday, and leave type administration.
- Mobile attendance support.
- Biometric/eSSL device integration is planned for the next version.
- Daily attendance timeline, branch movement, field work, client visit, missed punch, and correction workflows.
- Leave application, approvals, balances, policies, and reports.
- User-scoped notifications.
- Dashboard analytics and operational reports.
- Audit logging for sensitive actions.

## Architecture

```mermaid
flowchart LR
  Browser["React frontend"] -->|JSON API + cookies| API["Express backend"]
  API --> Prisma["Prisma Client"]
  Prisma --> MySQL["MySQL 8.0"]
  API --> RBAC["RBAC checks"]
  API --> Audit["Audit logs"]
```

## Prerequisites

- Node.js 22+
- npm
- MySQL Server 8.0+

## Quick Start On Windows

Open Command Prompt or PowerShell:

```bat
D:
cd D:\anytime-crew-hub
npm install
copy .env.example .env
```

Set `DATABASE_URL` in `.env`, for example:

```text
DATABASE_URL="mysql://root:5566@127.0.0.1:3306/anytimediesel_hrms"
```

Start MySQL, apply the schema, and seed baseline data:

```bat
npm run db:start-mysql
npm run db:deploy
npm run db:seed
```

Start the backend:

```bat
npm run dev:backend
```

Start the frontend in another terminal:

```bat
npm run dev
```

Open the frontend URL shown by Vite, commonly:

```text
http://localhost:5173
```

The backend usually runs on:

```text
http://localhost:4000
```

## Environment Variables

Important `.env` values:

| Variable              | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`        | MySQL connection string for Prisma and the backend         |
| `MYSQL_ROOT_PASSWORD` | Optional helper value for local MySQL scripts              |
| `FRONTEND_ORIGIN`     | Exact frontend origin, for example `http://localhost:5173` |
| `JWT_ACCESS_SECRET`   | Strong access-token secret                                 |
| `JWT_REFRESH_SECRET`  | Strong refresh-token secret                                |
| `COOKIE_SECURE`       | Set to `true` in production behind HTTPS                   |

Do not commit `.env` or real passwords.

## Database Commands

| Command                  | Purpose                                         |
| ------------------------ | ----------------------------------------------- |
| `npm run db:start-mysql` | Start project-local MySQL on `127.0.0.1:3306`   |
| `npm run db:migrate`     | Create/apply Prisma migrations in development   |
| `npm run db:deploy`      | Apply committed migrations                      |
| `npm run db:seed`        | Seed predefined password and demo/baseline data |
| `npm run db:verify`      | Confirm Prisma can read from MySQL              |

Active MySQL migrations live in `prisma/migrations/`. Legacy PostgreSQL migrations are archived in `prisma/postgresql-migrations/` for reference only.

## Verification

Run these before pushing:

```bat
npm run typecheck
npm run lint
npm test
npm run build
npm run build:backend
npm run db:verify
```

## Workflow Summary

```mermaid
flowchart LR
  HR["HR/Admin creates login"] --> Temp["Temporary password"]
  Temp --> FirstLogin["First login"]
  FirstLogin --> Password["User changes password"]
  Password --> Dashboard["Role-based dashboard"]
```

```mermaid
flowchart LR
  Punch["Biometric or mobile punch"] --> Event["Attendance event"]
  Event --> Timeline["Daily timeline"]
  Timeline --> Summary["Daily summary"]
  Summary --> Reports["Attendance, branch, field, client, leave, payroll reports"]
```

## Security Notes

- Browser auth uses HTTP-only cookies, not localStorage tokens.
- Passwords are hashed with bcrypt.
- Auth endpoints are rate-limited.
- Helmet secure headers and explicit CORS are enabled.
- Public signup is disabled.
- Object-level attendance and employee access are enforced by the backend.
- Sensitive actions write audit logs.
- Production startup should use strong JWT secrets and HTTPS cookies.

## Version Notes And Roadmap

Current version:

- Mobile attendance and attendance reporting are part of the working HRMS flow.
- Biometric/eSSL devices are not live yet. They are planned for the next version.

Future attendance verification roadmap:

- eSSL/fingerprint device sync.
- Branch GPS/location checks.
- Approved branch Wi-Fi checks, so branch-mobile attendance is accepted only when the mobile is connected to the correct branch Wi-Fi.
- Photo/selfie verification for mobile check-in and check-out.
- Combined branch-mobile proof using location, Wi-Fi, and photo verification.
