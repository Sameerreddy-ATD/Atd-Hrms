# Employee Data Model and Integration API

This document is the authoritative guide to employee storage, table ownership, data integrity,
the browser-facing employee endpoints, and the versioned server-to-server Employee API.

## 1. Storage Architecture

The backend uses Prisma ORM with MySQL 8. `DATABASE_URL` is the only database connection source.
The Prisma models are defined in `prisma/schema.prisma`; deployable changes are stored under
`prisma/migrations`.

```text
React form
  -> JSON API request
  -> Express authentication and permission checks
  -> Zod request validation
  -> Prisma transaction/query
  -> MySQL table constraints
  -> response mapper
  -> JSON response
```

A successful create or update response is sent only after the Prisma operation completes. Related
employee/account writes use a transaction: either every table is updated or all changes roll back.

## 2. Canonical Records and Identifiers

### Employee is the workforce source of truth

`employees` owns workforce and profile data. `users` owns login/security data. Shared `name`,
`email`, and `phone` columns remain in `users` only as an authentication/display mirror for backward
compatibility. Application write paths synchronize these fields from the employee record in the same
transaction.

| Identifier                     | Meaning                                                | Stability rule                                 |
| ------------------------------ | ------------------------------------------------------ | ---------------------------------------------- |
| `employees.employee_id`        | Primary API and relational employee identifier         | Immutable; use for integrations                |
| `employees.employee_code`      | Human-readable business identifier                     | Unique; cannot be changed through v1 update    |
| `employees.external_reference` | Optional identifier from an upstream/downstream system | Unique when present                            |
| `users.id`                     | Authentication account identifier                      | Never use as an employee identifier            |
| `users.employee_id`            | Optional one-to-one link to an employee                | Unique; an employee may exist without a login  |
| `employees.version`            | Optimistic concurrency version                         | Increments for every supported employee change |

The browser employee DTO now always returns `id == employeeId`. If a login exists, its identifier is
returned separately as `userId`.

### Account and employee lifecycle

- Creating a browser login for a new employee creates both rows transactionally.
- Linking a login to an existing employee uses the employee's canonical name, email, and phone.
- Creating through `/api/v1/employees` creates an employee only; no password or login is required.
- Updating shared employee fields updates the linked account mirror transactionally.
- Deactivation sets employee/account status to `INACTIVE` (or preserves the employee's explicit
  `TERMINATED` state), records termination/deactivation time,
  increments the employee version, and retains attendance, leave, expenses, assets, tasks, and audit
  history.
- Reactivation clears termination/deactivation time and records a `REACTIVATED` change event.
- The production account UI does not permanently delete an employee. The explicitly labelled test
  data reset remains destructive and must only be used after a backup.

## 3. Table Catalog

The schema contains 42 application tables and 32 ordered MySQL migrations in this release.

### Identity, security, and configuration

| Table                        | Primary key       | Purpose and important relationships                                                                                                   |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                      | `id`              | Login email, bcrypt password hash, role, account status, lock/suspension state, optional unique `employee_id`, creator and timestamps |
| `audit_logs`                 | `audit_id`        | Actor, affected user, action, before/after JSON and request IP                                                                        |
| `push_subscriptions`         | `subscription_id` | Web Push endpoint and keys; cascades with user                                                                                        |
| `announcements`              | `announcement_id` | Role-visible organizational announcements and author                                                                                  |
| `system_settings`            | `key`             | JSON/text-backed protected runtime settings, including module access                                                                  |
| `integration_clients`        | `client_id`       | Hashed service credentials, scopes, expiry, revocation and last-use metadata                                                          |
| `integration_idempotency`    | `idempotency_id`  | 24-hour write-response cache keyed by integration client and `Idempotency-Key`                                                        |
| `face_profiles`              | `profile_id`      | One encrypted face template and enrollment/approval state per login                                                                   |
| `face_verification_sessions` | `session_id`      | Purpose-bound one-time challenge, hashed nonce, expiry, and consumption                                                               |
| `face_evidence`              | `evidence_id`     | Short-lived encrypted image reference, scores, GPS, outcome, and optional attendance link                                             |

