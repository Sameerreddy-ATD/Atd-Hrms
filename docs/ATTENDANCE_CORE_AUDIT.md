# Attendance Core Audit — CURRENT system

**Branch:** `attendance-workday-core`  
**Base commit:** `8f37ec0` (Shift/Roster Foundation accepted)  
**Audit date:** 2026-08-21  

Production Attendance remains on calendar-date ownership until Workday Core is accepted and deployed separately.

---

## Summary

Punch ownership today is **`AttendanceEvent.eventDate` + night heuristics**, not an Attendance Workday entity. Shift/Roster foundation (`resolveEmployeeShiftForWorkDate`) exists but is **not wired into the punch engine**. No midnight auto-checkout. Android 1.0.15 (versionCode 16) uses Capacitor WebView against the same REST/SSE contracts.

---

## Prisma models

| Model | Role |
|---|---|
| `AttendanceEvent` | Raw punch evidence; keyed by `eventDate` |
| `AttendanceDailySummary` | Per employee+calendar date aggregation |
| `AttendanceCorrectionRequest` | Manual punch corrections |
| `AttendanceReminder` | Missed in/out push idempotency |
| `FieldAttendance` | Legacy unused writer |
| `DeferredPunchReceipt` | Offline punch nonce uniqueness |
| `Branch` / Work Locations | Geofence targets |
| Shift templates / roster / override | Schedule foundation (punch engine still DEFAULT-only) |

**EventType** includes OFFICE/BRANCH/FIELD/CLIENT IN/OUT, BREAK_IN/OUT, MANUAL_ADJUSTMENT, LEAVE/HOLIDAY marks.

---

## Punch flow (mobile)

1. Auth + `attendanceRequired`
2. GPS accuracy check
3. Geofence via ACTIVE branches (`matchingBranch`)
4. Optional deferred ticket + nonce → 409 if duplicate
5. `attendanceDateForEmployee` (calendar + overnight heuristics)
6. Face verification if required
7. Transition rules (409 double IN / checkout without IN)
8. `createAttendanceEvent` → recalculate summary → SSE

Primary routes: `POST /attendance/mobile/check-in`, `POST /attendance/mobile/check-out`.

---

## Calendar / night heuristics

- `NIGHT` + early-morning IST minutes → previous calendar date
- Open overnight IN keeps prior `eventDate` until punch-out deadline
- Checkout after midnight can be forced onto open prior day
- Punch engine does **not** use roster/override/NO_SHIFT resolver

---

## Midnight & settlement

- **No** midnight auto-checkout
- **No** synthetic SYSTEM OUT
- Settlement after 10:00 IST recalculates summaries / missed flags
- Next-day check-in is never blocked by prior open punch

---

## Idempotency / races

- Deferred: unique `captureNonce`
- Live: transition checks only — concurrent double-IN risk under load
- Face session nonce is verification-only

---

## Android 1.0.15 surface

Must keep stable: mobile check-in/out, punch-ticket, stream, my/today, timelines, face, branches/work-locations, legacy `/shifts`.

Target: `ANDROID_1_0_15_ATTENDANCE_BREAKING_CHANGES=0`.

---

## Gaps vs Workday + Session

| Target | Current gap |
|---|---|
| AttendanceWorkday | Missing |
| AttendanceSession | Implicit open IN only |
| Schedule snapshot | Not persisted on day |
| Roster/override ownership | Not in punch path |
| Explicit NO_SHIFT | Not in punch path |
| Multi-session gaps | Not modeled |
| Strong live idempotency | Missing |
| Unified geofence helper | Punch uses inline `matchingBranch` |

---

## Migration risks

Dual-write `eventDate` for compatibility; do not remove summaries/events; do not invent midnight OUT; wire ownership carefully so Android date queries still work.

---

*Read-only audit. Behavior changes belong in Attendance Workday Core implementation.*
