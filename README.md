# Anytime Diesel Employee Management System

Internal employee operations platform for Anytime Diesel. It manages accounts, organization units, attendance, leave, tasks, assets and returns, expense claims, HR documents, announcements, notifications, reports, audit history, and a scoped Employee Integration API through role-based web and installed PWA experiences.

Work Planner includes configurable open/role/member-gated boards, ordered custom stages,
assigned-work shortcuts, list/Kanban/timeline views, mobile-focused task details, optimistic
concurrency, and recoverable board archival.

When Developer Admin enables face verification, every normal account completes face registration
before workspace access; Developer Admin is always exempt. Mobile check-in then requires a
randomized liveness movement, a five-sample encrypted face-template match, and precise GPS.
Developer Admin can pause verification immediately; employee access and check-in become GPS-only
while existing templates remain available for safe re-enablement. Check-out is always GPS-only.
Captures are encrypted, limited to the latest five pictures per person, retained for no more than
five days by default, and controlled from the responsive Developer Admin **Face Security** screen.

The role-aware workspace keeps operational actions with Developer Admin, HR, and organization
heads while giving the CEO a read-only executive view of workforce health, attendance coverage,
leave decisions, work delivery, and company investment in employees.

Developer Admin can create employees individually or use the generated bulk-import workbook. The
current template covers the complete identity, employer, organization, reporting, employment,
banking, and statutory profile; validates every row before import; derives roles on the backend;
and stores successful rows through the standard transactional employee/login workflow.

## Current Release

- Repository: `Sameerreddy-ATD/Employee-Management-System` (private)
- Canonical release branch: `main`
- Existing Ubuntu deployment branch: `version-1` (kept release-compatible with `main`)
- Production URL: `https://hrms.sameerreddy.in`
- Database: MySQL 8 with Prisma
- Biometric/eSSL integration: data model and administration screens exist; live device synchronization is planned for a later version

## Documentation

Start with the [documentation index](docs/README.md).

| Guide                                                                          | Audience                                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [User Guide](docs/USER_GUIDE.md)                                               | Employees, heads, HR, leadership, and Developer Admin                        |
| [Operations and Workflows](docs/OPERATIONS_AND_WORKFLOWS.md)                   | Business rules, permissions, attendance, leave, accounts, and data retention |
| [Technical Overview](docs/TECHNICAL_OVERVIEW.md)                               | Developers and maintainers                                                   |
| [Repository Structure](docs/REPOSITORY_STRUCTURE.md)                           | File ownership, placement rules, and repository organization                 |
| [Development and Testing](docs/DEVELOPMENT_AND_TESTING.md)                     | Local development, migrations, test matrix, and release checks               |
| [Employee Data and Integration API](docs/EMPLOYEE_DATA_AND_INTEGRATION_API.md) | Database owners and external application developers                          |
| [Database Integrity Audit](docs/DATABASE_INTEGRITY_AUDIT.md)                   | Database owners, maintainers, and release reviewers                          |
| [Third-Party Technical Handover](docs/THIRD_PARTY_HANDOVER.md)                 | Receiving companies, technical owners, and transition managers               |
| [Cloud Deployment Options and Costs](docs/CLOUD_DEPLOYMENT_OPTIONS.md)         | Owners choosing providers, capacity, budget, and hosting architecture        |
| [AWS Deployment Patterns](docs/AWS_DEPLOYMENT_PATTERNS.md)                     | AWS architects, DevOps engineers, and infrastructure reviewers               |
| [Linux and AWS Deployment](docs/LINUX_LOCAL_DEPLOYMENT.md)                     | Server administrators                                                        |
| [Upgrade and Maintenance](docs/UPGRADE_AND_MAINTENANCE.md)                     | Production releases, backups, rollback, and monitoring                       |
| [Reset and Go-Live](docs/RESET_AND_GO_LIVE.md)                                 | Developer Admin and go-live owners                                           |
| [Device Compatibility](docs/DEVICE_COMPATIBILITY.md)                           | Mobile/PWA testing and support                                               |
| [Face Registration and Verified Attendance](docs/FACE_ATTENDANCE_SECURITY.md)  | Enrollment, liveness, GPS, storage, retention, APIs, and operations          |
| [Product Naming](docs/PRODUCT_NAMING.md)                                       | Product owners and interface writers                                         |

