# Third-Party Technical Handover

This is the starting document for a new company, engineering team, DevOps provider, or AWS partner
taking ownership of the Employee Management System. It explains what is being transferred, what is
not stored in Git, how the application runs, which decisions the receiving team must make, and how
to prove that a new deployment is correct.

Read this document first, then follow:

1. [Technical Overview](TECHNICAL_OVERVIEW.md) for application architecture.
2. [Cloud Deployment Options and Costs](CLOUD_DEPLOYMENT_OPTIONS.md) for hosting models.
3. [AWS Deployment Patterns](AWS_DEPLOYMENT_PATTERNS.md) for AWS-specific choices.
4. [Linux and AWS Deployment](LINUX_LOCAL_DEPLOYMENT.md) for EC2/VPS commands.
5. [Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md) for releases and rollback.
6. [Database Integrity Audit](DATABASE_INTEGRITY_AUDIT.md) and
   [Employee Data and Integration API](EMPLOYEE_DATA_AND_INTEGRATION_API.md) for data assurance.

## 1. System Purpose

The application is an internal employee operations platform for approximately 200-300 employees.
It includes:

- employee accounts, profiles, organization hierarchy, module access, and ID cards;
- attendance, mobile/geofenced events, biometric administration, corrections, and reports;
- leave, weekly offs, holidays, Comp Off, and approval workflows;
- configurable Work Planner boards, stages, assignments, activity, list, Kanban, and timeline;
- expense advances/claims and HR review/payment;
- HR document requests and delivery;
- company assets and return checklists;
- announcements, live notifications, Web Push, and audit history; and
- a scoped, versioned Employee Integration API for other applications.

The frontend does not connect directly to the database. Express performs authentication,
authorization, validation, business rules, audit logging, and Prisma persistence.

## 2. Canonical Repository and Branches

| Item                                 | Value                                         |
| ------------------------------------ | --------------------------------------------- |
| Repository                           | `Sameerreddy-ATD/Employee-Management-System`  |
| Canonical release branch             | `main`                                        |
| Existing server compatibility branch | `version-1`                                   |
| Runtime                              | Node.js 22                                    |
| Browser application                  | React 19, TanStack Start/Router, Vite 8       |
| UI system                            | Tailwind CSS 4, Radix UI, Lucide and Recharts |
| API                                  | Express 4, TypeScript and Zod                 |
| Database                             | MySQL 8                                       |
| ORM/migrations                       | Prisma 6                                      |
| Face verification                    | Self-hosted Human 3 with encrypted evidence   |
| Automated verification               | Vitest 4, Playwright, ESLint 9 and Prettier 3 |

New deployments should use `main`. The existing Ubuntu deployment may continue using `version-1`
until it is deliberately switched. Do not force-push either release branch. Do not deploy a
frontend from one release and a backend from another.

## 3. Runtime Topology

```mermaid
flowchart LR
  User["Browser / installed PWA"] --> Edge["DNS, TLS, proxy or load balancer"]
  Client["External employee-data consumer"] --> Edge
  Edge --> Frontend["TanStack/Vite frontend :8081"]
  Edge -->|"/api/*"| Backend["Express backend :4000"]
  Backend --> Database["MySQL 8"]
  Backend --> Push["Web Push provider"]
```

The current single-server deployment uses:

- Nginx on ports 80/443;
- frontend on `127.0.0.1:8081`;
- backend on `127.0.0.1:4000`;
- MySQL on `127.0.0.1:3306`; and
- PM2 for both Node.js processes.

AWS may replace Nginx with an Application Load Balancer and may replace local MySQL with RDS. The
application contract remains the same.

## 4. Repository Contents

