# AWS Deployment Patterns

This guide helps an AWS/DevOps team select a deployment type without changing application behavior.
It does not assume that the final choice will match the current VPS. For the current scale, start
with the simplest pattern that meets availability, backup, security, and ownership requirements.

Related guides:

- [Linux and AWS Deployment](LINUX_LOCAL_DEPLOYMENT.md) — install commands for EC2/VPS and RDS wiring
- [Cloud Deployment Options and Costs](CLOUD_DEPLOYMENT_OPTIONS.md) — capacity and provider cost
- [Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md) — releases, backups, rollback, ops cadence
- [Third-Party Technical Handover](THIRD_PARTY_HANDOVER.md) — ownership transfer checklist

## 0. Company AWS Migration Path (VPS Test → Production)

Use this path when the application is already running on a VPS/EC2 for testing and the company will
later host it on their AWS account (often with existing **RDS MySQL** and **S3** standards).

### What this application is vs a legacy company database

| Item | Anytime Workforce | Typical company legacy stack |
| ---- | ------------------------------- | ---------------------------- |
| Database | MySQL 8 via Prisma; about **58** application tables today | Often a large RDS with ~**190** tables for other products |
| Files | Local private directories (face evidence, receipts, task attachments, medical uploads) | Usually S3 |
| Runtime | Node.js 22 frontend + Express backend behind Nginx or ALB | EC2, ECS, or similar |
| Schema ownership | `prisma/schema.prisma` + ordered `prisma/migrations/` | Separate legacy schemas |

**Do not merge this schema into an existing 190-table database.** Give this application its own
MySQL database name on RDS (for example `anytimediesel_hrms`), or its own RDS instance. Shared
instance is acceptable; shared tables are not. Treat any future “single data warehouse” effort as a
separate integration project, not a go-live prerequisite.

### Phased target architecture

```text
Users
  → Route 53 / ACM
  → ALB (or Nginx on EC2)
       ├─ frontend :8081
       └─ /api/* → backend :4000
                      ├─ RDS MySQL 8 (private subnet, this app DB only)
                      └─ S3 private bucket (phase 2; EBS/local disk until then)
Secrets Manager / SSM → app runtime
CloudWatch logs, alarms, billing budget
Nightly RDS snapshots + tested restore
```

### Recommended phases

| Phase | Goal | Infrastructure | Notes |
| ----- | ---- | -------------- | ----- |
| 0 | UAT / demo | Current VPS or single EC2 + local MySQL | Keep testing here until acceptance passes |
| 1 | Company staging/production-like | **EC2 + RDS MySQL** + Secrets Manager | Closest to today; lowest migration risk |
| 2 | Company file standard | Add **private S3** for uploads | Requires a backend storage adapter (not plug-and-play today) |
| 3 | Company container standard (optional) | ECS Fargate + ALB + RDS (+ S3) | Only if DevOps already runs ECS |
| Later | Horizontal backend scale | Add Redis (or equivalent) for SSE fan-out | Do not run multiple backend replicas before this |

Avoid Lambda/API Gateway for the current Express API without redesign (SSE, sessions, long-lived
Node processes).

### Questions to ask the company before cutover

1. Approved AWS region and data-residency rules for employee identity/banking data
2. Existing VPC, private subnets, and who owns security groups
3. Whether they already operate ALB, ECS, or only EC2
4. DNS and certificate ownership (Route 53 / ACM)
5. Secrets store (Secrets Manager vs SSM)
6. Separate staging AWS account or at least separate VPC/resources
7. Who approves production deploys and database restores
8. Whether S3 is mandatory at day one or can follow after EC2+RDS is stable

### Cutover sequence (VPS → company AWS)

1. Provision company staging: EC2 (or ECS), empty RDS database, security groups, secrets.
2. Point staging `DATABASE_URL` at the new RDS database and run `npm run db:deploy` (never seed
   production-like data from `prisma/seed.ts` unless explicitly approved for a demo DB).
3. Restore a recent UAT dump into staging RDS only if you need production-shaped data for UAT; scrub
   or restrict PII per company policy.
4. Complete acceptance on a temporary hostname.
5. Repeat for production with empty or approved go-live data; follow
   [Reset and Go-Live](RESET_AND_GO_LIVE.md) when leaving test data behind.
6. Lower DNS TTL, switch the public hostname, monitor both environments.
7. Keep the previous VPS/EC2 stopped but recoverable for the agreed rollback window.
8. Only then decommission the old host and chargeable resources deliberately.

Exact EC2 install steps remain in [Linux and AWS Deployment](LINUX_LOCAL_DEPLOYMENT.md). RDS and
S3 specifics are in sections **5**, **14**, and **15** below. CI/CD is in section **12** and
**16**. Ongoing maintenance is in [Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md).

