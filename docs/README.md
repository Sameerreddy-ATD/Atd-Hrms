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
  [Face Registration and Verified Attendance](FACE_ATTENDANCE_SECURITY.md) and
  [Attendance, Leave, and Face Policy](ATTENDANCE_LEAVE_AND_FACE_POLICY.md)
- Security, QA, and release owners:
  [Workflow and Security Audit](WORKFLOW_AND_SECURITY_AUDIT.md)
- Product QA / UX fix owners: [UX and Workflow Audit](UX_FLOW_AUDIT.md)
- Full-stack completeness owners: [Application Audit](APPLICATION_AUDIT.md) (frontend, backend, DB, stubs, deferred modules)
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
| `ATTENDANCE_LEAVE_AND_FACE_POLICY.md`  | Authoritative Full Day/Half Day/Absent, Missed Checkout, leave, Comp Off, and face photo rules    |
| `WORKFLOW_AND_SECURITY_AUDIT.md`       | Provisioning, hierarchy, module, leave, attendance, asset, security, and release acceptance audit |
| `UX_FLOW_AUDIT.md`                     | Tester/developer register of broken flows, misplaced buttons, stubs, and suggested fix order      |
| `APPLICATION_AUDIT.md`                 | Full-stack completeness: working flows, half-built features, deferred DB modules, fix priority    |
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

## Final Internal Release Notes (July 2026)

This package is intended for internal Anytime Diesel use. Final review changes include:

- Removed obsolete startup-screen / app-rating Developer Admin controls (no longer shown on loaders).
- Role-ordered navigation for every login role.
- Login crew avatar (Anytime Diesel uniform, green-screen removed) closes his eyes while a password
  is typed and opens them when the password is revealed.
- Notifications limited to actionable items; push only for urgent/important announcements.
- No automatic “Add to Home Screen” / install banner on laptop or desktop browsers.
- Attendance/leave calendar helpers use Asia/Kolkata dates consistently.
- Documentation updated for go-live owners (`USER_GUIDE`, `TECHNICAL_OVERVIEW`, `RESET_AND_GO_LIVE`).

### Policy release (late July 2026)

- Attendance results: Full Day (≥9h) / Half Day (4–&lt;9h) / Absent (&lt;4h); Late and Missed Checkout
  as flags; Branch-Mobile vs Mobile labels; shift catalog assignments.
- Missed Checkout at shift end + 30 with two-day employee correction window then HR lock; **does not
  block next-day check-in** (prior open day auto-closes when needed).
- Leave: Casual / Sick / Unpaid / Comp Off; medical upload 48h; Comp Off on holiday Full Day with
  approval-on-consume; company-wide holidays; Sunday weekly-off auto-confirm.
- Face: centre/left/right registration photos once; daily check-in verifies live without storing
  photos. See `ATTENDANCE_LEAVE_AND_FACE_POLICY.md`.
- Appearance: light/dark toggle only (no Auto).

Still out of scope for this release: automated payslips/payroll deductions, live biometric device
connectors, WhatsApp messaging providers, and full LMS/ATS enterprise suites.

Recently added MVP modules (July 2026): Work Planner Phase 2 (archive, attachments, mentions,
cross-board move, custom fields), global search, notification digest preferences, operations
reports + paid-claims CSV export, field claims, and onboarding checklists. Document vault and SOP
are deferred.
library.