Passwords and raw API keys are never stored. Passwords use bcrypt; integration keys use SHA-256.
The raw integration key is returned once at creation.

### Employee and organization

| Table                    | Primary key     | Purpose and important relationships                                                                                                                                                    |
| ------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `employees`              | `employee_id`   | Canonical employee master record, employer company, contact/employment details, encrypted payroll/statutory fields, attendance configuration, status, version and lifecycle timestamps |
| `departments`            | `department_id` | Hierarchical organization unit, parent unit and optional employee head                                                                                                                 |
| `branches`               | `branch_id`     | Work location, address, geofence and attendance radius                                                                                                                                 |
| `emergency_contacts`     | `employee_id`   | One-to-one employee emergency and medical-contact information                                                                                                                          |
| `profile_edit_requests`  | `request_id`    | Employee-requested profile changes and review status                                                                                                                                   |
| `employee_change_events` | `sequence`      | Durable ordered employee create/update/deactivate/reactivate feed                                                                                                                      |

`employees.manager_id` is a self-reference to another employee. Department, branch, manager,
employee code, employee email and external reference are protected by database constraints.
`company_entity` is separate from `home_branch_id`: company is the legal employer while home branch
is an attendance location. Bank account number, PAN, Aadhaar, and UAN use AES-256-GCM encrypted
columns with separate last-four display values. See
[Employee Profile and ID Card](EMPLOYEE_PROFILE_AND_ID_CARD.md).

### Attendance

| Table                            | Purpose                                              |
| -------------------------------- | ---------------------------------------------------- |
| `biometric_devices`              | Registered biometric device and branch configuration |
| `biometric_employee_mappings`    | Employee-to-device user mapping                      |
| `employee_branch_schedules`      | Date-effective employee work location schedule       |
| `attendance_events`              | Immutable punch/source event stream                  |
| `attendance_daily_summaries`     | Calculated employee/day attendance result            |
| `attendance_reminders`           | Reminder delivery state                              |
| `field_attendance`               | GPS field check-in/out record                        |
| `attendance_correction_requests` | Requested punch correction and approval state        |
| `holidays`                       | Company-wide or branch-specific holiday calendar     |

Raw attendance events and calculated summaries are separate so summaries can be recalculated without
discarding source punches.

### Leave and weekly off

| Table                 | Purpose                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `leave_types`         | Leave policy definition                                                                     |
| `leave_balances`      | Employee/type entitlement, usage and manual adjustment                                      |
| `leave_requests`      | Dates, reason, approver, status, reviewer/note/time, cancellations and medical verification |
| `weekly_off_requests` | Employee weekly-off request and approver                                                    |
| `comp_off_credits`    | Earned and consumed compensatory-off credit                                                 |

### Expenses and HR documents

| Table                  | Purpose                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `expense_claims`       | Advance/expense amount, details, Google Drive receipt, sharing confirmation, lifecycle and reviewer FK |
| `certificate_requests` | HR document request, delivery method, output link, status and reviewer FK                              |

`certificate_requests` is retained as the physical table name for migration compatibility. The
professional product/UI term is **HR Documents**. A future physical rename is not necessary for API
consumers because database table names are not exposed by the API.

Expense status flow is `PENDING -> UNPAID -> PAID` or `PENDING -> REJECTED`. An expense attachment
must be a `drive.google.com` or `docs.google.com` URL. The submitter must explicitly confirm that
General access is **Anyone with the link** and role is **Viewer**; the confirmation is stored in
`receipt_access_confirmed`. This records user attestation. It does not call Google Drive or bypass
Google permissions.

### Assets

| Table                 | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `asset_catalog_items` | Reusable asset names/categories/default values                 |
| `company_assets`      | Physical/online asset, cost, recurrence, assignment and status |
| `asset_returns`       | Return checklist, condition, receiver and timestamp            |

### Tasks