Security reporting and credential-handling rules are in [SECURITY.md](SECURITY.md).

## Technology

- React 19, TanStack Start/Router, Vite, Tailwind CSS
- Express and TypeScript backend
- MySQL 8 and Prisma ORM
- HTTP-only cookie authentication with backend RBAC
- Self-hosted browser face detection/liveness with backend matching and one-time challenges
- Server-Sent Events for live attendance and notification refresh
- Web Push and service worker support for installed applications
- Responsive role-specific navigation for mobile, tablet, laptop, and installed PWA use
- Vitest, ESLint, Prettier, and TypeScript verification

## Repository Layout

```text
docs/                 Product, workflow, data, API, deployment, and maintenance manuals
deploy/               Container handoff and reverse-proxy reference configuration
prisma/               MySQL schema, active migrations, seed, and archived PostgreSQL history
public/               PWA manifest, service worker, logos, favicons, and install icons
scripts/              Setup, database audit, migration, reset, and smoke-test utilities
server/src/           Express API, security, business rules, integrations, and persistence
src/components/       Shared feature, layout, and design-system components
src/hooks/            Reusable React hooks
src/lib/              Frontend auth, notifications, attendance, formatting, and utilities
src/routes/           TanStack file-based application pages
src/services/api/     Typed frontend API client
src/types/            Shared frontend domain contracts
tests/                Unit, workflow, security, integration, and browser tests
Dockerfile            Separate frontend and backend production container targets
```

The complete ownership and placement policy is in
[Repository Structure](docs/REPOSITORY_STRUCTURE.md). Generated folders, logs, local databases,
`.env`, build output, and dependencies are excluded by `.gitignore` and must not be committed.

## Local Windows Setup

Prerequisites: Node.js 22+, npm, and MySQL 8.

```powershell
Set-Location D:\Employee-Management-System
npm ci
Copy-Item .env.example .env
```

Edit `.env` and set a valid MySQL `DATABASE_URL` and strong JWT secrets. For first-time
project-local MySQL initialization, provide the two credentials to the bootstrap process:

```powershell
$env:MYSQL_ROOT_PASSWORD = "use-a-strong-local-password"
$env:SEED_PASSWORD = "use-a-strong-initial-admin-password"
npm run db:start-mysql
```

The first run creates the database, deploys all migrations, and seeds baseline development
accounts. For an
existing database, deploy any newly pulled migrations separately:

