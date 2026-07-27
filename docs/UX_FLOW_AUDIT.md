# UX and Workflow Audit — Employee Management System

**Date:** 26 July 2026  
**Scope:** Live product on `main` / `version-1` (post Document Vault–SOP removal and HR-document validation fixes)  
**Method:** Code-level tester + developer review of routes, menus, role gates, dialogs, and API status transitions  
**Purpose:** Issue register only — **do not treat this as a fix list that was applied**. Use it to prioritize repairs.

---

## How to read this document

| Column | Meaning |
| ------ | ------- |
| **ID** | Stable reference for tracking |
| **Severity** | Critical / High / Medium / Low |
| **Area** | Product area |
| **Where** | Route + primary file |
| **Problem** | What is wrong today |
| **Expected** | Correct behaviour |
| **Flow break** | Where the user journey fails or misleads |
| **Misplaced?** | Yes if a button/link/CTA is in the wrong screen or role |

---

## Executive summary

The app is usable for core attendance and leave for employees with an org head, but several **money and people workflows are broken or half-built**:

1. **Expense HR review UI cannot mark claims PAID** (status options contradict the API).
2. **People maintenance is a dead end** for employees and HR (edit-requests return 501; only Developer Admin has Edit on Employees).
3. **Emergency contact** UI now lives on Profile (P0); employee self-edit still deferred.
4. Field and Branch attendance are in role menus for ops roles (P0); `/attendance/mismatch` was removed.
5. Multiple **redirect stubs** (`/leave/balance`, `/forgot-password`, `/roles`) look like real features but dump the user somewhere else.

Fix Critical/High items before treating the build as company-ready for HR ops and payroll-adjacent expense payment.

---

## Severity counts

| Severity | Count |
| -------- | ----: |
| Critical | 3 |
| High | 12 |
| Medium | 18 |
| Low | 12 |

---

## Critical

| ID | Area | Where | Problem | Expected | Flow break | Misplaced? |
| -- | ---- | ----- | ------- | -------- | ---------- | ---------- |
| C1 | Expenses | `/employee-services` · `src/routes/_app.employee-services.tsx` (`ExpenseActions`, `reviewOptions`) vs `server/src/app.ts` transitions `PENDING→UNPAID\|REJECTED`, `UNPAID→PAID` | Review opens with preset next status, then `reviewOptions` is keyed off that **preset**, not the **current** claim status. For `UNPAID` claims the dialog presets `PAID` but options become `UNPAID` / `REJECTED` — **PAID is missing**. Illegal picks return **409**. | Dialog options = legal next statuses for the **current** row status; default select the recommended next status. | HR cannot complete payment: PENDING → UNPAID → **PAID** stalls at the last step. | Yes — Review control presents wrong status set |
| C2 | People / Profile | `/profile` · `src/routes/_app.profile.tsx`; `POST /profile/edit-requests` in `server/src/app.ts` (~5014) returns **501** | Non–Developer Admin cannot edit profile fields; edit-request API is not implemented. | Either self-edit (allowed fields), or submit edit requests HR can apply. | Employees cannot correct personal data; “request edit” path is a hard stop. | — |
| C3 | People | `/employees` · `src/routes/_app.employees.tsx` (`canEdit = developer_admin` only) | HR has no Edit button. API allows HR a limited PATCH (e.g. reporting manager) but UI never exposes it. | HR can at least set/change reporting manager; Developer Admin keeps full edit. | Org hierarchy / leave approver setup depends on Developer Admin only. | Yes — Edit only under Developer Admin |

---

## High

