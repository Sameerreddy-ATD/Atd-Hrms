# Anytime Diesel Employee Management System Technical Overview

This document describes the current local architecture, setup, backend modules, frontend areas, and verification commands.

## Architecture

```mermaid
flowchart LR
  Browser["React + TanStack Router frontend"] -->|HTTP-only cookies + JSON API| API["Express backend"]
  API --> Prisma["Prisma Client"]
  Prisma --> MySQL["MySQL 8.0 database"]
  API --> Audit["Audit logging"]
  API --> RBAC["RBAC + object-level access checks"]
```

## Runtime Stack

| Layer      | Technology                                                                |
| ---------- | ------------------------------------------------------------------------- |
| Frontend   | React 19, Vite, TanStack Router, TanStack Query, Tailwind/shadcn-style UI |
| Backend    | Node.js, Express, TypeScript                                              |
| Database   | MySQL 8.0                                                                 |
| ORM        | Prisma                                                                    |
| Auth       | JWT in HTTP-only cookies                                                  |
| Validation | Zod                                                                       |
| Testing    | Vitest                                                                    |

## Important Folders

| Path                               | Purpose                                         |
| ---------------------------------- | ----------------------------------------------- |
| `src/routes/`                      | Frontend pages and route definitions            |
| `src/components/`                  | Shared UI, layout, and feature components       |
| `src/services/api/`                | Frontend API client methods                     |
| `server/src/app.ts`                | Express routes and feature handlers             |
| `server/src/rbac.ts`               | Role and access helpers                         |
| `server/src/attendanceEngine.ts`   | Attendance settlement/timeline logic            |
| `server/src/attendanceDayRules.ts` | Daily attendance rules                          |
| `server/src/mapper.ts`             | Backend-to-frontend response mapping            |
| `prisma/schema.prisma`             | MySQL Prisma schema                             |
| `prisma/migrations/`               | Active MySQL migrations                         |
| `prisma/postgresql-migrations/`    | Archived legacy PostgreSQL migrations           |
| `scripts/`                         | MySQL helpers and database verification scripts |

## Environment Setup

Create `.env` from `.env.example`.

Minimum local values:

```text
DATABASE_URL="mysql://root:5566@127.0.0.1:3306/anytimediesel_hrms"
BACKEND_PORT=4000
FRONTEND_ORIGIN="http://localhost:8081"
JWT_ACCESS_SECRET="replace-with-strong-secret"
JWT_REFRESH_SECRET="replace-with-another-strong-secret"
COOKIE_SECURE=false
```

Never commit `.env`.

## Windows Local Runbook

Use Command Prompt or PowerShell from:

```bat
D:
cd D:\anytime-crew-hub
```

Install dependencies:

```bat
npm install
```

Start the project-local MySQL helper if the Windows MySQL service is not running:

```bat
npm run db:start-mysql
```

Apply database migrations:

```bat
npm run db:deploy
```

Seed demo/baseline data:

```bat
npm run db:seed
```

Start backend:

```bat
npm run dev:backend
```

Start frontend in another terminal:

```bat
npm run dev
```

Open the frontend URL shown by Vite, commonly:

```text
http://localhost:5173
```

or the configured local URL:

```text
http://localhost:8081
```

Backend health checks:

```text
http://localhost:4000/health
http://localhost:4000/health/db
```

## Main Backend API Areas

The frontend API client currently calls these backend areas:

| Area                          | Purpose                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `/auth/*`                     | Login, logout, current user, first password change, forgot/reset password           |
| `/users/*`                    | User list, create, update, suspend, deactivate, delete, reset password              |
| `/employees/*`                | Employee list/detail/update, manager checks, birthdays                              |
| `/branches/*`                 | Branch create/edit/delete/list                                                      |
| `/departments/*`              | Department create/edit/delete/list and department head assignment                   |
| `/biometric/devices/*`        | Planned eSSL/biometric device setup for next version                                |
| `/biometric/mappings/*`       | Planned employee-to-biometric user/device mapping for next version                  |
| `/attendance/*`               | My attendance, HR/team reports, mobile punches, correction requests, recalculation  |
| `/leave/*`                    | Leave types, balances, requests, approvals/rejections                               |
| `/holidays/*`                 | Holiday list/create/edit/delete                                                     |
| `/reports/*`                  | Attendance, branch, movement, field, client visit, leave, payroll, timeline reports |
| `/notifications`              | Signed-in user's notifications                                                      |
| `/settings/security/*`        | Predefined new-account password configuration                                       |
| `/audit-logs`                 | Audit trail for admin/developer review                                              |
| `/verify-id-card/:employeeId` | Public ID verification endpoint                                                     |

## Data Model Summary

