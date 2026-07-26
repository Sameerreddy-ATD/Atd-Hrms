# Database Integrity Audit and Storage Assurance

## Purpose

This document explains how application data is stored, which rules protect it, how to audit every
table, and what must be verified before another application consumes employee data. The active
schema is `prisma/schema.prisma`; production changes are applied only from ordered SQL files in
`prisma/migrations`.

The database audit is read-only. It does not repair, delete, or normalize production data. A failed
check must be investigated, backed up, and corrected through a reviewed migration or application
workflow.

## Latest Release Audit

The 26 July 2026 Wave A–C release audit notes:

- all **38** ordered migration directories are present and the Prisma schema validates;
- MySQL now contains **58** application tables (HRMS modules plus vehicle asset columns);
- ACL fixes cover task attachment/archive access and scoped global search boards;
- private upload paths exist for company documents, expense receipts, and sick-leave medical files;
- offline punch queueing is available for daily ops. Roster/OT/travel-fuel/appraisals/recruitment
  tables may still exist in MySQL but product handlers for those surfaces are retired for now.

The previous 25 July 2026 code and workflow audit produced these results:

- all 33 ordered migration directories were present and the Prisma schema validated;
- the repository audit found every required handover file with zero failures or warnings;
- frontend/backend type checks, production builds, 69 unit/workflow/security tests, and three
  desktop/mobile Playwright checks passed;
- the ExcelJS archive/read dependency paths are locked to maintained releases, workbook read/write
  regression testing passed, and `npm audit --omit=dev` reports zero vulnerabilities; and
- the new audit checks cover session versions, employment dates, hierarchy cycles, approver
  eligibility, assets, HR Documents, and the existing cross-table invariants.

This workstation did not have authorized credentials for a running application database. Therefore
the current `db:verify`, `db:audit`, empty-schema migration, task, integration, and reset smoke
checks remain mandatory target-environment acceptance steps; a code-only pass is not represented as
a live-database pass.

The previous 23 July database-backed handover audit successfully applied the then-current 31
migrations to disposable MySQL, audited the then-current 40 tables, and passed the Work Planner,
Employee Integration API, and guarded-reset smoke tests. It is historical evidence, not a
substitute for applying later migrations and rerunning the current audit.

## Storage Layout

MySQL 8.0 contains 58 application tables grouped as follows:

| Domain                | Tables                                                                                                                                                                                                                   | Source-of-truth rule                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Identity and security | `users`, `face_profiles`, `face_verification_sessions`, `face_evidence`, `audit_logs`, `system_settings`, `integration_clients`, `integration_idempotency`, `push_subscriptions`, `announcements`                        | `users` owns authentication; credentials are hashed and face templates/evidence encrypted  |
| Workforce             | `employees`, `employee_change_events`, `departments`, `branches`, `emergency_contacts`, `profile_edit_requests`                                                                                                          | `employees` is the canonical workforce record; `version` enables safe integration updates  |
| Attendance            | `attendance_events`, `attendance_daily_summary`, `attendance_reminders`, `field_attendance`, `attendance_correction_requests`, `employee_branch_schedule`, `biometric_devices`, `biometric_employee_mapping`, `holidays` | Events are immutable inputs; daily summaries are derived and may be recalculated           |
| Leave                 | `leave_types`, `leave_balances`, `leave_requests`, `weekly_off_requests`, `comp_off_credits`                                                                                                                             | Policy, balance, request, and earned-credit records remain separate                        |
| Employee services     | `expense_claims`, `certificate_requests`                                                                                                                                                                                 | Expense and HR-document workflow state is retained with reviewer and completion timestamps |
| Assets                | `asset_catalog_items`, `company_assets` (incl. optional vehicle registration/insurance/fitness), `asset_returns` | Current assignment is on the asset; every completed return is a separate historical row |
| Work Planner          | `task_boards`, `task_stages`, `task_board_roles`, `task_board_members`, `work_tasks`, `task_assignments`, `task_updates`, `task_attachments` | Stage status is canonical for board tasks; assignments and activity are relational history |
| HRMS extensions       | `checklist_*`, dormant `company_documents`/`document_acks`/`sop_*`/`notification_preferences` (plus dormant `roster_assignments`, `overtime_claims`, `appraisal_*`, `recruitment_jobs`, `candidates`) | Active: onboarding checklists + alert prefs; docs/SOP/roster/OT/ATS/appraisals tables retained unused |