| ID | Area | Where | Problem | Expected | Flow break | Misplaced? |
| -- | ---- | ----- | ------- | -------- | ---------- | ---------- |
| H1 | Emergency contact | **Done (P0)** — Profile section + HR/Dev Admin write; `/emergency-contact` → `/profile#emergency-contact` | Employee self-edit still deferred (no approval workflow). | Decide direct self-edit vs profile-edit-request. | — | Resolved for view + HR/Dev Admin edit |
| H2 | Attendance | `/attendance/field`, `/attendance/branch` — real pages, **absent from** `src/lib/menu.ts` | Field and branch attendance only reachable by URL (or accidental deep link). | Menu entries for HR/CEO/main_admin (and managers if scoped), or dashboard cards that navigate there. | Field/branch ops workflows are undiscoverable. | Yes — pages exist, navigation missing |
| H3 | Attendance | **Done (P0)** — `/attendance/mismatch` removed (no redirect stub) | Face mismatch remains under Face Security; corrections cover missed punches. | — | — | Resolved |
| H4 | Auth | `/forgot-password` · `src/routes/forgot-password.tsx` | “Need help?” opens static “contact HR” card — no reset form. | Self-serve reset **or** rename link to “Contact admin” and stop implying recovery. | Users believe password reset is broken. | Yes — login CTA implies recovery |
| H5 | Leave medical | `/leave/history` · medical upload cards + `MedicalDocumentActions` | Cards stay after URL upload / verify; due date is not cleared; Save remains the primary action. | Hide or switch to “Submitted / Verified” state after success. | Sick-leave medical flow feels permanently overdue. | — |
| H6 | Leave medical | `/leave/apply` vs History | Apply: Drive URL only. History: file upload + Drive. | Same attach options at apply time. | Employee must apply first, then return to History to upload a file. | Yes — upload control only on History |
| H7 | Leave | Menu **Leave Approvals** for `hr` / `main_admin` / `developer_admin` | Non–org-head admins open Approvals with empty pending leave and no Approve/Reject (`canApprove` false). | Approvals for reporting/org heads; HR use **Leave Tracking** for oversight. | “Approvals” menu looks broken for HR who are not heads. | Yes — menu item for wrong capability |
| H8 | Checklists | `/checklists` item links `/assets`, `/users` | Template link picker includes screens many employees cannot open. | Role-safe link list; hide Open if module denied. | Onboarding “Open” hits module-blocked page. | Yes — links point to admin-only screens |
| H9 | Checklists | Completed instance checkboxes still enabled | Unchecking an item reopens a COMPLETED checklist (API sets OPEN). | Lock items when COMPLETED/CANCELLED unless HR Reopen. | Completed onboarding can be undone accidentally. | — |
| H10 | Employee requests | `/employee-services` CEO view | CEO sees all expenses/documents; **no Review** buttons (`isHr` only). API review is HR/Developer Admin only. | Read-only banner: “HR reviews these requests.” | CEO thinks the queue is stuck. | — |
| H11 | Employee requests | Menu + module matrix | `main_admin` has no Employee Requests menu and no default `EMPLOYEE_REQUESTS` module. | Explicit product decision: grant access or document exclusion. | Main Admin deep-link gets “Module access is disabled”. | Yes — role gap vs CEO/HR |
| H12 | Face / layout | `_app.tsx` face gate | Unapproved face enrollment can replace the whole app shell. `/face-enrollment` is partly redundant. | Clear blocking enroll UX is OK if intentional; ensure help/logout remain reachable. | Users may feel locked out of profile/leave while PENDING. | — |

---

## Medium

| ID | Area | Where | Problem | Expected | Flow break | Misplaced? |
| -- | ---- | ----- | ------- | -------- | ---------- | ---------- |
| M1 | Leave | Apply Info vs History | Copy says track weekly-offs in Leave History; weekly-offs only appear on **Apply**. | List weekly-offs on History **or** fix the Info text. | Users think weekly-off requests disappeared. | Yes — guidance points to wrong screen |
| M2 | Expenses | FIELD claim type | Type selectable; no from/to `claimMeta` inputs; list barely distinguishes FIELD. | Collect field meta; label list as Field claim. | Field claims look like generic expenses. | — |
| M3 | Expenses | HR expense/advance submit | No client-side “select employee” guard (certificates have it). | Same pre-submit check as documents. | Empty employee → late server toast. | — |
| M4 | Leave | Manager menu | Managers approve leave but have no **Leave Tracking** menu entry. | Team leave overview for managers, or document that Approvals History is enough. | Managers cannot browse decided team leave in Tracking. | Yes — missing menu for role |
| M5 | Leave Tracking | Status filter | No Cancelled filter (History has it; API supports CANCELLED). | Add Cancelled. | Cancelled org leave hard to find. | — |
| M6 | Checklists | Mark complete | Force-completes remaining items with no confirm. | Confirm dialog explaining auto-complete. | HR can close incomplete work unknowingly. | — |
| M7 | Dashboard | `src/lib/role-shortcuts.ts` | Shortcuts module is **never imported**; dashboard does not render it. | Wire shortcuts **or** delete/archive the file. | Planned shortcuts never appear; file will drift. | Yes — logic lives in unused module |
| M8 | Attendance | `/attendance/missed-punch` | Not in sidebar; mainly from dashboard Mark Attendance. | Link from My Attendance header too. | Easy to miss if user starts on Mine. | Yes — primary entry only on dashboard |
| M9 | Attendance | `/attendance` index | Orphan overview; reached via payroll redirect; header CTA is **Apply Leave**. | Attendance hub for ops **or** remove/redirect cleanly. | Misleading hub with leave CTA. | Yes — Apply Leave on attendance overview |
| M10 | Attendance | My Attendance header | Primary action **Apply Leave**. | Missed punch / corrections as primary; leave secondary. | Cross-module CTA dominates attendance screen. | Yes |
| M11 | People | Departments menu | Only Developer Admin. | HR/main_admin if they manage org units. | HR cannot open departments from menu. | Yes |
| M12 | People | User Logins | Developer Admin only (includes bulk import). | If HR onboards people, grant scoped access. | HR cannot create logins without Developer Admin. | — |
| M13 | ID card | Menu roles | Omits ceo / main_admin / developer_admin; checklists can still link `/id-card`. | Anyone with employee profile can open ID card from menu. | Checklist Open may work while menu hides ID. | Yes |
| M14 | Devices | `/settings/devices` | Orphan read-only list; overlaps `/devices`. | One devices surface under Company/Settings. | Duplicate/orphan settings path. | Yes |
| M15 | Assets | Roles | `main_admin` not in assets menu/API manage set. | Align with company ops role design. | Main Admin cannot open assets. | — |
| M16 | Announcements | `canManage` | HR + Developer Admin only; CEO cannot post. | Confirm product rule; if CEO should post, add UI+API. | Leadership cannot announce. | — |
| M17 | Reports | `/reports/payroll` | **Removed** with Operations Reports (2026-07-26). | — | — | Resolved |
| M18 | Auth | `/first-login` | No session guard; empty old-password change call if opened cold. | Redirect to login if unauthenticated. | Opaque API errors. | — |