```mermaid
erDiagram
  User ||--o| Employee : "employeeId"
  Employee }o--o| Department : "departmentId"
  Employee }o--o| Branch : "homeBranchId"
  Employee ||--o{ AttendanceEvent : "events"
  Employee ||--o{ AttendanceDailySummary : "summaries"
  Employee ||--o{ LeaveRequest : "leave"
  Employee ||--o{ LeaveBalance : "balances"
  Employee ||--o{ BiometricEmployeeMapping : "biometric mappings"
  Branch ||--o{ BiometricDevice : "devices"
  Branch ||--o{ Holiday : "holidays"
  BiometricDevice ||--o{ BiometricEmployeeMapping : "mappings"
  LeaveType ||--o{ LeaveRequest : "requests"
  LeaveType ||--o{ LeaveBalance : "balances"
```

## RBAC Rules To Preserve

- Developer Admin can access system-level controls.
- Main Admin has broad administration access.
- HR can manage operational employee, branch, leave, holiday, and attendance data.
- CEO can view summary/report data.
- Manager can view only assigned team members.
- Employee, Sales, Driver, and Field Staff can view only their own data.
- No public signup.
- No production token storage in localStorage.
- Sensitive changes should write audit logs.

## Frontend Areas

| Page                   | Route                      |
| ---------------------- | -------------------------- |
| Dashboard              | `/dashboard`               |
| Employees              | `/employees`               |
| User Logins            | `/users`                   |
| Departments            | `/departments`             |
| My Attendance          | `/attendance/mine`         |
| Attendance Overview    | `/attendance`              |
| Branch Attendance      | `/attendance/branch`       |
| Field Attendance       | `/attendance/field`        |
| Day Logs               | `/attendance/locations`    |
| Attendance Corrections | `/attendance/corrections`  |
| Missed Punch Request   | `/attendance/missed-punch` |
| Apply Leave            | `/leave/apply`             |
| Leave History          | `/leave/history`           |
| Leave Approvals        | `/leave/approvals`         |
| Leave Tracking         | `/leave/reports`           |
| Leave Policy           | `/leave/policy`            |
| Branches               | `/branches`                |
| Biometric Devices      | `/devices`                 |
| Biometric Mapping      | `/devices/mapping`         |
| Holidays               | `/holidays`                |
| Reports                | `/reports`                 |
| Audit Logs             | `/audit`                   |
| Profile                | `/profile`                 |
| ID Card                | `/id-card`                 |
| Notifications          | `/notifications`           |
| System Settings        | `/settings`                |

### Attendance Rule Precedence

Attendance events take precedence over no-event classifications. After a day ends, an employee without events is resolved using the active portal Holiday list, employee weekly-off configuration, approved leave, and finally absence. Every active holiday entry counts regardless of its Public, Optional, or Restricted classification; branch-scoped holidays apply only to employees assigned to that home branch. Holiday mutations recalculate existing summaries for the affected date and scope.

### Mobile Branch Geofence

Mobile attendance sends coordinates to the authenticated API and stores them on the event. The server calculates distance to active branches with latitude, longitude, and attendance radius configured. A point inside the radius is labeled `Mobile - Branch Name`; a point outside every radius remains valid attendance labeled `Mobile`. Client-visit endpoints remain a separate field workflow.

### Leave Authorization

Each leave request stores the employee ID of the organization head selected by hierarchy traversal. Approval-list queries return requests assigned to the signed-in head, and approve/reject endpoints independently compare that stored ID. Parent heads may receive authorized reporting visibility but cannot action a request assigned to a lower head.

For release procedures and device verification, see [UPGRADE_AND_MAINTENANCE.md](UPGRADE_AND_MAINTENANCE.md) and [DEVICE_COMPATIBILITY.md](DEVICE_COMPATIBILITY.md).

## Verification Commands

Run these before pushing production changes:

```bat
npm run typecheck
npm run lint
npm test
npm run build
npm run build:backend
npm run db:verify
```

## Known Operational Notes

- `npm run db:start-mysql` starts a project-local MySQL instance when the installed Windows MySQL service cannot be started without administrator permission.
- The project uses MySQL at runtime. PostgreSQL migration files are retained only as historical reference.
- Some lint warnings may remain from shared UI components that export both components and helper values; lint errors should be fixed before pushing.
- Large frontend chunks may be reported during build. This is a performance warning, not a failed build.

## Current Version Limits And Next Version Plan

Current version:

- Mobile attendance, leave, HR/admin setup, reports, user lifecycle, and role-based dashboards are the primary working flows.
- Biometric/eSSL device integration is not considered live yet.
- Biometric device and mapping routes/screens describe the intended data model and workflow, but real device sync/import should be completed in the next version before operational use.

Next version attendance verification plan:

- eSSL/fingerprint device sync/import.
- Additional geofence administration, monitoring, and exception analytics.
- Approved branch Wi-Fi verification for branch-mobile attendance.
- Photo/selfie capture during mobile check-in and check-out.
- Attendance proof summary showing source: biometric, GPS, Wi-Fi, photo, manual correction, or combined verification.
