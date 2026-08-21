# Task Planner Foundation — Current Implementation Audit

**Baseline production SHA:** `a908cdf9417a03d96149296b3004a5e0b6bdfa9f`  
**Branch:** `task-planner-foundation`  
**Date:** 2026-08-21  

**Product direction:** Evolve existing Work Planner (Jira-class IA + Plane-class cleanliness + Anytime Workforce branding). Do **not** replace, do **not** copy Plane/Jira pixels.

---

## Status legend

| Tag | Meaning |
| --- | --- |
| **WORKING** | End-to-end usable and data-safe |
| **PARTIAL** | Exists but incomplete, fragile, or UX-limited |
| **BROKEN** | Incorrect or unsafe for intended use |
| **MISSING** | Required for foundation target; not present |
| **LEGACY_COMPATIBILITY** | Must keep for existing data / clients |
| **DATA_MIGRATION_RISKS** | Apply migrations carefully; additive preferred |

---

## 1. Frontend

| Area | Paths | Status | Notes |
| --- | --- | --- | --- |
| Work Planner route / nav | `src/routes/_app.tasks.tsx`, `src/lib/menu.ts` (“Work Planner”), module `TASKS` | **WORKING** | Single `/tasks` SPA; board/issue selection is React state (no deep URL) |
| Projects / Boards list | `src/components/tasks/BoardDirectory.tsx` | **WORKING** | Active + archived; create/archive/restore |
| Board (kanban) | `BoardWorkspace.tsx` → `KanbanView` | **WORKING** | Stage columns; rank + stage move |
| Backlog / List | `BacklogView` | **WORKING** | Stage-grouped list |
| Timeline | `TimelineView` | **WORKING** | Dated bars + undated; pointer reschedule |
| Issue detail | `TaskDetailDialog.tsx` (Sheet) | **WORKING** | Description, fields, assignees, activity, archive |
| Issue create / edit | `TaskFormDialog.tsx`, detail inline edit | **WORKING** | Versioned PATCH; 409 conflict toast |
| Subtasks | Detail + `parentTaskId` | **WORKING** | Same-board; nesting allowed today (foundation will tighten SUBTASK rules) |
| Drag / drop | Kanban HTML5 `draggable`; timeline pointer | **PARTIAL** | Touch kanban unreliable |
| Filters | Client filters in `BoardWorkspace` | **WORKING** | Over loaded board set (`limit: 1000`); not server-paged |
| Comments / activity | `TaskUpdate` via `tasksApi.addLog` | **WORKING** | Last 20; `@code` mentions |
| Attachments | Upload + list in detail | **PARTIAL** | Upload works; **download UI MISSING**; **delete MISSING** |
| Project settings | `BoardFormDialog.tsx` | **WORKING** | Name, keyPrefix, access, stages, members/depts, custom field defs |
| Archive / restore | Boards + issues soft archive | **WORKING** | No hard delete in normal UI |
| Mobile | Responsive classes across task components | **PARTIAL** | Sheet detail OK; kanban DnD poor on touch |
| Terminology (Project / Work Item) | UI still says board/task heavily | **PARTIAL** / foundation target |
| My Work hub | Assigned preview in directory only | **PARTIAL** | Not Today/Overdue/In Progress sections |
| All Work table | — | **MISSING** | No canonical project table (Key, Type, Status, Reporter, …) |
| Project IA (Summary / Planning / Settings nav) | Flat workspace tabs | **PARTIAL** | Needs restructure without losing Board/Backlog/Timeline |
| Deep links | `/tasks` only | **MISSING** | Notifications cannot open specific issue |

---

## 2. Backend

| Area | Paths | Status | Notes |
| --- | --- | --- | --- |
| Task routes | `server/src/app.ts` (`/tasks*`) | **WORKING** | List/get/create/patch/logs |
| Board / project routes | `server/src/app.ts` (`/task-boards*`) | **WORKING** | CRUD + archive via versioned PATCH |
| Attachments / archive | `server/src/hrms-extensions.ts` | **WORKING** | Upload, download, soft archive |
| Permissions | `server/src/taskBoardAccess.ts` | **WORKING** | `OPEN` / `DEPARTMENT_GATED` / `MEMBER_GATED` |
| Project roles (ADMIN/LEAD/MEMBER/VIEWER) | — | **MISSING** | Creator-or-admin for settings; no capability matrix |
| Ranking | `server/src/taskIssueKeys.ts` | **WORKING** | Midpoint + rebalance |
| Version conflict | `WorkTask.version`, `TaskBoard.version` → HTTP 409 | **WORKING** | Must not weaken |
| Issue keys | `allocateIssueKey` | **WORKING** | Immutable `issueKey`; `nextIssueNumber` |
| Hierarchy validation | Parent same-board + cycle depth | **PARTIAL** | No EPIC/SUBTASK type rules yet |
| Reporter | — | **MISSING** | Only `createdByUserId` |
| Comments / activity | `TaskUpdate` | **WORKING** | |
| Custom fields | Board defs + task JSON | **PARTIAL** | Select options not modeled |
| Module gate | `server/src/module-access.ts` → `TASKS` | **WORKING** | |

### Endpoints (summary)