---

## Low

| ID | Area | Where | Problem | Expected | Flow break | Misplaced? |
| -- | ---- | ----- | ------- | -------- | ---------- | ---------- |
| L1 | Dashboard | Pending leave stats | Counts without click-through to Approvals/Tracking. | Make tiles links. | Extra navigation to act. | — |
| L2 | Leave Policies | `/leave/policy` | Credits adjust only; type CRUD APIs unused. | Rename page or expose type editing. | HR expects policy CRUD. | — |
| L3 | Leave | `/leave/balance` | Redirects to History; balances live on Apply/Policy. | Redirect to Apply or a real balance view. | Bookmark lands wrong. | Yes |
| L4 | Leave Apply | Cancel button | Navigates to History (discards via leave). | Reset form or label “Discard & go to history”. | Mild confusion. | — |
| L5 | CEO requests | Empty-state copy | No note that only HR reviews. | Short helper text. | — | — |
| L6 | Checklists | CEO | Can open lists; cannot manage templates (`canManage` excludes CEO). | Confirm intentional. | — | — |
| L7 | Tasks | Board create | Restricted to admin/ceo/hr/manager — OK if intentional. | Document for staff. | — | — |
| L8 | Notifications | Digests | UI admits email digests not enabled. | Keep honest copy until SMTP exists. | — | — |
| L9 | ID card | Emergency contact field | API may return EC; card UI ignores it. | Show when present. | Incomplete card. | — |
| L10 | Holidays/Branches | Deep-link | Few page-level role checks; rely on menu + API. | Optional page guards. | — | — |
| L11 | Roles | `/roles` | Redirects to dashboard. | Remove or build roles UI. | Fake route. | Yes |
| L12 | Company setup | `/company-setup` | Redirects to branches. | Harmless alias; document or remove. | — | — |

---

## Flow maps (where journeys break)

### A. Expense claim payment (broken)

```text
Employee/HR submits claim → status PENDING
HR opens Review → should choose UNPAID or REJECTED
HR opens Review again on UNPAID → should choose PAID
                              ↘ UI options wrong (C1) → 409 / cannot pay
```

**Break point:** Review dialog status list vs server transition table.

### B. HR document request (mostly fixed; remaining gaps)

```text
Employee submits (purpose ≥ 5 chars) → PENDING
HR: In progress → Ready (digital needs https:// link) → Collected
CEO: can view queue → no Review (H10) — confusing but API-correct
HR without employeeId: must pick employee (works after recent fix)
```

**Remaining break points:** CEO confusion (H10); main_admin no access (H11).

### C. Sick leave medical document

```text
Apply Sick Leave → optional Drive URL only (H6)
Return from leave → History shows upload card forever (H5)
HR verifies on Approvals/Tracking → card may still look “due”
```

**Break point:** Post-submit UI state on History; apply vs history attach parity.

### D. Leave approval

```text
Employee applies → PENDING
Org head: Leave Approvals → Approve/Reject  ✓
HR who is not a head: menu still shows Approvals (H7) → empty / no buttons
Manager: can approve but no Leave Tracking menu (M4)
```

**Break point:** Menu capability mismatch.

### E. People data change

```text
Employee Profile → cannot edit → edit-request API 501 (C2)
HR Employees → no Edit button (C3)
Developer Admin → full Edit  ✓
Emergency contact route → Profile with no EC fields (H1)
```

**Break point:** Entire change-request chain unimplemented in UI.

### F. Attendance ops discovery

```text
Dashboard may show field/branch/mismatch style stats
Sidebar: Mine / Day Logs / Corrections only
Field & Branch pages exist without menu (H2)
Mismatch route stubs to Branch (H3)
```

