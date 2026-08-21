# Leave Management Audit

**Base production SHA:** `db77db0d1de2cc0ec28ac41fe2eb65aaf9372b2e`  
**Branch:** `leave-management-foundation`  
**Audit date:** 2026-08-21  
**Scope:** Read-only inspection of Prisma, backend, frontend, and attendance integration before Leave foundation work.

---

## CURRENT IMPLEMENTATION

### Prisma models

| Model | Purpose |
|-------|---------|
| `LeaveType` | System + custom types (`code` unique). Policy-ish columns: `paid`, `active`, `annualAllowance`, `monthlyCredit`, `maxPerMonth`, `carryForward`, `requiresMedicalDocument`, `approvalRequired` |
| `LeaveBalance` | Snapshot per employee×type: `entitled`, `used`, `balance`, `manualAdjustment`, `calculationYear` |
| `LeaveLedgerEntry` | Auditable ledger: `ACCRUAL`, `USAGE`, `ADJUSTMENT`, `CARRY_FORWARD`, `EXPIRY`, `REVERSAL`, `REVOKE` |
| `LeaveRequest` | Request with `fromDate`/`toDate`, `days`, `session` (`FULL`/`FIRST_HALF`/`SECOND_HALF`), `status`, medical fields, `cancelledDates` JSON |
| `WeeklyOffRequest` | Selectable weekly-off requests |
| `CompOffCredit` | Earned Comp Off credits linked optionally to holiday / leave request |
| `Holiday` | Company-wide holiday calendar |

**No separate `LeavePolicy` model.** Policy is split between `LeaveType` columns and hardcoded rules in `server/src/leavePolicy.ts`.

**No `LeaveApprovalHistory` model.** Approver identity is sparse (`managerId`, `reviewedByUserId`, `hrVerifiedBy`) without transition ledger.

### Enums

```
LeaveStatus: PENDING | MANAGER_APPROVED | HR_VERIFIED | APPROVED | REJECTED | CANCELLED
LeaveSession: FULL | FIRST_HALF | SECOND_HALF
LeaveLedgerEntryType: ACCRUAL | USAGE | ADJUSTMENT | CARRY_FORWARD | EXPIRY | REVERSAL | REVOKE
WeeklyOffPolicy: SUNDAY_FIXED | SELECTABLE
```

Missing vs target workflow: `DRAFT`, `WITHDRAWN`.  
`HR_VERIFIED` exists in enum/filters but is **never written** by leave routes.

### Backend surface

| Area | Location |
|------|----------|
| Policy / balances / validation | `server/src/leavePolicy.ts` |
| Medical reminder jobs | `server/src/leaveJobs.ts` |
| HTTP routes | `server/src/app.ts` (`/leave/*`, `/weekly-offs`, `/holidays`) |
| Attendance no-event leave | `server/src/attendanceDayRules.ts` (`findApprovedLeaveForDay`, `resolveNoEventStatus`) |
| Punch cancels full-day leave | `server/src/attendanceEngine.ts`, `app.ts` check-in |
| Workday classification leave | `server/src/attendanceClassification.ts` maps Paid/Unpaid Leave when no sessions |
| Settlement schedule | `server/src/attendanceSettlement.ts` (month-end accrual, year-end expiry, medical) |

### Frontend surfaces

| Route | Role |
|-------|------|
| `/leave/apply` | Employee apply + weekly-off |
| `/leave/history` | Own history / cancel / medical upload |
| `/leave/balance` | Own balances + Comp Off ledger |
| `/leave/approvals` | Manager / people-ops approvals |
| `/leave/reports` | HR Tracking |
| `/leave/policy` | HR leave types + credit adjust |
| `/holidays` | Holiday calendar |

API client: `leaveApi` in `src/services/api/index.ts`.  
Day math also computed client-side in `src/lib/leave-allocation.ts` (must match server).

### System leave type codes (seeded)

`CASUAL`, `SICK`, `LOP`, `COMP_OFF` — protected from hard delete (deactivate only).

---

## CURRENT WORKING FEATURES

