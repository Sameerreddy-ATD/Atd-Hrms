# Anytime Diesel Employee Management System

Internal employee operations platform for Anytime Diesel. It manages accounts, organization units, attendance, leave, tasks, assets and returns, expense claims, certificate requests, announcements, notifications, reports, and audit history through role-based web and installed PWA experiences.

## Current Release

- Repository: `Sameerreddy-ATD/Employee-Management-System` (private)
- Stable deployment branch: `version-1`
- Production URL: `https://hrms.sameerreddy.in`
- Database: MySQL 8 with Prisma
- Biometric/eSSL integration: data model and administration screens exist; live device synchronization is planned for a later version

## Documentation

Start with the [documentation index](docs/README.md).

| Guide                                                        | Audience                                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [User Guide](docs/USER_GUIDE.md)                             | Employees, heads, HR, leadership, and Developer Admin                        |
| [Operations and Workflows](docs/OPERATIONS_AND_WORKFLOWS.md) | Business rules, permissions, attendance, leave, accounts, and data retention |
| [Technical Overview](docs/TECHNICAL_OVERVIEW.md)             | Developers and maintainers                                                   |
| [Linux and AWS Deployment](docs/LINUX_LOCAL_DEPLOYMENT.md)   | Server administrators                                                        |
| [Upgrade and Maintenance](docs/UPGRADE_AND_MAINTENANCE.md)   | Production releases, backups, rollback, and monitoring                       |
| [Device Compatibility](docs/DEVICE_COMPATIBILITY.md)         | Mobile/PWA testing and support                                               |

## Technology

- React 19, TanStack Start/Router, Vite, Tailwind CSS
- Express and TypeScript backend
- MySQL 8 and Prisma ORM
- HTTP-only cookie authentication with backend RBAC
- Server-Sent Events for live attendance and notification refresh
- Web Push and service worker support for installed applications
- Vitest, ESLint, Prettier, and TypeScript verification

## Repository Layout

```text
docs/                 Product, workflow, deployment, and maintenance manuals
prisma/               MySQL schema, active migrations, seed, and archived PostgreSQL migrations
public/               PWA manifest, service worker, logos, favicons, and install icons
scripts/              Local MySQL and migration utilities
server/src/           Express API, security, attendance, push, live events, and mapping
src/components/       Shared feature, layout, and UI components
src/lib/              Frontend auth, notifications, attendance, formatting, and utilities
src/routes/           TanStack file-based application pages
src/services/api/     Typed frontend API client
tests/                Unit tests for security and attendance rules
```

Generated folders, logs, local databases, `.env`, build output, and dependencies are excluded by `.gitignore` and must not be committed.

## Local Windows Setup

Prerequisites: Node.js 22+, npm, and MySQL 8.

```bat
D:
cd D:\anytime-crew-hub
npm install
copy .env.example .env
```

Edit `.env` and set a valid MySQL `DATABASE_URL` and strong JWT secrets. Then run:

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

Open `http://localhost:5173`. Backend health is available at `http://localhost:4000/health` and `/health/db`.

Seed only a new development/demo database. Do not seed an existing production database.

## Environment

Create `.env` from `.env.example`. Never commit `.env`, passwords, JWT secrets, database dumps, VAPID private keys, or SSH keys.

| Variable             | Purpose                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`       | MySQL connection used by Prisma and Express                              |
| `BACKEND_PORT`       | Express port, normally `4000`                                            |
| `FRONTEND_ORIGIN`    | Exact browser origin allowed by CORS                                     |
| `VITE_API_BASE_URL`  | API URL compiled into the frontend; production uses `/api` through Nginx |
| `JWT_ACCESS_SECRET`  | Strong access-token signing secret                                       |
| `JWT_REFRESH_SECRET` | Separate strong refresh-token signing secret                             |
| `COOKIE_SECURE`      | `true` in HTTPS production                                               |
| `VAPID_PUBLIC_KEY`   | Browser push public key                                                  |
| `VAPID_PRIVATE_KEY`  | Browser push private key                                                 |
| `VAPID_SUBJECT`      | Responsible contact URI, normally `mailto:operations@company-domain`     |

## Required Verification

Run before every commit or deployment:

```bash
npx prisma validate
npm run typecheck
npm run lint
npm test
npm run build
npm run build:backend
```

Use `npm run db:verify` when the configured MySQL database is available.

## Security and Data Rules

- Public signup is disabled. Developer Admin provisions accounts.
- Authentication uses secure HTTP-only cookies, not production localStorage tokens.
- Five consecutive wrong passwords lock normal accounts. Developer Admin is protected from lockout.
- Suspension, deactivation, and lockout retain attendance, assets, tasks, leave, and biometric mappings.
- Permanent account deletion is Developer Admin-only, requires typed confirmation, and removes related employee data transactionally while retaining an anonymized audit event.
- Notifications are generated using the signed-in user’s role and employee scope.
- Developer Admin accounts cannot be suspended, deactivated, or deleted.
- Employees can view only their own expense and certificate requests. HR and Developer Admin can review organization-wide requests.
- Asset returns are completed through a recorded HR checklist before an assignment is released.

## Production Update

Production already uses a read-only deploy key for the private repository.

```bash
cd /opt/anytime-crew-hub
git pull --ff-only origin version-1
npm ci
npm run db:deploy
npm run build
npm run build:backend
pm2 restart atd-backend --update-env
pm2 restart atd-frontend --update-env
pm2 save
```

Always take a MySQL backup first when a release contains migrations. See the [Upgrade and Maintenance Guide](docs/UPGRADE_AND_MAINTENANCE.md) for the complete procedure.
