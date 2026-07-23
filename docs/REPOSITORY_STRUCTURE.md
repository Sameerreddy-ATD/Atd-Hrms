# Repository Structure and File Ownership

This document is the authoritative map of the `version-1` repository. It explains where each kind
of code belongs, which files are generated, and which areas must be updated together.

## Top-Level Layout

| Path                | Purpose                                                                        | Ownership rule                                                   |
| ------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `docs/`             | Product, user, data, API, deployment, and maintenance manuals                  | Update the relevant guide whenever behavior changes              |
| `prisma/`           | Active MySQL schema, migrations, and baseline seed                             | Schema changes require an immutable migration and database audit |
| `public/`           | Public PWA assets, icons, manifest, and service worker                         | Do not place secrets or employee data here                       |
| `scripts/`          | Local setup, verification, migration, reset, and smoke-test utilities          | Scripts must fail safely and document destructive behavior       |
| `server/src/`       | Express API, authorization, business rules, persistence, and integrations      | Server authorization is authoritative                            |
| `src/components/`   | Reusable React feature, layout, and UI components                              | Page-only behavior remains in its route                          |
| `src/hooks/`        | Reusable React hooks                                                           | Hooks must not bypass the central API/auth layers                |
| `src/lib/`          | Frontend authentication, formatting, live events, notifications, and utilities | Keep browser-only concerns out of the backend                    |
| `src/routes/`       | TanStack file-based screens and authenticated layouts                          | Follow `src/routes/README.md`                                    |
| `src/services/api/` | Typed browser-to-backend API client                                            | All authenticated screen requests use this client                |
| `src/types/`        | Shared frontend domain contracts                                               | Keep contracts aligned with server mappers and schemas           |
| `tests/`            | Unit, workflow, security, and browser tests                                    | Every business-rule regression needs a focused test              |

Generated folders such as `dist/`, `dist-server/`, `.tanstack/`, `node_modules/`, Playwright output,
logs, and local databases are ignored and must never be committed.

## Root Files

| File                                | Purpose                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `.env.example`                      | Safe environment-variable template without real secrets                 |
| `.editorconfig`                     | Cross-editor whitespace and line-ending defaults                        |
| `.gitignore`                        | Excludes secrets, dependencies, builds, reports, logs, and local data   |
| `.prettierignore`, `.prettierrc`    | Repository formatting policy                                            |
| `README.md`                         | Project overview, quick start, structure, and documentation entry point |
| `SECURITY.md`                       | Private vulnerability reporting and security expectations               |
| `components.json`                   | shadcn/ui generator configuration and aliases                           |
| `eslint.config.js`                  | Static analysis configuration                                           |
| `package.json`, `package-lock.json` | Scripts and reproducible Node dependency graph                          |
| `playwright.config.ts`              | Desktop and mobile browser-test configuration                           |
| `tsconfig.json`                     | Shared strict TypeScript and `@/` path-alias configuration              |
| `vite.config.ts`                    | TanStack Start, React, Tailwind, development, and preview configuration |
| `vitest.config.ts`                  | Node-based unit-test discovery and execution                            |

## Backend Ownership

| Area                                   | Files                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Application routes and orchestration   | `server/src/app.ts`                                                                                           |
| Runtime entry and configuration        | `server/src/index.ts`, `server/src/config.ts`, `server/src/prisma.ts`                                         |
| Authentication and authorization       | `server/src/security.ts`, `server/src/rbac.ts`, `server/src/module-access.ts`                                 |
| Request validation and error contracts | `server/src/schemas.ts`, `server/src/errors.ts`                                                               |
| API response mapping and audit history | `server/src/mapper.ts`, `server/src/audit.ts`                                                                 |
| Employee Integration API v1            | `server/src/integration-api.ts`                                                                               |
| Attendance calculation and live state  | `attendanceEngine.ts`, `attendanceDayRules.ts`, `attendanceSettlement.ts`, `attendanceLive.ts`, `geofence.ts` |
| Leave calculation                      | `server/src/leavePolicy.ts`                                                                                   |
| Notifications, birthdays, and Web Push | `notificationLive.ts`, `push.ts`, `birthdays.ts`, `birthdayMessages.ts`                                       |