The physical table `certificate_requests` keeps its historical name for migration safety. The UI and
documentation call this feature **HR Documents**.

## Relational Protection

- Primary keys are stable string IDs except the ordered employee change-feed `sequence`.
- Unique constraints protect login email, employee code/email/external reference, board-stage name,
  task assignee pairs, employee/date summaries, and integration idempotency keys.
- Foreign keys protect all declared relationships. Intentional cascade deletion is limited to child
  records whose parent lifecycle owns them; historical employee data normally uses deactivation,
  not deletion.
- Application tables use InnoDB so multi-record business changes can be transactional.
- Tables use `utf8mb4` so names and remarks retain full Unicode.
- Task progress and logged minutes have database check constraints in addition to API validation.

## Work Planner v2 Storage Rules

Migration `20260722213000_task_workspace_v2` intentionally deletes only legacy Task data before
installing the redesigned model. It never touches employee, attendance, leave, expense, asset,
branch, department, user, integration, configuration, or audit data.

New guarantees:

- `task_stages.status` is the workflow source of truth. A task cannot silently show one stage and
  store another status.
- `work_tasks.version` provides optimistic concurrency. Stale edits return HTTP 409 instead of
  overwriting a newer update.
- `task_boards.version` provides the same optimistic-concurrency protection for names, access
  policies, stages, archival, and restore. Migration `20260723100000_task_board_versioning` adds the
  non-null counter with a safe default of `1` for existing boards.
- `last_activity_at` supports reliable activity ordering; `archived_at` supports non-destructive
  future archival.
- `task_assignments.assigned_by_user_id` records who assigned the person.
- `task_updates.activity_type` distinguishes comments, status, progress, assignee, and detail
  changes; `metadata` retains structured context.
- A task edit, assignment replacement, version increment, and activity row are written in one
  transaction. Any failure rolls the complete change back.

Create a verified MySQL backup before deploying this migration if legacy Task records must be
retained outside the redesigned application.

## Face Attendance Storage Rules

Migration `20260723180000_face_attendance` is additive and does not rewrite existing employee or
attendance rows. It creates `face_profiles`, `face_verification_sessions`, and `face_evidence`.
Existing normal accounts intentionally have no profile and therefore enter the mandatory
registration gate after deployment. Developer Admin is exempt from face authentication.

- `face_profiles.user_id` is unique, so one login has one current encrypted template.
- Approved normal profiles require approval actor/time from Developer Admin.
- Session nonces are stored only as SHA-256 hashes and can be consumed once.
- `face_evidence.session_id` and `attendance_event_id` are unique.
- Passed attendance evidence requires coordinates, accuracy, and an attendance-event link.
- Active evidence has an encrypted private-file key; expired evidence has `image_key = NULL` and a
  deletion timestamp.
- `descriptor_encrypted` must use the versioned `v1.` AES-GCM envelope.

The evidence cleanup job changes only short-lived image state. It never deletes an attendance event
or approved face template. See
[Face Registration and Verified Attendance](FACE_ATTENDANCE_SECURITY.md).

## Automated Audit

Run from the repository root with the target `DATABASE_URL` already loaded:

```bash
npm run db:audit
```

The command reports per-table row counts and runs the complete current check suite, including:

- all foreign keys and orphan counts;
- unfinished Prisma migrations, storage engine, and Unicode collation;
- employee/account profile and lifecycle synchronization;
- employee and department hierarchy cycles, reporting-manager eligibility, and employment dates;
- non-negative account session versions;
- employee versions, shifts, branch coordinates, and geofence ranges;
- attendance totals, checkout ordering, and paired GPS coordinates;
- face-template encryption, approval metadata, evidence deletion state, the maximum-five active
  image limit per user, check-in evidence linkage, and face-attendance GPS completeness;