| Path                   | Responsibility                                                              |
| ---------------------- | --------------------------------------------------------------------------- |
| `src/`                 | React routes, components, browser auth, notifications, and typed API client |
| `server/src/`          | Express API, security, RBAC, business workflows, mapping, and integrations  |
| `prisma/schema.prisma` | Canonical MySQL schema                                                      |
| `prisma/migrations/`   | Ordered production MySQL migrations                                         |
| `prisma/seed.ts`       | New development/demo baseline only                                          |
| `scripts/`             | Setup, verification, audits, guarded smoke tests, and migration tools       |
| `docs/`                | Product, technical, database, deployment, maintenance, and handover manuals |
| `Dockerfile`           | Separate `frontend` and `backend` container targets                         |
| `deploy/`              | Container handoff Compose and Nginx reference configuration                 |

Generated builds, dependencies, local databases, `.env`, backups, reports, logs, keys, and secrets
are intentionally excluded from Git.

## 5. Information That Must Be Transferred Separately

Git does **not** contain production credentials or production data. The authorized business owner
must transfer the following through a password manager, encrypted vault, or another approved secure
channel:

- AWS account/organization ownership and billing contacts;
- IAM administration process and break-glass ownership;
- domain registrar and DNS/Route 53 ownership;
- production hostname and TLS/certificate ownership;
- GitHub organization/repository administration and deploy keys;
- production MySQL credentials;
- a verified encrypted MySQL backup;
- `JWT_ACCESS_SECRET`;
- `JWT_REFRESH_SECRET`;
- `EMPLOYEE_DATA_ENCRYPTION_KEY`;
- VAPID public/private keys and subject;
- active Employee Integration API client ownership and planned rotation;
- monitoring, alerting, backup, and incident contacts; and
- retention, privacy, and employee-data-location requirements.

The employee-data encryption key is essential. Database rows containing bank account, PAN,
Aadhaar, and UAN values cannot be decrypted after restoration without the same key.

Never send secrets in an issue, commit, chat screenshot, or unencrypted email.

## 6. Environment Contract

### Required runtime variables

| Variable                       | Purpose                                | Example shape                                         |
| ------------------------------ | -------------------------------------- | ----------------------------------------------------- |
| `DATABASE_URL`                 | Prisma/MySQL connection                | `mysql://user:encoded-password@db-host:3306/database` |
| `BACKEND_PORT`                 | Express listen port                    | `4000`                                                |
| `FRONTEND_ORIGIN`              | Exact browser origin accepted by CORS  | `https://hrms.example.com`                            |
| `JWT_ACCESS_SECRET`            | Access-token signing                   | 32+ random characters                                 |
| `JWT_REFRESH_SECRET`           | Refresh-token signing                  | Different 32+ random characters                       |
| `EMPLOYEE_DATA_ENCRYPTION_KEY` | Private employee-field encryption      | Stable 32+ random characters                          |
| `FACE_EVIDENCE_DIR`            | Private encrypted face capture storage | Persistent backend-only directory                     |
| `COOKIE_SECURE`                | Secure browser cookies                 | `true`                                                |
| `NODE_ENV`                     | Production security mode               | `production`                                          |
| `TRUST_PROXY`                  | Trusted reverse-proxy hops/subnets     | `loopback` or `1`                                     |

### Required frontend build variables

| Variable              | Purpose                                    | Example shape                  |
| --------------------- | ------------------------------------------ | ------------------------------ |
| `VITE_API_BASE_URL`   | Browser API URL compiled into the frontend | `https://hrms.example.com/api` |
| `VITE_ALLOWED_HOSTS`  | Comma-separated frontend hostnames         | `hrms.example.com`             |
| `VITE_API_TIMEOUT_MS` | Browser request timeout                    | `20000`                        |

`VITE_*` values are compiled during `npm run build` or the Docker image build. Changing them only
at runtime does not change an already-built browser bundle. Rebuild the frontend after changing its
domain or API URL.

### Optional operational variables

- General and authentication rate-limit windows/maxima.
- Session and refresh cookie names.
- VAPID public/private keys and contact subject for Web Push.
- Local Windows bootstrap-only `MYSQL_ROOT_PASSWORD` and `SEED_PASSWORD`.

