# Attendance Workday Core

**Branch:** `attendance-workday-core`  
**Base:** Shift/Roster Foundation `8f37ec0`  
**Status:** Development only — not for production deploy until accepted.

## Core invariant

**Attendance Workday ≠ calendar date.**

Night / cross-midnight / split punches belong to the logical **workDate** of the schedule that owns them. Midnight (00:00) has no special attendance meaning.

## Model

```
Employee → AttendanceWorkday → AttendanceSession[] → AttendanceEvent (raw evidence)
```

| Entity | Role |
|---|---|
| `AttendanceWorkday` | One row per employee + logical workDate; immutable schedule snapshot at creation |
| `AttendanceSession` | Actual worked interval (OPEN / CLOSED); gaps between sessions are not worked time |
| `AttendanceEvent` | Append-only punch evidence; additive `workdayId` / `sessionId` / `clientEventId` |

Unique: `(employeeId, workDate)`.

## Schedule snapshot

On first Workday creation, `resolveEmployeeShiftForWorkDate` runs and a JSON snapshot is stored:

- source (DAY_OVERRIDE / ROSTER / DEFAULT / NONE)
- explicitNoShift
- shift id/code/name
- expected minutes, grace
- ordered absolute segment timestamps
- ownership window metadata

Historical Workdays do **not** recompute when templates change.

## WorkDate ownership (inclusive bounds)

`resolveWorkDateForPunch(employeeId, punchTimestamp)`:

1. Candidates: IST calendar date of punch, and previous IST calendar date
2. For each candidate with a real schedule, build ownership window:
   - **LEAD** = 120 minutes before first segment start
   - **TRAIL** = 180 minutes after final segment end
   - Inclusive window: `[firstStart - LEAD, finalEnd + TRAIL]`
   - `firstStart - LEAD` inclusive; `firstStart - (LEAD + 1 minute)` outside
   - `finalEnd + TRAIL` inclusive; `finalEnd + (TRAIL + 1 minute)` outside
   - Ownership ONLY — not late / early / payroll policy
3. Prefer schedule window match; if multiple, nearest midpoint; tie → later workDate
4. If no schedule match → unscheduled workday on punch calendar date (still allowed)

**Checkout:** if an OPEN session exists, checkout **always** belongs to that session’s Workday — never re-run calendar ownership.

## Punch ingress map

All real-time IN/OUT punches go through Workday Core atomically:

| Ingress | Path |
|---|---|
| Mobile GPS check-in/out | `recordPunchIn` / `recordPunchOut` (app routes) |
| Thumb / CSV punch | `createAttendanceEvent` → `recordAttendancePunch` |
| HR / approved correction (`MANUAL_CORRECTION`) | `createAttendanceEvent` → `applyCorrectionAttendanceEvent` → reconcile |
| Non-punch (`LEAVE_MARK`, `HOLIDAY_MARK`, …) | Legacy `AttendanceEvent` create only |

`inferThumbEventType` prefers a global open session → `OFFICE_OUT`, else `OFFICE_IN`.

## Punch flows

**Check-in:** auth → eligibility → GPS/face (existing) → location resolve → workDate → get/create Workday → reject if open session → Event + Session OPEN (transaction + employee row lock).

**Check-out:** auth → find OPEN session → Event on same Workday → close Session → worked minutes → Workday cache.

No synthetic OUT. Missing checkout leaves Session OPEN.

## CORRECTION_WORKDAY_SYNC_STRATEGY=A

Corrections do **not** call live `recordPunchIn` / `recordPunchOut` (those 409 on open-session conflicts).

Strategy A:

1. Resolve workDate (open-session Workday wins for OUT; else `resolveWorkDateForPunch`)
2. `getOrCreateAttendanceWorkday`
3. Insert `AttendanceEvent` evidence with `eventSource=MANUAL_CORRECTION` and `workdayId`
4. `reconcileAttendanceWorkday` rebuilds sessions from all punch evidence for that workday
5. Raw event timestamps / types / branches are never mutated by reconcile

`reconcileAttendanceWorkday` is deterministic and idempotent for clean IN/OUT pairs: delete sessions for the workday, clear `sessionId` on events (keep `workdayId`), chronologically re-pair (IN opens; OUT closes if open; orphan OUT / duplicate IN → `NEEDS_REVIEW`).

## Worked minutes

`SUM(CLOSED session durations)`. Open session contributes only to live display.

## Locations

`resolveAttendanceLocation` — any ACTIVE Work Location; outside → `MOBILE_FIELD`.  
Base Office ≠ actual punch location. Check-in and check-out locations may differ.

## Concurrency / idempotency

- `SELECT … FOR UPDATE` on employee row inside punch transaction
- Optional additive `clientEventId` (Android 1.0.15 may omit)
- Same `clientEventId` + same `eventType` + `|eventTime| ≤ 5 min` → idempotent success
- Same id with different type or time skew → 409 “This punch id was already used with different details.”
- Duplicate live check-in → 409 “You're already checked in.”
- Audits: `CHECK_IN`, `CHECK_OUT`, `WORKDAY_CREATED` only (no `SESSION_OPENED` / `SESSION_CLOSED` spam)

## Midnight

Workday Core does **not** auto-close sessions or invent OUT at midnight. Legacy settlement jobs are not wired to destroy open Workday sessions.

## APIs

Additive:

- `GET /attendance/current`
- `GET /attendance/workdays/mine`
- `GET /attendance/workdays/mine/:workDate`
- `GET /attendance/workdays/:employeeId/:workDate`
- `GET /attendance/admin/workdays`

Existing mobile check-in/out response shape preserved for Android 1.0.15.

## Backfill / reconcile (never on boot)

**Neither backfill nor reconcile auto-runs on server start.**

Disposable backfill: `backfillEmployeeAttendanceWorkdays` links legacy events without changing timestamps/branchIds. Ambiguous history → `NEEDS_REVIEW` flags (`MISSING_OUT`, `ORPHAN_OUT`, `DUPLICATE_IN`).

Manual reconcile CLI (ops / migration rehearsal):

```bash
npx tsx scripts/reconcile-attendance-workday.mjs <employeeId> <YYYY-MM-DD>
```

## Explicit NO_SHIFT / unscheduled

Punches are recorded. Snapshot retains `explicitNoShift` / `source=NONE`. Policy (Full/Half/Absent) is **out of scope** for this block.

## Android

`ANDROID_1_0_15_ATTENDANCE_BREAKING_CHANGES=0` — no required new fields for published app.

## Future (not this block)

Missed checkout approval redesign, Full/Half/Absent migration, Leave/Holiday/Weekly Off/Comp Off/OT, face model replacement, payroll.
