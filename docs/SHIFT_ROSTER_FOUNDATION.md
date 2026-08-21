# Shift & Roster Foundation

Development foundation for Attendance rebuild. **Does not** implement Attendance Workday, midnight auto-checkout, Leave, or Task Planner.

## Concepts

### ShiftTemplate (`shift_definitions`)

Canonical catalog row (legacy table preserved). Fields include code, name, timezone (`Asia/Kolkata` default), grace in/out, derived `expectedWorkMinutes`, and legacy `startMinutes` / `endMinutes` / `shiftType` snapshots for Android and existing attendance policy.

### ShiftSegment (`shift_segments`)

Ordered work windows:

| Field | Meaning |
|---|---|
| `startMinute` | Minutes from local midnight |
| `endMinute` | Minutes from local midnight |
| `endDayOffset` | `0` = same Work Date calendar day, `1` = next calendar day |

Examples:

- **Same day:** 09:00–18:00 → `540 / 1080 / 0`
- **Cross-midnight:** 22:00–03:00 → `1320 / 180 / 1`
- **Split:** 09:00–13:00 + 17:00–21:00 (gaps allowed; not counted as work)
- **Hybrid:** 09:00–10:00 + 22:00–03:00 next day — both belong to the same `workDate`

Expected duration = sum of segment durations (gaps excluded).

### Work Date

A night shift starting 22:00 on 21 Aug ending 03:00 on 22 Aug belongs entirely to **workDate = 21 Aug**.

Midnight has **no special semantic** in the template model. Segments may cross it via `endDayOffset=1`. This module does **not** add midnight auto-checkout.

## Resolution priority

```
DAY_OVERRIDE > ROSTER > EMPLOYEE_DEFAULT (source=DEFAULT) > COMPANY_DEFAULT > NONE
```

- Explicit `NO_SHIFT` on DAY_OVERRIDE or ROSTER **stops** resolution (no fall-through to employee or company default).
- **Company default** is configured by SystemSetting `attendance.defaultShiftId` (not by shift name lookup).
- Canonical company default: **General Shift** (`shift-morning-0930`) 09:30–18:30 Asia/Kolkata, 540 expected minutes.
- Company default applies only when creating/resolving a **new** Workday. Existing `AttendanceWorkday` schedule snapshots are immutable.

API: `GET /employees/:id/resolved-shift?workDate=YYYY-MM-DD`

Source `NONE` means no silent General Shift assignment.

## Assignments

| Kind | Storage |
|---|---|
| Default (effective-dated history) | `employee_shift_assignments` (`assignmentType=DEFAULT`) |
| Roster (date) | `roster_assignments.shift_id` (+ legacy `shift_preset`) |
| Day override | `employee_shift_day_overrides` |

Employee profile `shiftType` / `shiftStartMinutes` / `shiftEndMinutes` remain a **compatibility snapshot** synced on default assignment.

## Permissions

| Action | Roles |
|---|---|
| Template / roster / override writes | Developer Admin, HR, Main Admin |
| Read templates / roster / resolved | Authenticated (employee access rules for resolved) |

Organization Head is **not** automatically a shift administrator.

## Legacy compatibility

- Keep `GET/POST /shifts` and employee shift-assignment endpoints.
- Preserve `shift_id` primary keys (`shift-morning-0900`, etc.).
- Additive columns/tables only.
- Target: `ANDROID_1_0_15_SHIFT_BREAKING_CHANGES=0`

## Migration

`prisma/migrations/20260821120000_shift_roster_foundation/`

- Adds template metadata columns
- Creates `shift_segments` and backfills one segment per legacy shift
- Extends assignments + roster
- Creates day overrides

**No production migration in this development block.**

## Historical schedule meaning

**Strategy: IMMUTABLE_ON_REFERENCE**

Once a Shift Template is referenced by any default assignment, roster row, or day override, scheduling-critical fields cannot be mutated:

- segments
- timezone
- grace in/out

Display fields (name, description, color, active) remain editable.

To revise times: **Duplicate** the template (`POST /shift-templates/:id/duplicate`) and assign the new template going forward. Historical resolution continues to use the original template ID.

## Explicit NO_SHIFT

Absence of a roster row does **not** mean off — it falls through to DEFAULT.

To block DEFAULT for a date, write an explicit row:

- Roster with `shiftId: null` → `source=ROSTER`, `explicitNoShift=true`
- Day override with `shiftId: null` → `source=DAY_OVERRIDE`, `explicitNoShift=true`

## Default assignment dates

`effectiveFrom` inclusive, `effectiveTo` exclusive.

## Resolver contract

`resolveEmployeeShiftForWorkDate` returns employeeId, workDate, source, explicitNoShift, template, segments (with absolute minutes), expectedWorkMinutes, grace, crossesMidnight.

Does **not** create AttendanceWorkday or punch events.