`FACE_EVIDENCE_DIR` is required for face attendance. It must survive deployments, remain outside
the public web root, and be transferred with its access and retention policy. The container handoff
uses the persistent `face-evidence` named volume.

The safe template and descriptions are in [`.env.example`](../.env.example).

## 7. Proxy Configuration

`TRUST_PROXY` controls how Express interprets the proxy-provided client IP:

| Deployment                                     | Recommended value |
| ---------------------------------------------- | ----------------- |
| Same-server Nginx directly in front of backend | `loopback`        |
| One trusted reverse proxy/load balancer hop    | `1`               |
| Two controlled proxy hops                      | `2`               |
| No reverse proxy                               | `false`           |

Do not use `TRUST_PROXY=true` in production. The backend rejects that value because an untrusted
client could forge forwarding headers and bypass IP-based controls.

The proxy must:

- forward host, real IP, forwarded-for, and forwarded-protocol headers;
- route `/api/*` to the backend while removing the external `/api` prefix;
- route other requests to the frontend;
- disable response buffering for `/api` SSE routes; and
- allow a long read timeout for attendance and notification streams.

## 8. Database Contract

- MySQL 8 with `utf8mb4` and `utf8mb4_unicode_ci`.
- Prisma migrations are authoritative and must run in their existing order.
- Production uses `npm run db:deploy`, never `prisma migrate dev`.
- `npm run db:seed` is for a brand-new development/demo database only.
- A production database must not be reseeded.
- MySQL port 3306 must remain private.
- RDS requires TLS and security-group access only from the application tier.

Before importing existing production data:

1. Create the empty target database.
2. Apply the database dump using the approved restore process.
3. Configure the original employee-data encryption key.
4. Run `npm run db:deploy` to apply migrations not present in the dump.
5. Run `npm run db:verify`.
6. Run `npm run db:audit`.

Do not point guarded smoke tests or the production-data reset at a real database.

## 9. Build and Start Contract

From a clean checkout:

```bash
npm ci
npx prisma generate
npm run repo:audit
npm run typecheck
npm test
npm run build
npm run build:backend
```

Runtime commands:

```bash
npm run start:backend
npm run start:frontend -- --host 0.0.0.0 --port 8081
```

Health checks:

```bash
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:4000/health/db
```

The backend must not receive production traffic until migrations succeed.

## 10. Container Handoff

The root `Dockerfile` provides two targets:

```bash
docker build --target backend \
  --build-arg VITE_API_BASE_URL=/api \
  --build-arg VITE_ALLOWED_HOSTS=hrms.example.com \
  -t employee-management-backend:release .

docker build --target frontend \
  --build-arg VITE_API_BASE_URL=https://hrms.example.com/api \
  --build-arg VITE_ALLOWED_HOSTS=hrms.example.com \
  -t employee-management-frontend:release .
```

The handoff Compose file is for local/integration acceptance:

```bash
cp deploy/handoff.env.example .env.handoff
# Edit .env.handoff and URL-encode the password inside DATABASE_URL.
docker compose --env-file .env.handoff -f deploy/docker-compose.handoff.yml up --build
```

It starts MySQL, applies migrations, starts both application containers, and exposes an HTTP Nginx
proxy on port 8080. It is not a complete production platform: production still requires managed
secrets, HTTPS, independent backups, monitoring, restricted networking, and image scanning.

## 11. Deployment Acceptance Checklist

### Infrastructure

- [ ] Billing alerts and named operational contacts exist.
- [ ] Region and employee-data-location requirements are approved.
- [ ] Database and application are in compatible/private network locations.
- [ ] Only the public proxy/load balancer accepts internet traffic.
- [ ] MySQL, backend, and frontend internal ports are not publicly reachable.
- [ ] Secrets are stored outside Git with least-privilege access.
- [ ] Daily encrypted database backup and retention are configured.
- [ ] The private face-evidence directory/volume, encryption-key custody, disk monitoring,
      automatic 1–30 day retention, and maximum-five-images-per-person limit are approved.
