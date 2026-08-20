# Organization Structure (Module 1)

AnyTime Diesel Workforce treats the legacy Prisma `Department` table as an **Organization Unit** at the product level. Internal APIs may still use `/departments` for backward compatibility; organization management endpoints live under `/organization/*`.

## Critical separation: organization unit ≠ application role

| Concept | Storage | Purpose |
|--------|---------|---------|
| **Organization Unit** | `Department` / `Employee.departmentId` | Where someone belongs in the hierarchy |
| **Application Role** | `User.role` | What the login may do (CEO, HR, EMPLOYEE, …) |

These must **never** be inferred from each other at authorization time.

### New account rules (Module 1 hardened)

- **No organization unit does NOT imply CEO.** Missing unit defaults application role to **EMPLOYEE** unless an authorized creator explicitly selects another role.
- **CEO** requires explicit `role: CEO` and must **not** be tied to an organization unit.
- **HR / DRIVER / SALES / CHIEF_OF_STAFF** are never granted from unit name, unit code, or unit path.
- The create-login UI may **suggest** a role from the selected unit for convenience; the server only honors **explicit `role`** on the API.
- Bulk import includes an **Application Role** column; blank defaults to Team Member (`EMPLOYEE`).
- **Existing `User.role` values are never changed** by the Module 1 migration.

## CEO compatibility

- CEO may have `Employee.departmentId = null` with **no** synthetic organization assignment.
- UI shows CEO as company-wide above Chief of Staff — not as an ordinary unit member.

## Stable unit codes

`Department.unitCode` — uppercase snake case, unique, never auto-changed on rename. Display `name` is user-facing only.

Production baseline codes include: `CHIEF_OF_STAFF`, `OPERATIONS`, `FLEET_DRIVER`, `HR`, `INSIDE_SALES`, etc. (see migration SQL name map).

## Historical assignments

### Effective dates

- `effectiveFrom` **inclusive**
- `effectiveTo` **exclusive**

Active on date D when: `effectiveFrom <= D AND (effectiveTo IS NULL OR effectiveTo > D)`

### Head assignments

Canonical source. `Department.headEmployeeId` is a **compatibility cache** synced from the active primary head. When the primary ends, the next active head is promoted to primary deterministically (lowest sort order / first active).

### Viewer assignments

View-only access to unit + descendants. **Not** approvers. **Not** structure editors.

### Employee organization assignments

Canonical history. `Employee.departmentId` and `Employee.organizationLevel` are **snapshots** synced from today's active primary assignment.

## Employee transfer

`POST /organization/employees/transfer`

- Transactional: closes prior primary, opens new row, updates snapshot when effective **today or past**.
- **Future-effective transfers are rejected in Module 1** (schema supports history; snapshot would be misleading).
- Target unit must be **active**.

## Active / inactive units

- Selectors for new assignment, head, viewer, transfer destination: **active units only** (`GET /departments?activeOnly=true`).
- Organization Structure admin tree shows inactive units with label; history still resolves inactive units by id.

## Approval resolver

`resolveOrganizationApprovers(employeeId, date?)` — walks up from employee's primary unit to find active heads. **Not wired** to Leave/Attendance in Module 1.

## Authorization matrix

| Action | Developer Admin | Others |
|--------|-----------------|--------|
| Structure writes | ✓ | ✗ |
| View tree / details | People-directory scope | Scoped read |
| Employee transfer | HR / Main Admin / Dev Admin | ✗ |

## Migration (`20260820120000_organization_structure_foundation`)

Backfill rules:

1. `unit_code` from known production names; fallback snake_case; dedupe suffix
2. Heads/viewers: `effectiveFrom = DATE(created_at)`, active, primary from sort_order
3. Employee org: one row per `employees.department_id`; `effectiveFrom = joining_date ?? created_at ?? today`
4. **No `users.role` changes**

Rehearsal: `bash scripts/org-migration-rehearsal.sh` (disposable MySQL 8 on port **3308**).

MySQL note: head-primary backfill uses a derived-table UPDATE (avoids MySQL 1093 self-reference error).

## API surface

- `GET /departments?activeOnly=true` — extended DTO with counts, codes, active flag
- `GET /organization/tree`
- Unit heads/viewers CRUD + history
- `GET /organization/employees/:id/assignments`
- `POST /organization/employees/transfer`
- `GET /organization/approvers/preview`

## UI

Route `/departments` — **Organization Structure**. Desktop org chart + mobile vertical hierarchy. Unit detail sheet: overview, heads, viewers, employees, transfer, history.

## Future modules

Wire approver resolver into Leave / Weekly Off / Attendance Correction without changing their policy rules.