| Method | Path | Status |
| --- | --- | --- |
| GET/POST | `/task-boards` | WORKING |
| PATCH | `/task-boards/:id` | WORKING (settings or archive) |
| GET | `/tasks`, `/tasks/:id` | WORKING |
| POST/PATCH | `/tasks`, `/tasks/:id` | WORKING |
| POST | `/tasks/:id/logs` | WORKING |
| POST | `/tasks/:id/archive` | WORKING |
| GET/POST | `/tasks/:id/attachments` | WORKING |
| GET | `…/attachments/:id/download` | WORKING (UI not wired) |
| DELETE | attachment | **MISSING** |

---

## 3. Prisma

### Enums

- `TaskStatus`: `TODO`, `IN_PROGRESS`, `BLOCKED`, `REVIEW`, `COMPLETED`, `CANCELLED`
- `TaskPriority`: `LOW`, `MEDIUM`, `HIGH`, `URGENT`
- `TaskIssueType`: `TASK`, `BUG`, `STORY`, `EPIC` — **MISSING:** `IMPROVEMENT`, `SUBTASK`
- `TaskActivityType`: `CREATED`, `COMMENT`, `STATUS_CHANGED`, `PROGRESS_UPDATED`, `ASSIGNEES_CHANGED`, `DETAILS_UPDATED`
- `TaskBoardAccessType`: `OPEN`, `DEPARTMENT_GATED`, `MEMBER_GATED`

### Models (preserve)

| Model | Table | Key fields to preserve |
| --- | --- | --- |
| `WorkTask` | `work_tasks` | `taskId`, `parentTaskId`, `boardId`, `stageId`, `issueNumber`, `issueKey`, `issueType`, `rank`, `status`, `priority`, `progress`, `version`, `createdByUserId`, dates, `archivedAt`, `customFields` |
| `TaskBoard` | `task_boards` | `boardId`, `name`, `keyPrefix`, `nextIssueNumber`, `accessType`, `archived`, `version`, `customFieldDefs`, `createdByUserId` |
| `TaskStage` | `task_stages` | `name`, `color`, `sortOrder`, `isCompleted`, `status` |
| `TaskAssignment` | `task_assignments` | multi-assignee |
| `TaskUpdate` | `task_updates` | activity / comments |
| `TaskAttachment` | `task_attachments` | files |
| `TaskBoardMember` / `TaskBoardDepartment` | access | |

**Status category (`TODO` / `IN_PROGRESS` / `DONE`)** as first-class stage metadata: **MISSING** (stage `status` exists but not normalized category for reporting/My Work).

---

## 4. LEGACY_COMPATIBILITY

1. Internal names `TaskBoard` / `TaskStage` / `WorkTask` stay in DB/API DTOs during foundation; UI terminology moves to Project / Status / Work Item.
2. Existing `issueKey` values (e.g. `AWF-1`) are immutable; renaming project or changing `keyPrefix` must **not** rewrite old keys.
3. `ROLE_GATED` already removed (`20260817140000`); docs still mention it in places — doc drift only.
4. Nullable `boardId` / board-less tasks use org-team visibility — preserve.
5. Module key `TASKS` and route `/tasks` remain.
6. Android 1.0.15 does not depend on new planner surfaces — **no breaking API removals**.

---

## 5. DATA_MIGRATION_RISKS

| Risk | Mitigation |
| --- | --- |
| Historic `20260722213000_task_workspace_v2` wiped pre-v2 task rows once | Already applied in prod; **do not re-run/reset** |
| Key/sequence corruption | Never decrement `nextIssueNumber`; never reuse numbers |
| Soft archive vs hard delete | Keep soft archive; no cascade wipe of history |
| Attachment files on disk | DB cascade ≠ disk cleanup; leave files on archive |
| Additive foundation migration | New enums/columns/tables only; no Attendance/Leave/Employee/Assets touch |
| Orphan / concurrent key allocation | Keep `FOR UPDATE` / transactional allocate |

**Must preserve counts:** projects, work items, issue keys/numbers, stages, assignments, updates, attachments, archive flags, ranks, versions.

---

## 6. Foundation gap summary (this block)

| Capability | Gap |
| --- | --- |
| Work types | Add `IMPROVEMENT`, `SUBTASK` without breaking existing |
| Hierarchy rules | Server-side EPIC / SUBTASK / cycle validation |
| Reporter | Explicit reporter ≠ creator |
| Project roles / capabilities | PROJECT_ADMIN / LEAD / MEMBER / VIEWER + capability checks |
| Status category | Map stages → TODO / IN_PROGRESS / DONE (prep for workflow block) |
| My Work | Employee-centric sections |
| Project nav IA | Summary / Planning / Settings |
| All Work | Canonical filtered table |
| Terminology | UI copy toward Project / Work Item / Status / Work Type |

**Out of scope (next blocks):** Workflow engine, Sprints, Epic roadmap, labels, watchers, worklogs, dependencies, saved views, reports.

---

## 7. Audit verdict

| Dimension | Result |
| --- | --- |
| Core planner usable in production | **WORKING** |
| Data model fit for evolution | **WORKING** (additive) |
| Ready for foundation without rebuild | **YES** |
| Audit complete — coding may begin | **PASS** |