**Break point:** Navigation vs available screens.

---

## Buttons and controls in the wrong place

| Control | Current location | Better location / fix |
| ------- | ---------------- | --------------------- |
| Expense Review status select | Options derived from **preset next** status | Derive from **current** claim status; preset only the default value |
| Medical **file** upload | Leave History only | Also on Leave Apply (Sick Leave) |
| Weekly-off status / cancel | Leave Apply only | Leave History (or fix Info copy) |
| Leave Approvals (sidebar) | Shown to HR/admins who cannot approve | Org heads / reporting managers only; HR → Tracking |
| Apply Leave CTA | Attendance Mine / Attendance overview headers | Keep secondary; put Missed Punch / Corrections first on attendance pages |
| Forgot-password / Need help | Implies self-serve reset | Rename or implement reset |
| Payroll report | Removed with Operations Reports | — |
| Emergency contact | Redirect stub | Profile section or real page |
| Role shortcuts | `role-shortcuts.ts` unused | Dashboard tiles or delete |
| Checklist Open → Assets/Users | Template editor offers admin routes | Employee-safe routes only |
| Mark attendance shortcut (if wired later) | Points at `/dashboard` in unused file | `/attendance/mine` or keep dashboard punch card only |

---

## Stub and redirect inventory (treat as incomplete features)

| Route | Behaviour today | Risk |
| ----- | --------------- | ---- |
| `/emergency-contact` | → `/profile` | High — EC data unused |
| `/attendance/mismatch` | **Removed (P0)** | Was a false feature name |
| `/leave/balance` | → `/leave/history` | Medium — balances not on History |
| `/reports/payroll` | Removed | Resolved |
| `/forgot-password` | Static help card | High — UX expectation |
| `/roles` | → `/dashboard` | Low |
| `/company-setup` | → `/branches` | Low |
| `/users/new` | → `/users?create=true` | OK if query handled |
| Profile edit-requests API | **501** | Critical for people data |

---

## What is working (spot-check baseline)

Use this as a smoke list after fixes; these were **not** found broken in this audit pass:

- Login + first-login password change (when session exists) + crew eye focus behaviour (recent fix).
- Menu no longer lists Document Vault / SOP (after `version-1` deploy).
- Employee HR document **submit** with purpose ≥ 5 chars and optional blank required-by date (recent fix).
- HR document review transitions PENDING → IN_PROGRESS → READY → COLLECTED (with digital URL rule).
- Leave apply / history / policy credit adjust for roles that have menu access.
- Face enrollment gate for roles that require it (strict by design).
- Work Planner board access model (staff consume, managers create — by design).
- Checklists list/filter/progress/HR templates (usable; see H8–H9, M6 for polish bugs).

---

## Suggested fix order (for your next pass)

1. **C1** — Expense review status options (unblocks payment).  
2. **C2 / C3 / H1** — People edit path: **Developer Admin only** for profile/employee edits (confirmed product rule); emergency contact UI still open.  
3. **H2 / H3 / M8 / M9** — Attendance navigation; **branch mismatch retired** (not required).  
4. **H5 / H6 / M1** — Leave medical: **2-day post-leave upload + HR overdue notifications** (shipped).  
5. **H7 / M4** — Leave Approvals / Tracking role menu alignment.  
6. **H8 / H9 / M6** — Checklist completion lock + confirm (shipped).  
7. **H4** — Forgot password request → Developer Admin notification (shipped).  
8. **M7** — Wire or delete `role-shortcuts.ts`.  
9. **H10 / H11 / M3** — Employee Requests role clarity and HR submit guards.

### Shipped in July 2026 ops pass

- Developer Admin–only profile/employee edit messaging
- Branch mismatch dashboard/nav retired
- Forgot-password request flow notifying Developer Admin
- Sick leave medical due window = 2 days + HR overdue notifications
- Checklist: lock completed items; confirm Mark complete; safer template links
- System Settings module access: defaults reset, All/Min per role

---

## Out of scope for this audit

- Load / performance testing  
- Mobile device lab matrix (see `docs/DEVICE_COMPATIBILITY.md`)  
- Security penetration testing (see `docs/WORKFLOW_AND_SECURITY_AUDIT.md`)  
- AWS/RDS/S3 migration (see `docs/AWS_DEPLOYMENT_PATTERNS.md`)  
- Automated Playwright coverage of every role (recommended as a follow-up once Critical/High are fixed)

---

## Document ownership

| Item | Value |
| ---- | ----- |
| File | `docs/UX_FLOW_AUDIT.md` |
| Update when | After each fix batch, mark IDs Done or remove rows |
| Related | `docs/WORKFLOW_AND_SECURITY_AUDIT.md`, `docs/USER_GUIDE.md`, `docs/OPERATIONS_AND_WORKFLOWS.md` |
