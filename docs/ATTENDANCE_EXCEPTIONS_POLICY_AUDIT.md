# Attendance Exceptions & Classification — Policy Audit

**Base:** `fd97a7e93d176f5e344d233e6e024e2f0925d605`  
**Branch:** `attendance-exceptions-policy`  
**Scope:** Development / disposable DB only. No production deploy in this block.

---

## CURRENT BEHAVIOR

### Classification (`AttendanceDailySummary` / calendar day)

| Source | Behavior |
| --- | --- |
| `attendanceResultFromHours` | `≥ 9h` → `FULL_DAY`; any `> 0` → `PENDING` (UI “Present”); else `ABSENT` |
| Engine remapping | After punches, `HALF_DAY` / `ABSENT` are forced back to `PENDING` |
| Late | **Disabled** (`isLateCheckIn` always `false`; summary `isLate` always false) |
| Hours source | Paired IN/OUT on **calendar `eventDate`**; open sessions may count toward status using punch-out deadline as cutoff |
| Docs vs code | `docs/ATTENDANCE_LEAVE_AND_FACE_POLICY.md` still documents **Half Day ≥4h &lt;9h** — **code drifted away** |

### Missing checkout

| Item | Behavior |
| --- | --- |
| Synthetic OUT | **Not** created (settlement clears legacy SYSTEM provisional outs) |
| Deadline | `max(IST calendar day end, shift end, overnight 10:00 next morning)` — **calendar-midnight hybrid** |
| Detection job | `processMissedCheckouts` — latest open IN by employee; reminder tag idempotent |
| Notification | ~after deadline; body says punch-out empty; 2-day correction |
| Grace after shift end | `GRACE_MINUTES=30` used in `shiftWindowBounds.missedCheckOutAt`, but **missed-checkout job uses punch-out deadline without always waiting +30m after shift end alone** |

### Missing check-in

| Item | Behavior |
| --- | --- |
| Job | `processMissedCheckInNotifications` — after shift start + 30m, before shift end; no IN events on calendar date |
| Absent finalization | Daily settlement / `recalculateDailySummary` marks Absent when no punches and not leave/holiday/weekly off |

### Correction window

| Item | Behavior |
| --- | --- |
| Constant | `CORRECTION_WINDOW_DAYS = 2` |
| Deadline | `correctionDeadlineFor(attendanceDate, punchOutDeadline)` = max(punchOutDeadline, startOfDay) + **2 UTC calendar days** |
| Lock | After deadline with open punch → `isLocked`; employee submit blocked; HR-only path |
| Inclusive? | Implementation is **deadline timestamp exclusive after** (`Date.now() > correctionDeadlineAt`) |

### Correction workflow

| Item | Behavior |
| --- | --- |
| Model | `AttendanceCorrectionRequest` — calendar `date`, `punchTime`, `eventType`, `remarks`, `ApprovalStatus` |
| Approver | **Organization unit head chain** via `findLeaveApprover` / `listOrganizationHeadApprovers` — **not** `Employee.managerId` |
| Self-approval | Soft: subject excluded from head list; **no hard block** if HR/self somehow reviews |
| Approve effect | `createAttendanceEvent(MANUAL_CORRECTION)` → `applyCorrectionAttendanceEvent` → reconcile Workday + daily summary |
| Reject | Status only; no evidence change |
| HR | `/attendance/hr-punch-correction` immediate apply |

### Workday core (already shipped)

- `AttendanceWorkday` / `AttendanceSession` / additive Event links
- No midnight auto-close; no synthetic OUT
- Canonical punch ingestion; correction reconcile path exists
- **No** Workday-level exception table or classification fields yet
- Production cutover: 35 open sessions reconciled

### Frontend

- Missed punch: `/attendance/mine?tab=requests` + `MissedPunchRequestPanel`
- Approvals: `/attendance/corrections`
- Workday card/admin views exist but do not yet own exception/result UX

---

## TARGET BEHAVIOR (this block)

Operate on **AttendanceWorkday** (schedule snapshot + sessions + raw events), not calendar midnight.

