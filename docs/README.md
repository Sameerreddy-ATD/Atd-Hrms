# Documentation Index

These documents describe the `version-1` application and production deployment. When code changes a workflow, permission, API contract, environment variable, migration, or operational command, update the relevant document in the same commit.

## Read By Role

- Employees and managers: [User Guide](USER_GUIDE.md)
- HR and Developer Admin: [User Guide](USER_GUIDE.md) and [Operations and Workflows](OPERATIONS_AND_WORKFLOWS.md)
- Developers: [Technical Overview](TECHNICAL_OVERVIEW.md)
- Server administrators: [Linux and AWS Deployment](LINUX_LOCAL_DEPLOYMENT.md)
- Release owners: [Upgrade and Maintenance](UPGRADE_AND_MAINTENANCE.md)
- Mobile QA/support: [Device Compatibility](DEVICE_COMPATIBILITY.md)

## Document Ownership

| Document                      | Authoritative subject                                                         |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `README.md`                   | Project identity, quick start, structure, and required checks                 |
| `USER_GUIDE.md`               | Screen-level instructions for each user type                                  |
| `OPERATIONS_AND_WORKFLOWS.md` | Business rules, permissions, status transitions, and retention                |
| `TECHNICAL_OVERVIEW.md`       | Architecture, modules, API groups, data model, and engineering rules          |
| `LINUX_LOCAL_DEPLOYMENT.md`   | Fresh Linux/AWS installation, private Git access, domain, TLS, Nginx, and PM2 |
| `UPGRADE_AND_MAINTENANCE.md`  | Production updates, backups, verification, rollback, and long-term operations |
| `DEVICE_COMPATIBILITY.md`     | Supported browsers, PWA permissions, low-network behavior, and QA matrix      |

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