1. Create / list leave requests with FULL / FIRST_HALF / SECOND_HALF.
2. Multi-type split apply (`/leave/requests/split`) with Casual → Comp Off → LOP allocation.
3. Balance sync with pending reservation (pending counts as used).
4. Casual accrual by joining date + month-end job; ledger `ACCRUAL`.
5. Sick annual entitlement + max-per-month check.
6. Comp Off earn (≥9h on holiday), consume, expire Dec 31, revoke.
7. Org-head approval → `MANAGER_APPROVED`; HR/admin → `APPROVED`.
8. Employee cancel (pending full cancel; approved future dates via `cancelledDates`).
9. Medical document upload, 48h due, reminders, HR verify.
10. Weekly off requests (selectable policy) + Sunday-fixed employee policy.
11. Company holidays CRUD.
12. Leave reports / CSV (HR).
13. Manual balance adjustment (HR).
14. Notifications: submit → reviewers; approve/reject → employee.
15. Attendance: no punches + approved leave → Paid/Unpaid Leave (legacy daily summary + Workday classifier).
16. Full-day leave + punch → cancel leave day (with confirm path).
17. Android 1.0.15 uses same web APIs (Capacitor); no native leave client.

---

## BROKEN / MISSING FEATURES

| Gap | Detail |
|-----|--------|
| No `LeavePolicy` entity | Policy numbers live in code defaults + `LeaveType` columns; admin UI cannot edit most policy fields |
| No approval history table | Cannot prove SUBMITTED → APPROVED → … transitions with notes per step |
| No `WITHDRAWN` / `DRAFT` | Withdrawal is effectively cancel; no distinct withdrawn state |
| `HR_VERIFIED` dead | Never set by API |
| Self-approval possible for people-ops | HR/CEO/MAIN_ADMIN/CHIEF_OF_STAFF can approve own leave via role bypass |
| Holidays count as leave days | `skippedWeekOffDateKeys` skips week-offs only — holidays still consume balance |
| Half-day → full Workday leave | Classification ignores `session`; whole day marked Paid/Unpaid Leave |
| Partial Comp Off cancel releases all credits | Cancel path always `releaseCompOffCredits` |
| Medical not blocking at apply | `requiresMedicalDocument` does not force upload at submit |
| Custom leave types | No automatic accrual path; entitled stays 0 unless manual adjust |
| Policy admin UI incomplete | Create name+paid + toggle active only |
| Frontend day math ≠ holidays | Client skips week-offs only; may disagree with future holiday rules |
| Attendance + Leave conflict | Punches cancel full leave; no durable “both preserved + conflict” Workday state |
| Comp Off policy unconfirmed | 9h earn / Dec 31 expiry hardcoded |
| Weekly Off redesign | Boundary exists; not unified Leave calendar service |
| Target statuses | DRAFT / WITHDRAWN not present |

---

## LEGACY COMPATIBILITY

### Preserve for Android 1.0.15

Existing endpoints and payloads must keep working:

- `GET/POST /leave/types`, `GET /leave/balances/me`, `GET/POST /leave/requests`, `POST /leave/requests/split`
- `POST .../approve|reject|cancel`
- `session`: `FULL` | `FIRST_HALF` | `SECOND_HALF`
- `status` values already returned to clients
- Medical and weekly-off endpoints

**Rule:** additive schema/API only. Do not rename existing fields or require new request fields.

**Target:** `ANDROID_1_0_15_LEAVE_BREAKING_CHANGES=0`

### AttendanceEvents / Sessions

Leave must **not** invent punches or rewrite `AttendanceEvent` / `AttendanceSession` rows.  
Workday classification may set `PAID_LEAVE` / `UNPAID_LEAVE` / future conflict flags only.

---

## POLICY VALUES CURRENTLY HARDCODED

| Value | Source |
|-------|--------|
| Casual ≤12 new credits / calendar year | `leavePolicy.ts` `cappedCreditsByYear` |
| Join-day cutoff = 5th of month | `casualLeaveCreditsEarned` |
| Casual monthly credit default = 1 | `monthlyCredit ?? 1` |
| Sick annual default = 6 | `annualAllowance ?? 6` |
| Sick max / month default = 2 | `maxPerMonth ?? 2` |
| Comp Off full-day only | validation |
| Comp Off expire Dec 31 earn year | validation + year-end job |
| Comp Off earn ≥ 9 worked hours on holiday | `attendanceEngine.ts` |
| Medical due = return + 48h | `medicalDocumentDueAt48h` |
| Reminders 24h / 2h before due | `leaveJobs.ts` |
| Non-Sick advance notice = 1 day; Sick same-day OK | `validateLeaveApplication` |
| Weekly off 1-day advance (non-Sunday) | `app.ts` |
| One weekly off per Mon–Sun week | unique constraint |

