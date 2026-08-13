# Play Console — Precise location only

Anytime Workforce is **internal attendance**. Check-in/out need **Precise** GPS against the branch geofence. Approximate-only is rejected in-app.

## Data safety (App content → Data safety)

| Question | Answer |
| -------- | ------ |
| Collect location? | **Yes** |
| Precise location | **Yes — collected** |
| Approximate location | **No** (not used for features; punches require precise) |
| Shared with third parties? | **No** (except your employer/processors already declared) |
| Purpose | App functionality |
| Required? | **Yes** for attendance |
| Ephemeral? | No — stored with the attendance record for HR audit |
| While in use / background | **While in use only** — no background location |

## Sensitive permissions declaration (if prompted for `ACCESS_FINE_LOCATION`)

Paste:

```text
Anytime Workforce is an internal Anytime Diesel employee attendance app.
Precise (fine) location is required only while an employee checks in or checks out,
so the punch can be matched to their assigned branch geofence.
Approximate location is not accurate enough for this internal workforce control.
Location is never used in the background.
```

## Listing / reviewer note (optional)

```text
Internal workforce app. Attendance requires Precise location (not Approximate).
Camera only when Face Security is enabled. No background location. No ads.
```

Full drafts: `docs/MOBILE_STORE_RELEASE.md`