## 1. Quick Recommendation

| Requirement                       | Recommended AWS pattern                                         |
| --------------------------------- | --------------------------------------------------------------- |
| Lowest complexity and cost        | Lightsail or one EC2 instance with local MySQL                  |
| Existing deployment continuity    | Keep the current EC2 + local MySQL + Nginx + PM2                |
| Better database recovery          | EC2 application + RDS MySQL                                     |
| Container-standard company        | ECS Fargate frontend/backend + ALB + RDS                        |
| Organization already operates EKS | EKS + ALB Ingress + RDS, only with an existing platform team    |
| Minimal server administration     | App Runner frontend/backend + RDS, after network/SSE validation |

Do not choose Lambda/API Gateway for the current backend without a deliberate redesign. The
application uses long-running Express processes, MySQL connections, secure cookie sessions, and
Server-Sent Events.

## 2. Common AWS Requirements

Every production pattern requires:

- one approved AWS region;
- separate production and non-production environments;
- Route 53 or another controlled DNS provider;
- HTTPS using ACM at an AWS load balancer/edge or Certbot on a VM;
- Secrets Manager or SSM Parameter Store for application secrets;
- encrypted database and backup storage;
- CloudWatch logs, alarms, and billing budgets;
- least-privilege IAM roles rather than long-lived access keys;
- private MySQL connectivity; and
- a tested restore and rollback procedure.

Recommended tags:

```text
Application=employee-management
Environment=production
Owner=<receiving-company-team>
DataClassification=employee-confidential
CostCenter=<approved-cost-center>
ManagedBy=<terraform|cloudformation|manual>
```

## 3. Pattern A: One EC2 Instance

```mermaid
flowchart LR
  Internet --> SG["Security Group :80/:443"]
  SG --> EC2["EC2 Ubuntu 24.04"]
  EC2 --> Nginx["Nginx"]
  Nginx --> Frontend["Frontend :8081"]
  Nginx --> Backend["Backend :4000"]
  Backend --> MySQL["Local MySQL :3306"]
  EC2 --> Backup["Encrypted off-instance backup"]
```

### Suitable when

- the workload is small or medium;
- cost and simplicity are primary;
- short maintenance windows are acceptable; and
- a named team owns Ubuntu, MySQL, and restore testing.

### Minimum configuration

- 2 vCPU and 4 GB RAM; 8 GB preferred;
- 50-100 GB encrypted gp3;
- Elastic IP or stable load-balancer address;
- security group allowing SSH only from administrator IPs and public 80/443;
- IMDSv2 required;
- EBS snapshot policy plus independent encrypted MySQL backups; and
- detailed monitoring or CloudWatch agent.

### Application settings

```text
FRONTEND_ORIGIN=https://hrms.example.com
VITE_API_BASE_URL=https://hrms.example.com/api
VITE_ALLOWED_HOSTS=hrms.example.com
TRUST_PROXY=loopback
COOKIE_SECURE=true
NODE_ENV=production
```

Use the complete [Linux and AWS Deployment Guide](LINUX_LOCAL_DEPLOYMENT.md).

### Limitation

The application and database share one failure domain. An instance or volume failure affects both
until restoration completes.

## 4. Pattern B: AWS Lightsail

Lightsail uses the same application design and Linux commands as EC2, with simpler bundled pricing.
Choose at least the 4 GB Linux plan for production. Use a static IP, firewall only the required
ports, enable snapshots, and keep a separate database dump outside the instance.

This is appropriate when the receiving company wants AWS ownership but does not need advanced VPC,
autoscaling, or enterprise networking.

## 5. Pattern C: EC2 Application + RDS MySQL

```mermaid
flowchart LR
  Internet --> ALB["ALB + ACM"]
  ALB --> EC2["EC2 private/public application tier"]
  EC2 --> Frontend["Frontend :8081"]
  EC2 --> Backend["Backend :4000"]
  Backend --> RDS["RDS MySQL private subnet"]
  Secrets["Secrets Manager / SSM"] --> EC2
```

### Suitable when

- database backup/recovery is more important than absolute minimum cost;
- the receiving company already operates VPC and RDS;
- point-in-time recovery and managed database patching are required; or
- application hosts may be replaced independently.

### Network

- ALB accepts public 443 and redirects 80 to 443.
- EC2 accepts application traffic only from the ALB security group.
- RDS accepts 3306 only from the application security group.
- RDS has no public accessibility.
- Place RDS in private subnets across the required availability zones.

### Application settings

