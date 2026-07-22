# Documentation Index

These documents describe the `version-1` application and production deployment. When code changes a workflow, permission, API contract, environment variable, migration, or operational command, update the relevant document in the same commit.

## Read By Role

- Employees and managers: [User Guide](USER_GUIDE.md)
- HR and Developer Admin: [User Guide](USER_GUIDE.md) and [Operations and Workflows](OPERATIONS_AND_WORKFLOWS.md)
- Developers: [Technical Overview](TECHNICAL_OVERVIEW.md)
- New contributors: [Repository Structure](REPOSITORY_STRUCTURE.md) and [Development and Testing](DEVELOPMENT_AND_TESTING.md)
- Database owners and integration developers: [Database Integrity Audit](DATABASE_INTEGRITY_AUDIT.md), [Employee Data and Integration API](EMPLOYEE_DATA_AND_INTEGRATION_API.md), and [OpenAPI](openapi.employee-v1.yaml)
- Product owners and UI writers: [Product Naming](PRODUCT_NAMING.md)
- Go-live owners: [Reset and Go-Live](RESET_AND_GO_LIVE.md)
- Server administrators: [Linux and AWS Deployment](LINUX_LOCAL_DEPLOYMENT.md)
- Release owners: [Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md)
- Mobile QA/support: [Device Compatibility](DEVICE_COMPATIBILITY.md)

## Document Ownership

| Document                               | Authoritative subject                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `README.md`                            | Project identity, quick start, structure, and required checks                                    |
| `USER_GUIDE.md`                        | Screen-level instructions for each user type                                                     |
| `OPERATIONS_AND_WORKFLOWS.md`          | Business rules, permissions, status transitions, and retention                                   |
| `TECHNICAL_OVERVIEW.md`                | Architecture, modules, API groups, data model, and engineering rules                             |
| `REPOSITORY_STRUCTURE.md`              | Authoritative folder map, file ownership, placement rules, and documentation responsibilities    |
| `DEVELOPMENT_AND_TESTING.md`           | Local setup, database changes, test matrix, browser QA, and commit checks                        |
| `EMPLOYEE_DATA_AND_INTEGRATION_API.md` | Complete table catalog, canonical employee rules, API security, synchronization and verification |
| `DATABASE_INTEGRITY_AUDIT.md`          | Full storage assurance, automated integrity checks, Task v2 rules, and repair policy             |
| `openapi.employee-v1.yaml`             | Machine-readable Employee API v1 contract                                                        |
| `PRODUCT_NAMING.md`                    | Recommended product name and professional interface terminology                                  |
| `RESET_AND_GO_LIVE.md`                 | Safe test-data reset, verification, and step-by-step real-company setup                          |
| `LINUX_LOCAL_DEPLOYMENT.md`            | Fresh Linux/AWS installation, private Git access, domain, TLS, Nginx, and PM2                    |
| `UPGRADE_AND_MAINTENANCE.md`           | Production updates, backups, verification, rollback, and long-term operations                    |
| `DEVICE_COMPATIBILITY.md`              | Supported browsers, PWA permissions, low-network behavior, and QA matrix                         |

The repository-level [`SECURITY.md`](../SECURITY.md) defines private vulnerability reporting and
mandatory handling of credentials and employee data.

## Current Production Facts

- Private repository: `git@github-atd-ems:Sameerreddy-ATD/Employee-Management-System.git`
- Branch: `version-1`
- Installation: `/opt/anytime-crew-hub`
- PM2 processes: `atd-backend` and `atd-frontend`
- Backend: `127.0.0.1:4000`
- Frontend preview: `127.0.0.1:8081`
- Public URL: `https://hrms.sameerreddy.in`
- Database provider: MySQL

Secrets are intentionally absent from documentation. Production `.env`, database dumps, private deploy keys, and VAPID private keys stay on the server only.