| Table                | Purpose                                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| `task_boards`        | Versioned board metadata, archive state and open/role/member access policy        |
| `task_stages`        | Ordered workflow stages with canonical task status                                |
| `task_board_roles`   | Roles allowed on a role-gated board                                               |
| `task_board_members` | Employees allowed on a member-gated board                                         |
| `work_tasks`         | Versioned task, board/stage, dates, priority, progress, archive and activity time |
| `task_assignments`   | Many-to-many task assignees plus assigning user                                   |
| `task_updates`       | Typed activity log, structured metadata, progress/status and minutes worked       |

Task stage status is canonical. Task edits use `work_tasks.version`; board configuration and archive
edits use `task_boards.version`. Both reject stale writes with HTTP 409. Task writes commit
assignments and activity rows atomically. See
[Database Integrity Audit](DATABASE_INTEGRITY_AUDIT.md).

## 4. Browser Employee Endpoints

These endpoints use HTTP-only browser session cookies and role/module permissions:

| Method and path                | Access                                         | Purpose                                               |
| ------------------------------ | ---------------------------------------------- | ----------------------------------------------------- |
| `GET /employees`               | Signed-in, scope-filtered                      | Employee directory                                    |
| `GET /employees/:employeeId`   | Self, authorized manager, HR/admin/leadership  | One employee                                          |
| `PATCH /employees/:employeeId` | Developer Admin; HR manager-only update        | Update canonical employee and account mirror          |
| `POST /users`                  | Developer Admin                                | Create login and optionally employee                  |
| `PATCH /users/:userId`         | Developer Admin                                | Update account and synchronize shared employee fields |
| `DELETE /users/:userId`        | Developer Admin with `DEACTIVATE` confirmation | Soft-deactivate and retain data                       |

These endpoints are for the first-party application. External systems must use `/api/v1` and must not
automate browser login/cookies.

Private banking/statutory fields are available only to the employee and authorized leadership/HR
roles through the browser employee mapper. They are deliberately excluded from Employee API v1.
Face templates, consent, sessions, evidence images/metadata, scores, and attendance-verification
links are also deliberately excluded.

## 5. Integration Credential Administration

Only Developer Admin can manage credentials.

1. Open **System Settings**.
2. Open **Employee API Access**.
3. Enter an application-specific name such as `Payroll production`.
4. Choose the minimum required scopes.
5. Set an expiry where possible.
6. Create and immediately copy the displayed key into the consuming application's secret manager.
7. Revoke the credential immediately if it is exposed or no longer used.

Scopes:

| Scope                  | Allows                                          |
| ---------------------- | ----------------------------------------------- |
| `employees:read`       | List and retrieve employee profiles             |
| `employees:write`      | Create, update and deactivate employee profiles |
| `employee-events:read` | Consume the ordered employee change feed        |

Use one credential per application and environment. Never put an API key in browser JavaScript,
mobile application bundles, source control, logs, screenshots, or support tickets.

## 6. Authentication

Send the key as a bearer token:

```http
Authorization: Bearer atd_live_REDACTED
```

`X-API-Key` is accepted for clients that cannot set bearer authentication, but Authorization is
preferred. Server-to-server requests are exempt from browser CSRF Origin checks only when an
integration credential header is present; the `/api/v1` route still validates the key and scope.

Invalid, expired, or revoked keys receive `401`. Missing scopes receive `403`. Every successful use
updates `integration_clients.last_used_at`.

## 7. Employee API v1

The machine-readable contract is `docs/openapi.employee-v1.yaml` and is served at
`GET /api/v1/openapi.yaml`.

### List employees

```bash
curl -H "Authorization: Bearer $ATD_EMPLOYEE_API_KEY" \
  "https://hrms.example.com/api/v1/employees?limit=100"
```

The response contains `data` and `page`. Continue with `page.nextCursor` while `page.hasMore` is
true. The maximum page size is 250. `status` and `updatedSince` are optional snapshot filters.

### Get an employee

```bash
curl -i -H "Authorization: Bearer $ATD_EMPLOYEE_API_KEY" \
  "https://hrms.example.com/api/v1/employees/EMPLOYEE_CUID"
```

The response includes `version`; the same value is returned as `ETag`.

### Create an employee without a login