1. **Exceptions** — canonical `AttendanceException` rows (OPEN → CORRECTION_PENDING → RESOLVED / DISMISSED)
2. **Missing checkout** — after **final scheduled segment end + MISSING_CHECKOUT_THRESHOLD_MINUTES (30)**; Session stays OPEN; no synthetic OUT
3. **Missing check-in** — after first segment start + grace; do not Absent before Workday schedule finished
4. **Classification engine** — single `classifyAttendanceWorkday`:
   - Open session / unresolved missing checkout → `PENDING` / `CORRECTION_REQUIRED` (not Full Day)
   - Closed worked minutes: `&lt;240` Absent; `240–539` Half Day; `≥540` Full Day
   - Gaps and open future time excluded from finalized worked minutes
5. **Late / early** — exceptions only; use snapshot grace; **no salary deduction**
6. **Unscheduled / explicit NO_SHIFT** — `UNSCHEDULED_ATTENDANCE`; do not auto Full Day
7. **Corrections** — evolve existing request model with Workday linkage + correction types; preserve org-head approval chain; **hard block self-approval**
8. **Detector** — Workday-based, idempotent, concurrency-safe
9. **UI** — employee / manager / HR exception surfaces; same canonical result everywhere
10. **Leave / Weekly Off / Holiday** — read-only awareness to avoid wrong Absent; **no redesign**

---

## POLICY VALUES THAT ARE FROZEN

| Key | Value | Notes |
| --- | --- | --- |
| `SYNTHETIC_OUT` | **NO** | Never invent checkout |
| `MIDNIGHT_AUTO_CLOSE` | **NO** | Workday schedule end + threshold |
| `MISSING_CHECKOUT_THRESHOLD_MINUTES` | **30** | Current company grace; named constant / setting |
| `CORRECTION_WINDOW_DAYS` | **2** | Employee window after missed-checkout eligibility |
| `FULL_DAY_WORKED_MINUTES` | **540** | Matches policy doc ≥9h |
| `HALF_DAY_MIN_WORKED_MINUTES` | **240** | Matches policy doc ≥4h (restored vs drifted code) |
| Approver chain | Org unit head (existing attendance correction) | Not Leave redesign; not blind `managerId` switch |
| Android | versionCode 16 / 1.0.15 | Additive APIs only |
| Salary deduction | **NO** | Late/early are flags only |

---

## POLICY VALUES THAT ARE NOT YET APPROVED

| Topic | Status |
| --- | --- |
| Full Day = `worked ≥ shift.expectedMinutes` | **Not** this block — keep fixed 9h threshold; architecture must allow future config |
| Comp Off for unscheduled work | **Not** auto-assigned |
| Leave / Weekly Off / Holiday redesign | **Out of scope** — external categories readable later |
| Broad historical Workday backfill | **Out of scope** |
| Segment-level payroll lateness | Metadata/exception only; no deduction |
| Changing approver from org-head → reporting manager | **Not** without separate acceptance — preserve current org-head attendance chain |
| Correction re-request after reject | Preserve if current UI allows another PENDING submit inside window (no new forbid) |

---

## RESULT PRECEDENCE (target)

1. Unresolved evidence problem (open session past threshold / open exception needing correction) → `PENDING` / `CORRECTION_REQUIRED`
2. Known external day type when **no conflicting attendance evidence policy** (approved leave / holiday / weekly off) — read existing resolvers; do not mutate leave balances
3. Closed session worked-minute bands → Full / Half / Absent
4. Unscheduled punch days → result stays operationally `PENDING` / flagged unscheduled (not silent Full Day)

---

## LEGACY ISOLATION

- Keep `recalculateDailySummary` for Android / history compatibility during transition
- New APIs and Dashboard/Attendance Workday views must consume **Workday classifier**, not reinvent calendar-midnight caps
- Calendar punch-out deadline helpers remain for legacy summary only; detector/classification use Workday `scheduledEndAt` / snapshot segments

---

## AUDIT CONCLUSIONS FOR IMPLEMENTATION

1. Introduce `AttendanceException` + Workday classification columns (additive).
2. Evolve `AttendanceCorrectionRequest` with nullable `workdayId`, `sessionId`, `correctionType` (keep legacy fields for Android/UI compatibility).
3. Implement `classifyAttendanceWorkday` + exception sync + Workday detector job.
4. Restore 4h/9h bands on **closed** Workday minutes (align code with accepted policy doc).
5. Wire recompute after punch, reconcile, correction approve/reject.
6. Harden self-approval denial; keep org-head approver resolution.
7. UI + notifications + DB/E2E coverage per block matrix.
