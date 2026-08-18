# Attendance, Leave, and Face Policy

Authoritative business rules requested for Anytime Diesel HRMS (July 2026).  
Operational detail also appears in [Operations and Workflows](OPERATIONS_AND_WORKFLOWS.md) and
[Face Registration and Verified Attendance](FACE_ATTENDANCE_SECURITY.md).

## Attendance day results

| Result       | Worked hours                         |
| ------------ | ------------------------------------ |
| **Full Day** | ≥ 9 hours                            |
| **Half Day** | ≥ 4 hours and &lt; 9 hours           |
| **Absent**   | &lt; 4 hours (or no qualifying punch)|

**Late** and **Missed Checkout** are flags on top of the primary result. They do not replace Full
Day / Half Day / Absent.

## Shifts

- Employees must have a shift assignment for the attendance date (shift catalog + assignment).
- Profile shift times are used only to backfill missing catalog assignments.
- Night-shift checkouts after midnight stay on the shift start date.

## Mobile location labels

| Label | Meaning |
| --- | --- |
| **`{Branch name} · Mobile`** | Mobile GPS punch inside that branch’s geofence |
| **Mobile** | Mobile GPS punch outside any branch radius |

Biometric / thumb punches remain labeled as **`{Branch name} · Biometric`** (not as Mobile).
When a geofence match has no resolvable branch name, the UI may fall back to **Branch-Mobile**.

## Missed checkout (does not block next-day attendance)

1. Check-in and check-out are recorded only when the employee actually punches.
2. During the shift, punch-out stays **empty**. After **slot (shift) end** with no punch-out, the
   UI shows **Punch-out required** and the day is marked **Missed Checkout** (no automatic SYSTEM
   checkout).
3. The employee has a **two-day** correction window to submit a **Missed Punch** with the real
   punch-out time; their organization head (or HR) can approve it.
4. After that window, only **HR** can unlock / correct (HR lock).
5. **Next-day check-in is never blocked** by a prior missed checkout or open prior-day punch.
6. If the employee checks in on a new day while a prior day is still open, that prior day is marked
   Missed Checkout with empty punch-out, then today’s check-in is accepted.
7. The employee may also check out a still-open prior day with real GPS; that out is stored on the
   open attendance date.

Corrections remain available from **Missed Punch Request** / **Attendance Corrections**; they are
optional cleanup, not a gate on punching today.

## Leave policy (summary)

- **Casual Leave**, **Sick Leave**, **Unpaid Leave / LOP**, and **Comp Off** are the leave types.
- Mobile check-in on an approved leave day asks for confirmation; biometric punch cancels that date
  directly.
- **Sick Leave:** private medical certificate upload (PDF/image) within **48 hours** after return;
  public Drive links are not accepted; reminders at 24h and 2h before the deadline.
- **Comp Off:** earned after a completed Full Day (≥9h) on an **active company holiday**; Reporting
  Head approval is required to consume; credit expires **31 December** of the earn year (no carry).
- **Sunday** weekly off can auto-confirm per policy; a punch on weekly off recalculates from worked
  hours (Full Day / Half Day / Absent).
- Holidays are **company-wide** (not branch-scoped). Every active holiday-list entry counts as a
  holiday for attendance.

## Face registration and daily verify

### Registration (once per person)

1. The workspace is usable after login. Face is required at punch time, not as a full-app gate
   (Developer Admin exempt).
2. If face verification is on and no face is saved, Check In or Check Out opens registration.
3. The employee accepts versioned biometric consent.
4. The camera captures **one** encrypted front photo.
5. Developer Admin approves or rejects under **Face Security** (or automatic approval if configured).

### Daily check-in and check-out (verify only)

1. After a face is saved, check-in and check-out run a live face match (liveness + anti-spoof)
   against the approved template, plus precise GPS.
2. **No new photo is stored** on punch — only the live match result / audit scores.
3. Mismatch → **Another face detected**; attendance is not created.

Developer Admin can pause face verification; GPS-only check-in then applies. Existing templates and
registration photos are retained.

## Theme (appearance)

Profile appearance uses a **light / dark** switch only (no Auto / system mode).

## What was fixed (27 Jul 2026)

- **Prior open / missed checkout no longer blocks today’s check-in.** Prior day is marked Missed
  Checkout with empty punch-out when needed; correction window remains two days.
- **Face:** multi-direction enrollment photos; attendance verify without saving photos.
- Documentation aligned to the rules above.

## Punch-out empty on missed checkout (Aug 2026)

- No automatic SYSTEM checkout. During the slot, punch-out is empty; after slot end it shows
  Punch-out required until a real checkout or an approved missed punch (org head / HR).