```bash
curl -X POST "https://hrms.example.com/api/v1/employees" \
  -H "Authorization: Bearer $ATD_EMPLOYEE_API_KEY" \
  -H "Idempotency-Key: payroll-import-000184" \
  -H "Content-Type: application/json" \
  -d '{
    "externalReference": "PAYROLL-184",
    "employeeCode": "EMP-0184",
    "name": "Example Employee",
    "email": "employee@example.com",
    "companyEntity": "FUELISTIC_INNOVATIONS_PRIVATE_LIMITED",
    "companyPhone": "+91 90000 00000",
    "employmentType": "FULL_TIME",
    "status": "ACTIVE"
  }'
```

`employeeCode` is optional and generated when omitted. `externalReference`, `employeeCode`, and
email must be unique when supplied. No login/password is created.

### Update with optimistic concurrency

First retrieve the current version. Then:

```bash
curl -X PATCH "https://hrms.example.com/api/v1/employees/EMPLOYEE_CUID" \
  -H "Authorization: Bearer $ATD_EMPLOYEE_API_KEY" \
  -H "Idempotency-Key: payroll-update-000184-v3" \
  -H 'If-Match: "3"' \
  -H "Content-Type: application/json" \
  -d '{"designation":"Senior Operations Executive"}'
```

If another change already incremented the version, the API returns `409`. Fetch the current record,
merge intentionally, and retry with a new idempotency key and current version. Missing/invalid
`If-Match` returns `428`.

### Deactivate without deleting history

```bash
curl -X DELETE "https://hrms.example.com/api/v1/employees/EMPLOYEE_CUID" \
  -H "Authorization: Bearer $ATD_EMPLOYEE_API_KEY" \
  -H "Idempotency-Key: termination-EMP-0184" \
  -H 'If-Match: "4"'
```

This sets employee/account status inactive and retains related rows. It never physically deletes the
employee.

## 8. Idempotency

All v1 writes require `Idempotency-Key`.

- Keys are scoped to one integration client.
- The original response is retained for 24 hours.
- Repeating the same request with the same key replays the stored response and adds
  `Idempotent-Replayed: true`.
- Reusing a key for different method/path/body/version returns `409`.
- Use a stable business operation ID, not a random key regenerated on every network retry.

## 9. Change Feed and Synchronization

Use `GET /api/v1/employee-events?after=0&limit=100` for reliable incremental synchronization.
Events are ordered by an auto-incrementing 64-bit `sequence` and contain:

- `CREATED`
- `UPDATED`
- `DEACTIVATED`
- `REACTIVATED`

Persist the last successfully processed sequence in the consuming application. Process the entire
page transactionally, then save `page.nextAfter`. Events may be delivered more than once if a
consumer retries; consumers must be idempotent by `eventId` or sequence. Event payloads are snapshots
or compact identifiers depending on the originating first-party operation. Always retrieve the
employee by `employeeId` when the complete latest profile is required.

Recommended initial synchronization:

1. Read the current maximum event position by consuming the event feed.
2. Page through `/employees` and upsert every employee by `employeeId`.
3. Resume events after the saved position.
4. Upsert only when the incoming employee `version` is newer than the locally stored version.

## 10. Privacy and Response Boundaries

The integration DTO excludes password hashes, failed-login counts, session information, suspension
details, audit internals, and module access. It includes the employee profile, organization,
employment, attendance configuration, timestamps, version, and only the linked account ID/status.

Date-of-birth is personal data. Bank account number, IFSC, account holder/type, PAN, Aadhaar, UAN,
and blood group are intentionally excluded from v1. Biometric face templates, captures, consent,
verification sessions, and scores are never part of Employee API v1. Grant Employee API credentials only to systems
approved to process employee personal information. Transport must use HTTPS in production.

## 11. Error Handling

| HTTP status | Meaning                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| `400`       | Validation failure, bad reference, or missing idempotency key             |
| `401`       | Missing, invalid, expired, or revoked API key                             |
| `403`       | Credential lacks required scope                                           |
| `404`       | Employee/reference not found                                              |
| `409`       | Unique conflict, version conflict, or idempotency-key misuse              |
| `428`       | `If-Match` is missing or invalid                                          |
| `429`       | Rate limit exceeded                                                       |
| `500`       | Unexpected server/database failure; retry only safe/idempotent operations |