Seeded `LeaveType` rows encode Casual 12 / Sick 6 / medical / carry-forward flags in DB.

---

## POLICY VALUES NOT CONFIRMED

`POLICY_CONFIRMATION_REQUIRED=YES` for:

1. Whether org-head `MANAGER_APPROVED` is final for attendance (today: yes) vs mandatory HR second step.
2. Whether leave on public holidays should be free / blocked / still consume balance.
3. Half-day attendance semantics vs Workday (AM leave + PM work).
4. Sick → LOP auto-convert if medical overdue (today: reminders only).
5. Comp Off earn threshold (4h / 9h), expiry, and carry rules.
6. Casual carry-forward cap (docs imply unlimited carry; accrual caps new credits at 12).
7. Whether people-ops must be blocked from self-approval (product: yes — must fix).
8. Half-day on split/night shifts mapping (undefined → should block ambiguous cases).
9. Leave on explicit `NO_SHIFT` WorkDate (consume vs reject).

**Do not invent HR policy.** Prefer configurable fields with documented defaults matching current production behavior until HR confirms.

---

## TARGET ARCHITECTURE (for foundation work)

Evolve existing models; do not greenfield-replace.

1. **LeaveType** — keep; extend with explicit policy columns (or linked `LeavePolicy` 1:1).
2. **LeavePolicy** — configurable accrual/notice/half-day/carry/max/backdate/docs without disputed freezes.
3. **EmployeeLeaveBalance** — keep `LeaveBalance` + strengthen ledger as source of truth.
4. **LeaveRequest** — keep; add withdrawal; preserve Android fields.
5. **LeaveApprovalHistory** — new append-only transition log.
6. **Calendar service boundary** — `leaveCalendar.ts` for week-off / holiday / NO_SHIFT plugs (no full redesign yet).
7. **AttendanceWorkday** — approved leave → not ordinary Absent; punch+leave → conflict retained, no synthetic OUT.
8. **Comp Off** — keep as Leave Type; mark earning/expiry policy as `CONFIG_REQUIRED`.

---

## APPROVAL RULE (as implemented today)

1. Resolve organization head chain via `listOrganizationHeadApprovers` (employee’s unit upward; exclude self from head list).
2. Org head may approve → `MANAGER_APPROVED` (attendance-effective).
3. HR / MAIN_ADMIN / DEVELOPER_ADMIN / CEO / CHIEF_OF_STAFF may approve → `APPROVED`.
4. Multiple heads: current code uses head list / first applicable — **must document and align with Organization Foundation multi-head rules** during foundation work (no silent arbitrary first row without documenting).
5. Comp Off always requires approval even if type `approvalRequired=false`.

---

## ANDROID CONTRACT NOTES

- No native leave module; WebView calls same REST paths.
- Do not add required body fields to existing endpoints.
- Optional additive response fields are OK.
- Keep `LeaveSession` enum string values stable.

---

## FOUNDATION WORK PRIORITIES (post-audit)

1. Add `LeaveApprovalHistory` + write on every transition.
2. Block self-approval for all roles.
3. Add configurable policy fields on `LeaveType` / policy module without freezing unconfirmed numbers.
4. Add `WITHDRAWN` carefully (map withdrawal of PENDING).
5. Calendar service boundaries (holiday/week-off/NO_SHIFT).
6. AttendanceWorkday: approved leave without punches ≠ Absent; leave+punches conflict flag.
7. Server-authoritative day calculation API used by UI.
8. DB integration + authenticated E2E + Attendance×Leave E2E.
9. Preserve all legacy leave APIs.

---

## EXPLICIT NON-GOALS (this branch)

- Task Planner
- Payroll
- Employee Master redesign
- Assets redesign
- Full Weekly Off redesign
- Full Comp Off policy redesign (until HR confirms)
- Production deploy / production migration
