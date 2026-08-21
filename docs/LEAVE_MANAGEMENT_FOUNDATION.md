# Leave Management Foundation

**Branch:** `leave-management-foundation`  
**Base:** `db77db0d1de2cc0ec28ac41fe2eb65aaf9372b2e`  
**Audit:** [LEAVE_MANAGEMENT_AUDIT.md](./LEAVE_MANAGEMENT_AUDIT.md)

Development only — **do not deploy** from this document alone.

## Architecture

| Concept | Implementation |
|---------|----------------|
| LeaveType | Existing + policy columns (`halfDayAllowed`, `minNoticeDays`, `maxBalance`, …) |
| LeavePolicy | Configurable fields on `LeaveType` (no disputed numbers frozen as constants) |
| EmployeeLeaveBalance | `LeaveBalance` + `LeaveLedgerEntry` |
| LeaveRequest | Existing (`fromDate`/`toDate`/`days`/`session`) |
| LeaveApprovalHistory | New append-only table |
| Calendar boundary | `server/src/leaveCalendar.ts` |
| Attendance | Workday classifier: no punches → Paid/Unpaid Leave; punches + leave → `LEAVE_ATTENDANCE_CONFLICT` |

Leave does **not** invent `AttendanceEvent` punches or rewrite sessions.

## Status workflow

```
PENDING → MANAGER_APPROVED → APPROVED
PENDING → REJECTED
PENDING → WITHDRAWN | CANCELLED
APPROVED → CANCELLED (future dates via cancelledDates)
```

Legacy `HR_VERIFIED` remains in enum for compatibility; not written by current routes.

## Approval rule

1. Self-approval **blocked** for every role (including HR/CEO/admin).
2. Org heads via Organization Foundation chain.
3. HR / MAIN_ADMIN / DEVELOPER_ADMIN may finalize → `APPROVED`.
4. Rejection **requires** `decisionNote` (≥ 3 chars).
5. Every transition writes `LeaveApprovalHistory`.

## Calendar policy (configurable)

SystemSettings:

| Key | Production-compatible default | Meaning |
|-----|-------------------------------|---------|
| `leave.holidayConsumesBalance` | `true` | Holiday days count toward leave balance |
| `leave.weeklyOffConsumesBalance` | `false` | Weekly offs are skipped (do not consume) |

`POLICY_CONFIRMATION_REQUIRED=YES` — HR must confirm before changing defaults.

Split-shift half-day: **blocked** until HR defines First/Second Half → segment mapping.

Comp Off earn/expiry: **CONFIG_REQUIRED** (do not invent rules).


## Android 1.0.15

Additive APIs only (`/leave/preview-days`, `/leave/requests/:id/withdraw`, `/leave/requests/:id/history`, policy fields).  
Existing apply / approve / cancel payloads unchanged.

`ANDROID_1_0_15_LEAVE_BREAKING_CHANGES=0`

## Migration

`prisma/migrations/20260821190000_leave_management_foundation/`

## Non-goals

Task Planner · Payroll · Employee Master · Assets · Production deploy · Full Weekly Off / Holiday redesign