Validation errors include a `details` object. Do not retry `400`, `403`, `404`, `409`, or `428`
without correcting the request or refreshing current state.

## 12. Migration and Deployment

The integration changes are in migration:

```text
20260722190000_employee_integration_hardening
```

The migration:

- adds employee external reference, version, termination and account deactivation fields;
- backfills account mirrors from canonical employee profiles where email uniqueness permits;
- adds expense attachment-sharing confirmation;
- removes dangling expense/HR-document reviewer values and adds reviewer foreign keys;
- creates integration client, idempotency and employee change-event tables.

Production procedure:

```bash
mysqldump --single-transaction --routines --triggers DATABASE_NAME > pre_employee_api.sql
npm ci
npm run db:deploy
npm run build
npm run build:backend
pm2 restart atd-backend --update-env
pm2 restart atd-frontend --update-env
```

Never use `prisma migrate dev` against production.

## 13. Verification

Run code verification:

```bash
npx prisma validate
npm run typecheck
npm run lint
npm test
npm run build
npm run build:backend
```

Run the full Employee API persistence flow only against an isolated local database:

```powershell
$env:DATABASE_URL = "mysql://root:password@127.0.0.1:3306/anytimediesel_hrms"
$env:SMOKE_CONFIRMATION = "LOCAL TEST DATABASE"
$env:SMOKE_ADMIN_EMAIL = "developer@example.com"
$env:SMOKE_ADMIN_PASSWORD = "local-admin-password"
npm run test:employee-api
```

The guarded smoke test validates service authentication, scoped access, employee creation,
idempotent replay, optimistic version conflicts, account/profile mirroring, soft deactivation,
the change feed, retained expense history, and credential revocation. It writes test records
and refuses a database host other than `localhost` or `127.0.0.1`.

With the real `DATABASE_URL` configured:

```bash
npm run db:deploy
npx prisma migrate status
npm run db:verify
```

Database consistency query for shared employee/account fields:

```sql
SELECT
  e.employee_id,
  e.employee_code,
  e.name AS employee_name,
  u.name AS account_name,
  e.email AS employee_email,
  u.email AS account_email,
  e.phone AS employee_phone,
  u.phone AS account_phone
FROM employees e
JOIN users u ON u.employee_id = e.employee_id
WHERE NOT (e.name <=> u.name)
   OR NOT (e.email <=> u.email)
   OR NOT (e.phone <=> u.phone);
```

The expected result is zero rows. Also verify inactive consistency:

```sql
SELECT e.employee_id, e.status AS employee_status, u.status AS account_status
FROM employees e
JOIN users u ON u.employee_id = e.employee_id
WHERE (e.status = 'INACTIVE' AND u.status = 'ACTIVE')
   OR (e.status = 'ACTIVE' AND u.status = 'INACTIVE');
```

Before approving an integration release, perform a test sequence: create employee, repeat the create
with the same idempotency key, get, update with ETag, verify stale-version conflict, consume events,
deactivate, and confirm attendance/leave/task/history rows remain present.

## 14. Backup, Retention, and Recovery

- Back up MySQL before every schema migration.
- Retain employee change events for integration recovery; do not truncate them casually.
- Idempotency rows may be purged after `expires_at`.
- Revoked integration clients should remain for audit history.
- Employee operational history is retained after deactivation.
- The test-data reset is the only application workflow intended to erase employee test records.
- Database restoration must restore the employee, event and integration tables from the same backup
  point to preserve version/event consistency.

## 15. Integration Go-Live Checklist

- Target database backup completed.
- All migrations show applied.
- Employee/account mismatch queries return zero rows.
- Separate production integration credential created with minimum scopes and an expiry.
- Raw key stored in the consumer's secret manager.
- HTTPS certificate and hostname validated.
- Initial full synchronization completed.
- Event cursor persisted and recovery tested.
- Idempotency retries tested.
- `409` version-conflict handling tested.
- Deactivation retains related history.
- Credential revocation tested.
- Monitoring alerts on repeated `401`, `403`, `409`, `429`, and `5xx` responses.