```text
DATABASE_URL=mysql://app_user:URL_ENCODED_PASSWORD@private-rds-endpoint:3306/database
FRONTEND_ORIGIN=https://hrms.example.com
VITE_API_BASE_URL=https://hrms.example.com/api
VITE_ALLOWED_HOSTS=hrms.example.com
TRUST_PROXY=1
COOKIE_SECURE=true
NODE_ENV=production
```

Configure the ALB:

- `/api/*` routes to the backend target group;
- all other paths route to the frontend target group;
- backend health check uses `/health`;
- deregistration delay permits graceful shutdown;
- idle timeout must accommodate SSE; and
- forwarding headers must reach Express.

If Nginx remains between ALB and Express, the controlled proxy-hop count may be `2`. Confirm the
actual request path instead of copying this value blindly.

### RDS requirements

- MySQL 8 compatible engine;
- encrypted storage;
- automated backups and an approved retention period;
- deletion protection for production;
- final snapshot requirement;
- maintenance and backup windows;
- CloudWatch alarms for connections, CPU, free storage, and memory;
- TLS connection policy; and
- restore testing.

Multi-AZ improves availability but approximately doubles the database instance component of cost.

### Creating the application database on company RDS

Prefer a dedicated database on the company RDS instance (or a dedicated instance). Example SQL
run by an RDS admin (adjust host access so only the app security group can connect):

```sql
CREATE DATABASE anytimediesel_hrms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'atd_hrms'@'%' IDENTIFIED BY 'REPLACE_WITH_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON anytimediesel_hrms.* TO 'atd_hrms'@'%';
FLUSH PRIVILEGES;
```

On the application host:

```text
DATABASE_URL=mysql://atd_hrms:URL_ENCODED_PASSWORD@your-rds-endpoint.region.rds.amazonaws.com:3306/anytimediesel_hrms
```

Then from the app checkout (after secrets are loaded):

```bash
npx prisma generate
npm run db:deploy
npm run db:verify
npm run db:audit
```

Never point this application at a legacy schema that already contains unrelated tables expecting to
“share” employee rows. Use the Employee Integration API if another system must exchange data.