- [ ] A restore has been tested in a non-production environment.

### Application verification

- [ ] All Prisma migrations show as finished.
- [ ] `db:verify` reports `reachable: true` and no integrity mismatches.
- [ ] `db:audit` reports zero failures and zero warnings.
- [ ] Backend `/health` and `/health/db` return `ok: true`.
- [ ] HTTPS, secure cookies, login, refresh, and logout work.
- [ ] Developer Admin can manage module access and create a login.
- [ ] Employee profile, encrypted private fields, and ID card work.
- [ ] Existing normal accounts receive the mandatory face gate and Developer Admin remains exempt.
- [ ] Normal enrollment, approval/rejection/reset, evidence viewing, and retention cleanup work.
- [ ] Check-in rejects missing/failed face or imprecise GPS, clearly reports another-face attempts,
      and links passed evidence to the saved attendance event.
- [ ] Check-out does not open the camera, requires precise GPS, and saves the location.
- [ ] Developer Admin shows recent another-face alerts and retained evidence.
- [ ] Attendance and live cross-device refresh work.
- [ ] Leave, expenses, HR documents, assets, tasks, and notifications work.
- [ ] CEO, HR, head, manager, and employee scopes are verified.
- [ ] Public ID verification does not expose private data.
- [ ] Employee Integration API keys are newly created or deliberately rotated.
- [ ] Mobile layouts have no document-level horizontal overflow.

### Operations

- [ ] Uptime, CPU, memory, disk, database, PM2/container restarts, and backup alerts exist.
- [ ] Release and rollback owners are named.
- [ ] Previous release identifier and rollback window are recorded.
- [ ] Domain/DNS rollback is understood.
- [ ] Incident and vulnerability reporting channels are private.

## 12. Definition of Successful Handover

The receiving company has successfully taken ownership only when:

1. it can build the repository from a clean checkout;
2. it can create a blank MySQL database and apply every migration;
3. it can restore an approved backup without losing encrypted-field access;
4. it can deploy frontend and backend together;
5. all automated and manual acceptance checks pass;
6. backups and restore testing are independently demonstrated;
7. it can perform a release and an application rollback;
8. named people own AWS, GitHub, DNS, secrets, database, monitoring, and incidents; and
9. the previous owner has revoked access that is no longer required.

## 13. Documents by Responsibility

| Responsibility                  | Document                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Product workflows and roles     | [User Guide](USER_GUIDE.md), [Operations and Workflows](OPERATIONS_AND_WORKFLOWS.md)                                               |
| Architecture and code ownership | [Technical Overview](TECHNICAL_OVERVIEW.md), [Repository Structure](REPOSITORY_STRUCTURE.md)                                       |
| Profile/private-data behavior   | [Employee Profile and ID Card](EMPLOYEE_PROFILE_AND_ID_CARD.md)                                                                    |
| Database schema and audit       | [Employee Data and Integration API](EMPLOYEE_DATA_AND_INTEGRATION_API.md), [Database Integrity Audit](DATABASE_INTEGRITY_AUDIT.md) |
| Cloud/provider choice           | [Cloud Deployment Options and Costs](CLOUD_DEPLOYMENT_OPTIONS.md)                                                                  |
| AWS architecture                | [AWS Deployment Patterns](AWS_DEPLOYMENT_PATTERNS.md)                                                                              |
| Ubuntu/EC2 commands             | [Linux and AWS Deployment](LINUX_LOCAL_DEPLOYMENT.md)                                                                              |
| Releases, backups, rollback     | [Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md)                                                                              |
| Development and tests           | [Development and Testing](DEVELOPMENT_AND_TESTING.md)                                                                              |
| Safe go-live/reset              | [Reset and Go-Live](RESET_AND_GO_LIVE.md)                                                                                          |
| Security reporting              | [`SECURITY.md`](../SECURITY.md)                                                                                                    |
