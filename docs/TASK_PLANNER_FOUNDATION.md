# Task Planner Foundation

**Branch:** `task-planner-foundation`  
**Baseline:** `a908cdf` (Leave Foundation production)

## Intent

Evolve the existing Work Planner toward Jira-class information architecture with Plane-class cleanliness and Anytime Workforce branding — without replacing current data or inventing a second status system.

## Additive migration

`20260821200000_task_planner_foundation`

- Work types: `IMPROVEMENT`, `SUBTASK` (existing types preserved)
- `reporter_user_id` on work items (backfilled from creator)
- Stage `status_category` (`TODO` | `IN_PROGRESS` | `DONE`)
- Project `lead_employee_id`
- Member `role` (`PROJECT_ADMIN` | `PROJECT_LEAD` | `MEMBER` | `VIEWER`)

## Backend modules

- `server/src/taskHierarchy.ts` — EPIC / SUBTASK / cycle rules
- `server/src/taskProjectRoles.ts` — role → capability matrix
- `GET /tasks/my-work` — Today / Overdue / In Progress / Waiting / Recently Completed

## Preserved

- Issue keys + sequences (keyPrefix rename does **not** rewrite existing keys)
- Rank / version concurrency
- Access types OPEN / DEPARTMENT_GATED / MEMBER_GATED
- Comments, attachments, soft archive
- Attendance / Leave / Payroll / Employee Master / Assets untouched

## E2E auth

Browser tests use same-origin Vite preview proxy (`/api` → `:4000`). See `docs/TASK_PLANNER_E2E_TOPOLOGY.md`.

## Explicitly not in this block

Workflow engine, sprints, roadmap, labels, watchers, worklogs, dependencies, reports.

