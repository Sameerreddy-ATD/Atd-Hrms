# AWS Deployment Patterns

This guide helps an AWS/DevOps team select a deployment type without changing application behavior.
It does not assume that the final choice will match the current VPS. For the current scale, start
with the simplest pattern that meets availability, backup, security, and ownership requirements.

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
