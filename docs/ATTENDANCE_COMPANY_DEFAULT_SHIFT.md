# Company Default Shift

**Setting key:** `attendance.defaultShiftId`  
**Canonical template:** `shift-morning-0930` — display name **General Shift**  
**Window:** 09:30–18:30 Asia/Kolkata · **540** expected minutes · graceIn default 30

## Resolver

```
DAY_OVERRIDE → ROSTER → EMPLOYEE_DEFAULT (source=DEFAULT, defaultScope=EMPLOYEE)
  → COMPANY_DEFAULT (defaultScope=COMPANY) → NONE
```

Explicit `NO_SHIFT` on override/roster stops resolution (no company fallback).

## Historical rule

Company default is **prospective** only. Changing the setting never rewrites
existing `AttendanceWorkday` `shiftTemplateId` / `scheduleSnapshot` / classification.