```powershell
npm run db:deploy
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

For separately managed MySQL, database changes, browser testing, and the complete command matrix,
follow [Development and Testing](docs/DEVELOPMENT_AND_TESTING.md).

Product naming recommendations and the professional terminology used in this version are
documented in [Product Naming](docs/PRODUCT_NAMING.md).

## Environment

Create `.env` from `.env.example`. Never commit `.env`, passwords, JWT secrets, database dumps, VAPID private keys, or SSH keys.

| Variable                       | Purpose                                                                  |
| ------------------------------ | ------------------------------------------------------------------------ |
| `DATABASE_URL`                 | MySQL connection used by Prisma and Express                              |
| `MYSQL_ROOT_PASSWORD`          | Local bootstrap only; not used by the running application                |
| `SEED_PASSWORD`                | Initial password when seeding a new development database                 |
| `BACKEND_PORT`                 | Express port, normally `4000`                                            |
| `FRONTEND_ORIGIN`              | Exact browser origin allowed by CORS                                     |
| `VITE_API_BASE_URL`            | API URL compiled into the frontend; production uses `/api` through Nginx |
| `JWT_ACCESS_SECRET`            | Strong access-token signing secret                                       |
| `JWT_REFRESH_SECRET`           | Separate strong refresh-token signing secret                             |
| `EMPLOYEE_DATA_ENCRYPTION_KEY` | Stable 32+ character key for encrypted bank/statutory employee fields    |
| `FACE_EVIDENCE_DIR`            | Private persistent directory for encrypted short-lived face captures     |
| `SESSION_COOKIE_NAME`          | Access-session cookie name                                               |
| `REFRESH_COOKIE_NAME`          | Refresh-session cookie name                                              |
| `COOKIE_SECURE`                | `true` in HTTPS production                                               |
| `NODE_ENV`                     | `development`, `test`, or `production` runtime behavior                  |
| `GENERAL_RATE_LIMIT_MAX`       | General request allowance per rate-limit window                          |
| `GENERAL_RATE_LIMIT_WINDOW_MS` | General rate-limit window in milliseconds                                |
| `AUTH_RATE_LIMIT_MAX`          | Authentication request allowance per authentication window               |
| `AUTH_RATE_LIMIT_WINDOW_MS`    | Authentication rate-limit window in milliseconds                         |
| `REQUEST_TIMEOUT_MS`           | Backend request timeout in milliseconds                                  |
| `VAPID_PUBLIC_KEY`             | Browser push public key                                                  |
| `VAPID_PRIVATE_KEY`            | Browser push private key                                                 |
| `VAPID_SUBJECT`                | Responsible contact URI, normally `mailto:operations@company-domain`     |

Smoke-test-only variables are documented in [scripts/README.md](scripts/README.md); they do not
belong in a production `.env`.

## Required Verification

Run before every commit or deployment:

```bash
npx prisma validate
npm run repo:audit
npm run typecheck
npm run lint
npm test
npm run build
npm run build:backend
npm run db:audit
npm run audit:deps
```

Use `npm run db:verify` and `npm run db:audit` when the configured MySQL database is available.
The audit is read-only and verifies every foreign key plus cross-table business invariants.

## Security and Data Rules

- Public signup is disabled. Developer Admin provisions accounts.
- Authentication uses secure HTTP-only cookies, not production localStorage tokens.
- Five consecutive wrong passwords lock normal accounts. Developer Admin is protected from lockout.
- Suspension, deactivation, and lockout retain attendance, assets, tasks, leave, and biometric mappings.
- Account removal is implemented as deactivation: employee, login, and related operational history are retained and can be reactivated.
- Notifications are generated using the signed-in user’s role and employee scope.
- Developer Admin accounts cannot be suspended, deactivated, or deleted.
- Employees can view only their own expense and HR document requests. HR and Developer Admin can review organization-wide requests.
- External applications use `/api/v1` with scoped, revocable service credentials; browser cookies are not an integration authentication mechanism.
- Bank account numbers, PAN, Aadhaar, and UAN are encrypted at rest and omitted from Employee API v1.
- Face registration is enforced by both the frontend gate and backend middleware; existing accounts
  must register after this release.
- Face templates and short-lived evidence are AES-256-GCM encrypted and intentionally excluded from
  Employee API v1.
- Asset returns are completed through a recorded HR checklist before an assignment is released.
- Assets use explicit `AVAILABLE`, `ASSIGNED`, `UNDER_REPAIR`, and `RETIRED` statuses. The return checklist records condition, accessories, charger, backup/wipe confirmation, damage, notes, receiver, and time.
- Vulnerabilities and suspected secret exposure are reported privately according to [SECURITY.md](SECURITY.md), never through a public issue.

## Product Roadmap

The following modules are planned for a future version and are not part of the current production workflow:

- Payslips and employee payslip history
- Promotion requests and approval tracking
- Performance reviews, goals, ratings, and review cycles

Database models, permissions, notification rules, retention requirements, and approval ownership must be designed before enabling these modules.

## Production Update

Production already uses a read-only deploy key for the private repository. The current server
tracks `version-1`; keep using that branch until the planned switch procedure in
[Linux and AWS Deployment](docs/LINUX_LOCAL_DEPLOYMENT.md) is completed.

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

Before deploying migration `20260723180000_face_attendance`, create the private
`FACE_EVIDENCE_DIR`, keep `EMPLOYEE_DATA_ENCRYPTION_KEY` stable, and expect every existing normal
account to see the mandatory registration gate. Developer Admin is exempt from face authentication
and can review other users immediately.

Migration `20260722213000_task_workspace_v2` intentionally clears legacy Task-only records while
installing the new Work Planner model. Review the migration warning and retain a verified backup
before deploying this release.
