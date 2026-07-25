# Documentation Index

These documents describe the canonical `main` release and the release-compatible `version-1`
checkout used by the existing production server. When code changes a workflow, permission, API
contract, environment variable, migration, or operational command, update the relevant document
in the same commit.

## Read By Role

- Employees and managers: [User Guide](USER_GUIDE.md)
- HR and Developer Admin: [User Guide](USER_GUIDE.md) and [Operations and Workflows](OPERATIONS_AND_WORKFLOWS.md)
- Developers: [Technical Overview](TECHNICAL_OVERVIEW.md)
- New contributors: [Repository Structure](REPOSITORY_STRUCTURE.md) and [Development and Testing](DEVELOPMENT_AND_TESTING.md)
- Database owners and integration developers: [Database Integrity Audit](DATABASE_INTEGRITY_AUDIT.md), [Employee Data and Integration API](EMPLOYEE_DATA_AND_INTEGRATION_API.md), [Employee Profile and ID Card](EMPLOYEE_PROFILE_AND_ID_CARD.md), and [OpenAPI](openapi.employee-v1.yaml)
- Product owners and UI writers: [Product Naming](PRODUCT_NAMING.md)
- Product, frontend, and QA teams: [Responsive UI Audit](RESPONSIVE_UI_AUDIT.md)
- Go-live owners: [Reset and Go-Live](RESET_AND_GO_LIVE.md)
- Receiving companies: [Third-Party Technical Handover](THIRD_PARTY_HANDOVER.md)
- Infrastructure owners: [Cloud Deployment Options and Costs](CLOUD_DEPLOYMENT_OPTIONS.md)
- AWS/DevOps teams: [AWS Deployment Patterns](AWS_DEPLOYMENT_PATTERNS.md)
- Server administrators: [Linux and AWS Deployment](LINUX_LOCAL_DEPLOYMENT.md)
- Release owners: [Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md)
- Mobile QA/support: [Device Compatibility](DEVICE_COMPATIBILITY.md)
- Security, HR, and attendance owners:
  [Face Registration and Verified Attendance](FACE_ATTENDANCE_SECURITY.md)
- Security, QA, and release owners:
  [Workflow and Security Audit](WORKFLOW_AND_SECURITY_AUDIT.md)
- Legal and receiving-company reviewers: [Third-Party Notices](THIRD_PARTY_NOTICES.md)

## Document Ownership

| Document                               | Authoritative subject                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `README.md`                            | Project identity, quick start, structure, and required checks                                     |
| `USER_GUIDE.md`                        | Screen-level instructions for each user type                                                      |
| `OPERATIONS_AND_WORKFLOWS.md`          | Business rules, permissions, status transitions, and retention                                    |
| `TECHNICAL_OVERVIEW.md`                | Architecture, modules, API groups, data model, and engineering rules                              |
| `REPOSITORY_STRUCTURE.md`              | Authoritative folder map, file ownership, placement rules, and documentation responsibilities     |
| `DEVELOPMENT_AND_TESTING.md`           | Local setup, database changes, test matrix, browser QA, and commit checks                         |
| `EMPLOYEE_DATA_AND_INTEGRATION_API.md` | Complete table catalog, canonical employee rules, API security, synchronization and verification  |
| `EMPLOYEE_PROFILE_AND_ID_CARD.md`      | Profile field order, company hierarchy, encrypted identifiers, permissions, and ID-card contract  |
| `DATABASE_INTEGRITY_AUDIT.md`          | Full storage assurance, automated integrity checks, Task v2 rules, and repair policy              |
| `openapi.employee-v1.yaml`             | Machine-readable Employee API v1 contract                                                         |
| `PRODUCT_NAMING.md`                    | Recommended product name and professional interface terminology                                   |
| `RESET_AND_GO_LIVE.md`                 | Safe test-data reset, verification, and step-by-step real-company setup                           |
| `THIRD_PARTY_HANDOVER.md`              | Transfer inventory, environment contract, acceptance, ownership, and handover definition          |
| `CLOUD_DEPLOYMENT_OPTIONS.md`          | Hosting methods, current INR cost comparison, capacity, security, and provider selection          |
| `AWS_DEPLOYMENT_PATTERNS.md`           | EC2, Lightsail, RDS, ECS, App Runner, Beanstalk, EKS, IAM, secrets, and AWS go-live choices       |
| `LINUX_LOCAL_DEPLOYMENT.md`            | Fresh Linux/AWS installation, private Git access, domain, TLS, Nginx, and PM2                     |
| `UPGRADE_AND_MAINTENANCE.md`           | Production updates, backups, verification, rollback, and long-term operations                     |
| `DEVICE_COMPATIBILITY.md`              | Supported browsers, PWA permissions, low-network behavior, and QA matrix                          |
| `RESPONSIVE_UI_AUDIT.md`               | Shared responsive rules, audited surfaces, resolved issues, and UI release checklist              |
| `FACE_ATTENDANCE_SECURITY.md`          | Mandatory enrollment, liveness/GPS flow, encrypted storage, retention, admin, and deployment      |
| `WORKFLOW_AND_SECURITY_AUDIT.md`       | Provisioning, hierarchy, module, leave, attendance, asset, security, and release acceptance audit |
| `THIRD_PARTY_NOTICES.md`               | Licences and attribution for bundled third-party runtime/model assets                             |

The repository-level [`SECURITY.md`](../SECURITY.md) defines private vulnerability reporting and
mandatory handling of credentials and employee data.

## Current Production Facts

- Private repository: `git@github-atd-ems:Sameerreddy-ATD/Employee-Management-System.git`
- Canonical release branch: `main`
- Existing production checkout branch: `version-1`
- Installation: `/opt/anytime-crew-hub`
- PM2 processes: `atd-backend` and `atd-frontend`
- Backend: `127.0.0.1:4000`
- Frontend preview: `127.0.0.1:8081`
- Public URL: `https://hrms.sameerreddy.in`
- Database provider: MySQL

Secrets are intentionally absent from documentation. Production `.env`, database dumps, private deploy keys, and VAPID private keys stay on the server only.