- leave date ranges, balance arithmetic, and pending-request approver eligibility;
- expense type/status/required fields, Drive confirmation, and payment timestamp consistency;
- HR-document workflow/link consistency;
- asset assignment, scope, state, and value consistency;
- task assignment eligibility, board access-policy rows, board/stage/status, task and board
  versions, progress, completion, date, and activity ranges;
- credential-related column names to detect accidental plaintext-style storage.

Exit code `0` means no blocking integrity failure. Exit code `1` means at least one blocking check
failed or the database could not be reached. Warnings are printed separately and should be reviewed,
but do not make the command fail.

### Production-safe sequence

```bash
cd /opt/anytime-crew-hub
set -a
source .env
set +a
npm run db:audit
```

Do not paste the JSON report into a public ticket without reviewing table names and counts. The
report never prints passwords, hashes, tokens, API keys, employee names, email addresses, phone
numbers, remarks, or document links.

## Clean-database Validation

The previous Task v2 baseline was validated against a newly initialized disposable MySQL 8
database. Subsequent releases added face-security storage, task-board versioning, and
`20260725110000_security_and_workflow_integrity`. Release acceptance must repeat the clean-database
sequence below and record the current table, foreign-key, and check counts from `db:audit`; do not
copy historical counts into an acceptance report.

The Task smoke test creates and edits a board, adds a custom stage, creates a task, changes its
stage/status, posts an activity, verifies task and board version increments, confirms stale task and
board writes return HTTP 409, verifies stage-configuration task version/activity propagation,
confirms archived boards reject task writes, and verifies archive/restore. The second audit with
those rows also completed with zero failures and zero warnings.

Repeat these steps for a disposable local database:

```powershell
$env:DATABASE_URL = "mysql://root:password@127.0.0.1:3306/anytimediesel_task_validation"
$env:SEED_PASSWORD = "temporary-seed-password"
npm run db:deploy
npm run db:seed
npm run build:backend
$env:TASK_SMOKE_PASSWORD = $env:SEED_PASSWORD
npm run test:tasks
npm run db:audit
```

`test:tasks` refuses a remote host and refuses a database name that does not contain
`task_validation`.

## Future Employee API Integration

Another application must consume `/api/v1/employees` and `/api/v1/employee-changes`; it must not
connect directly to MySQL. This preserves authorization, field filtering, version checks,
idempotency, lifecycle behavior, and auditability.

Integration stability is provided by:

1. stable `employee_id` and optional external reference;
2. a positive per-employee `version` used with update preconditions;
3. a durable, ordered `employee_change_events.sequence` feed;
4. idempotency keys for safe write retries;
5. deactivation instead of history-destroying deletion;
6. synchronized linked `users` and `employees` profile/lifecycle fields;
7. scoped, hashed, expiring, and revocable integration credentials.

Before connecting a consumer, run `npm run db:audit`, complete the checklist in
`EMPLOYEE_DATA_AND_INTEGRATION_API.md`, and validate the contract in
`openapi.employee-v1.yaml`. Never expose password hashes, emergency/medical data, attendance raw
payloads, Drive links, or audit contents unless a new reviewed API scope explicitly requires them.

## Backup and Repair Policy

1. Stop writes or define a maintenance window for a confirmed integrity failure.
2. Create and verify a transaction-consistent MySQL dump.
3. Save the audit JSON privately with the release/incident record.
4. Identify whether the issue came from legacy data, a missing constraint, or an application path.
5. Repair through a reviewed migration or atomic backend operation; never edit rows casually in a
   GUI client.
6. Re-run `npm run db:audit`, affected API smoke tests, and application acceptance tests.
7. Keep the backup until business owners confirm the repaired data.

No audit can promise that future code will never introduce a defect. The combination of constraints,
transactions, version checks, repeatable audits, backups, smoke tests, and API boundaries is the
required prevention and detection system.