Step-by-step EC2 wiring against RDS (no local MySQL) is in
[Linux and AWS Deployment § Deploying With Company RDS](LINUX_LOCAL_DEPLOYMENT.md#13-deploying-with-company-rds).

## 6. Pattern D: ECS Fargate + ALB + RDS

```mermaid
flowchart LR
  Internet --> ALB["Application Load Balancer + ACM"]
  ALB --> Frontend["ECS frontend service :8081"]
  ALB --> Backend["ECS backend service :4000"]
  Backend --> RDS["RDS MySQL"]
  ECR["ECR images"] --> Frontend
  ECR --> Backend
  Secrets["Secrets Manager"] --> Backend
  Logs["CloudWatch Logs"] <-- Frontend
  Logs <-- Backend
```

The repository includes a multi-target `Dockerfile`:

- target `frontend` runs the compiled frontend on port 8081;
- target `backend` runs Express on port 4000.

### Image build

```bash
docker build --target backend \
  --build-arg VITE_API_BASE_URL=https://hrms.example.com/api \
  --build-arg VITE_ALLOWED_HOSTS=hrms.example.com \
  -t employee-management-backend:<git-sha> .

docker build --target frontend \
  --build-arg VITE_API_BASE_URL=https://hrms.example.com/api \
  --build-arg VITE_ALLOWED_HOSTS=hrms.example.com \
  -t employee-management-frontend:<git-sha> .
```

Scan both images, push immutable Git-SHA tags to ECR, and retain the previous known-good tags.

### ECS design

- one frontend service and one backend service;
- private Fargate tasks with outbound access through an approved path;
- ALB listener rule `/api/*` to backend and default rule to frontend;
- CloudWatch log groups with retention;
- ECS deployment circuit breaker and rollback enabled;
- backend secrets injected from Secrets Manager;
- frontend hostname allow-list set at runtime and during image build;
- backend `TRUST_PROXY=1` when ALB connects directly;
- backend desired count initially `1`; and
- RDS in private subnets.

The current live-event broadcaster is in memory. Do not run multiple backend replicas until Redis
or another shared pub/sub service replaces in-process SSE fan-out. Multiple frontend replicas are
safe behind the ALB.

### Migration task

Run `npm run db:deploy` as a one-off ECS task using the backend image before updating the backend
service. The task uses the same database and secret configuration but does not receive public
traffic. A failed migration blocks the release.

## 7. Pattern E: App Runner + RDS

App Runner can run the two container targets as separate services, but the receiving team must
validate:

- VPC connector access to private RDS;
- custom domain and frontend/backend routing;
- secure-cookie same-origin behavior;
- SSE connection duration and proxy timeouts;
- build-time `VITE_API_BASE_URL`;
- health checks; and
- predictable always-on cost.

Because path routing across two App Runner services usually needs CloudFront or another edge/router,
this is not the simplest option for the current application.

## 8. Pattern F: Elastic Beanstalk

Elastic Beanstalk can operate Node.js or Docker workloads, but the application contains two
independent long-running processes. Use either:

- separate frontend and backend environments behind routing; or
- a reviewed multi-container deployment.

Use RDS independently rather than coupling RDS lifecycle to an Elastic Beanstalk environment.
This option is viable when the receiving company already standardizes on Elastic Beanstalk.

## 9. Pattern G: EKS

EKS is technically compatible with the container targets but not recommended for this application's
current scale. It requires ingress, certificates, secrets, autoscaling, observability, database
networking, pod disruption policy, image policy, and cluster lifecycle ownership.

Use EKS only if the receiving company already has a supported shared cluster/platform and can
provide the same security and database guarantees. Keep the backend at one replica until shared
pub/sub is implemented.

## 10. Unsupported Direct Pattern: Lambda/API Gateway

A direct Lambda conversion is not an infrastructure-only deployment. It requires engineering work
for:

- Express adaptation;
- database connection management/proxying;
- SSE replacement;
- session and cookie routing behavior;
- scheduled attendance settlement;
- cold starts; and
- request/runtime limits.

Do not package the current backend into Lambda and declare production readiness without redesign
and full regression testing.

## 11. AWS Secrets Mapping

| Secret/configuration                    | Recommended location                                       |
| --------------------------------------- | ---------------------------------------------------------- |
| MySQL password / `DATABASE_URL`         | Secrets Manager                                            |
| JWT access and refresh secrets          | Secrets Manager                                            |
| Employee-data encryption key            | Secrets Manager plus separately controlled recovery backup |
| VAPID private key                       | Secrets Manager                                            |
| VAPID public key and subject            | Parameter Store or application configuration               |
| Frontend domain/API build arguments     | CI/CD environment configuration                            |
| Integration API client plaintext secret | Display once to authorized consumer; database stores hash  |

Use task roles or instance roles to retrieve secrets. Do not place AWS access keys in `.env`.

## 12. CI/CD Release Sequence

1. Check out an immutable `main` commit.
2. Run repository audit, Prisma validation, typecheck, lint, unit tests, and dependency audit.
3. Build frontend and backend.
4. Build and scan containers when using ECS/App Runner/EKS.
5. Back up production and record the previous release.
6. Run Prisma migrations as a controlled one-off job.
7. Run database verification/audit.
8. Deploy backend and frontend from the same Git commit.
9. Run health and browser acceptance checks.
10. Record approval, image/commit identifiers, migration result, and rollback window.

Never run `prisma migrate dev`, `npm audit fix --force`, or the seed against production.

## 13. AWS Go-Live Checklist

- [ ] AWS account ownership, billing, budget, and contacts approved.
- [ ] Region and data-location decision recorded.
- [ ] Separate production/non-production resources.
- [ ] IAM least privilege and MFA enforced.
- [ ] Domain and certificate controlled by the receiving company.
- [ ] Public entry point is HTTPS only.
- [ ] Application and database security groups are least privilege.
- [ ] RDS/local MySQL is not public.
- [ ] Secrets Manager/SSM permissions tested without printing secrets.
- [ ] Database backup and restore demonstrated.
- [ ] Employee-data encryption key recovery demonstrated.
- [ ] CloudWatch logs have retention and do not expose secrets.
- [ ] CPU, memory, disk/storage, health, restart, and billing alarms configured.
- [ ] Frontend host and API URL use the final domain.
- [ ] Proxy-hop setting matches the real topology.
- [ ] Migrations, `db:verify`, and `db:audit` pass.
- [ ] Role, workflow, integration, and mobile acceptance pass.
- [ ] Previous environment remains recoverable during the rollback window.
- [ ] This app uses its own MySQL database (not merged into unrelated legacy tables).
- [ ] File storage plan recorded (EBS/local now, S3 later, or S3 day one after adapter).
- [ ] CI green on `main`; production CD requires human approval.

## 14. S3 Plan For Private Uploads

Today the backend writes private files to local directories (for example face evidence, expense
receipts, sick-leave medical files, and task attachments). Company AWS often requires **S3**. That
is supported as a deliberate engineering phase, not a configuration-only switch.

### Target S3 design

- One private bucket (or one bucket with environment prefixes), **Block Public Access** on.
- Server-side encryption (SSE-S3 or SSE-KMS per company policy).
- Access only via the EC2/ECS **IAM task/instance role** (prefer no long-lived access keys in `.env`).
- Key prefixes such as `face/`, `medical/`, `expenses/`, `tasks/`.
- Lifecycle rules for retention (especially face evidence) aligned with
  [Face Registration and Verified Attendance](FACE_ATTENDANCE_SECURITY.md).
- Application serves downloads only through authenticated API routes or short-lived signed URLs.

### Interim (phase 1 without S3 code)

Keep files on encrypted EBS attached to the application host. Document the path variables
(`FACE_EVIDENCE_DIR`, task attachment directory, and any medical/upload dirs). Include those paths
in backup/restore runbooks. Move to S3 in phase 2.

### Implementation checklist (phase 2)

- [ ] Add a storage adapter interface (local disk vs S3) used by upload/download paths.
- [ ] Persist object key (and bucket if needed) instead of assuming a local absolute path forever.
- [ ] Migrate existing files with a one-off copy job; verify checksums; keep local copy until cutover.
- [ ] Update IAM policy to least privilege (`s3:GetObject`, `PutObject`, `DeleteObject` on prefix).
- [ ] Confirm Nginx/ALB never expose the bucket publicly.
- [ ] Re-test enrollment evidence, expense receipts, medical leave files, and task attachments.

Until the adapter ships, do not claim “S3 ready” in go-live sign-off.

## 15. GitHub Actions CI/CD (Recommended Shape)

There is no required workflow checked into the repository yet. The company (or this team) can add
GitHub Actions as follows.

### Continuous integration (every PR and push to `main`)

Jobs should run on Node.js 22:

```bash
npm ci
npx prisma validate
npm run repo:audit
npm run typecheck
npm run lint
npm test
npm run build
npm run build:backend
npm run audit:deps
```

Optional: Playwright smoke against an ephemeral MySQL service when the team can maintain it.

### Continuous deployment (staging automatic; production gated)

Prefer:

1. CI must pass on the release SHA.
2. Deploy to **staging** (EC2 via SSM, or ECS rolling update).
3. Run `npm run db:deploy` against staging RDS, then health checks.
4. **Required reviewers** approve production.
5. Take/confirm RDS snapshot (or approved backup).
6. Deploy the **same SHA** to production; migrate; restart; smoke test.
7. On failure, roll back application to the previous SHA; restore RDS only if a migration is unsafe.

Suggested first implementation: **GitHub Actions → AWS SSM Run Command** on the EC2 app host,
mirroring [Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md) commands. Move to ECS deploy
actions only after containers are the company standard.

Do **not** auto-run production migrations without a human gate until the process is trusted.

Example high-level workflow layout (illustrative — adapt names, OIDC roles, and hosts):

```yaml
# .github/workflows/ci.yml (illustrative)
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npx prisma validate
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - run: npm run build:backend
```

```yaml
# .github/workflows/deploy-production.yml (illustrative)
name: Deploy production
on:
  workflow_dispatch:
    inputs:
      git_sha:
        description: Immutable commit SHA already verified by CI
        required: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production   # require reviewers in GitHub Environments
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.git_sha }}
      # Assume role via OIDC, then SSM Run Command / ECS update using the same SHA
      # 1) snapshot/confirm RDS backup
      # 2) pull SHA on host, npm ci, build, db:deploy, pm2 restart
      # 3) curl /health and /health/db
```

Wire AWS credentials with **OIDC federation** to an IAM role; avoid storing long-lived AWS keys in
GitHub secrets when the company supports OIDC.

## 16. Post-Deploy Maintenance On AWS

Yes — production needs ongoing maintenance. Minimum cadence:

| Cadence | Work |
| ------- | ---- |
| Daily | Process health (PM2/ECS), `/health` and `/health/db`, error logs, disk or S3 growth, failed jobs |
| Weekly | Spot-check staging restore or backup completeness; review CloudWatch alarms; dependency glance |
| Every release | Snapshot/backup → migrate → restart → smoke login, attendance, leave, checklists |
| Monthly | OS patches on EC2; RDS engine minor updates in maintenance window; secret rotation if policy requires; prune old logs/backups; billing review |
| Quarterly | Full restore drill to a throwaway database; review IAM and security groups; revisit capacity |

Also keep:

- one named owner who can restore RDS and redeploy the last known-good Git SHA;
- off-instance (or cross-account) backup copies where policy requires;
- documented rollback window after each release; and
- CloudWatch billing alarms so surprise S3/RDS growth is visible.

Full command-level update and rollback steps remain in
[Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md).