New backend features should use a focused module when logic is independently testable. Route
registration and transactional orchestration may remain in `app.ts`; reusable business rules should
not be duplicated inside route handlers.

## Frontend Ownership

- `src/routes/__root.tsx` owns the root HTML document, metadata, and global error boundary.
- `src/routes/_app.tsx` owns authenticated layout and access setup.
- `_app.<feature>.tsx` files own their screen queries, mutations, and page composition.
- `src/components/layout/` owns global navigation, header, command palette, and live bridges.
- `src/components/common/` owns reusable application-specific controls and states.
- `src/components/ui/` contains low-level design-system primitives. Do not put business logic there.
- `src/types/domain.ts` contains frontend API domain contracts. The old `src/mock/` location was
  removed because these are production contracts, not mock records.
- `src/routeTree.gen.ts` is generated by TanStack Router and must not be manually edited.

## Database Ownership

- `prisma/schema.prisma` is the current MySQL model.
- `prisma/migrations/` is the ordered, immutable MySQL migration history.
- `prisma/seed.ts` creates baseline accounts and organization reference data only for a new database.
- `prisma/postgresql-migrations/` is archived migration history for the retired PostgreSQL system.
  Never run it against MySQL and never add new migrations there.
- `scripts/migrate-postgres-to-mysql.ps1` is a one-time legacy transfer utility, not a normal deploy
  step.

See [Database Integrity Audit](DATABASE_INTEGRITY_AUDIT.md) and
[Employee Data and Integration API](EMPLOYEE_DATA_AND_INTEGRATION_API.md) before changing storage.

## Test Ownership

| Test area                                    | Location                            |
| -------------------------------------------- | ----------------------------------- |
| Unit and business-rule tests                 | `tests/*.test.ts`                   |
| Role/navigation browser coverage             | `tests/e2e/role-navigation.spec.ts` |
| Employee API end-to-end smoke flow           | `scripts/smoke-employee-api.ps1`    |
| Work Planner persistence smoke flow          | `scripts/smoke-tasks.ps1`           |
| Production-data reset smoke flow             | `scripts/smoke-reset-test-data.ps1` |
| Database storage and relation audit          | `scripts/audit-database.mjs`        |
| Repository structure and documentation audit | `scripts/audit-repository.mjs`      |

Work Planner feature components live in `src/components/tasks/`: the board directory, configurable
board dialog, board workspace, task creation dialog, focused task detail, and shared task labels.
`src/routes/_app.tasks.tsx` only loads data and coordinates their versioned API operations.

## Change-to-Documentation Matrix

| Change                                          | Required documentation                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Screen, label, or user workflow                 | `USER_GUIDE.md`, and `PRODUCT_NAMING.md` when terminology changes             |
| Role, permission, or status transition          | `OPERATIONS_AND_WORKFLOWS.md`                                                 |
| Backend module or architecture                  | `TECHNICAL_OVERVIEW.md` and this file                                         |
| Table, constraint, migration, or data retention | `DATABASE_INTEGRITY_AUDIT.md` and `EMPLOYEE_DATA_AND_INTEGRATION_API.md`      |
| `/api/v1` contract                              | `openapi.employee-v1.yaml` and `EMPLOYEE_DATA_AND_INTEGRATION_API.md`         |
| Environment or deployment process               | `.env.example`, `LINUX_LOCAL_DEPLOYMENT.md`, and `UPGRADE_AND_MAINTENANCE.md` |
| Test or maintenance script                      | `scripts/README.md` and `DEVELOPMENT_AND_TESTING.md`                          |

## Placement Rules

1. Do not add a second API client, route system, database schema, or shared-types folder.
2. Do not store real data in source fixtures. Disposable test records belong in test setup or seeds.
3. Do not commit generated builds, local databases, `.env`, dumps, reports, private keys, or logs.
4. Do not edit an applied migration. Add a new migration that preserves an auditable history.
5. Keep public assets generic; employee documents and uploads must use approved external/private
   storage and database references.
6. Remove unused feature files instead of leaving production placeholders that imply a workflow is
   available.
