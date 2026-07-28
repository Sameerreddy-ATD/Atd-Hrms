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

1. If the employee does not check out, at **shift end + 30 minutes** the system creates a provisional
   **SYSTEM** checkout and marks **Missed Checkout**.
2. The employee has a **two-day** correction window to submit the real punch time.
3. After that window, only **HR** can unlock / correct (HR lock).
4. **Next-day check-in is never blocked** by a prior missed checkout or open prior-day punch.
5. If the employee checks in on a new day while a prior day is still open, the system auto-closes
   that prior day as Missed Checkout, then accepts today’s check-in.
6. The employee may also check out a still-open prior day with real GPS; that out is stored on the
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

1. After first password change, a full-screen gate requires face registration (Developer Admin
   exempt).
2. The employee accepts versioned biometric consent.
3. The camera captures **three encrypted registration photos**: **centre**, **left**, and **right**.
4. Descriptors from those angles become the encrypted template (multi-sample).
5. Developer Admin approves or rejects under **Face Security** (or automatic approval if configured).

### Daily check-in (verify only)

1. Check-in runs a live face match (liveness + anti-spoof + head-turn challenge) against the approved
   template, plus precise GPS.
2. **No new photo is stored** on check-in — only the live match result / audit scores. This avoids
   wasting storage on daily punches.
3. Mismatch → **Another face detected**; attendance is not created.
4. Check-out is **camera-free** and location-verified.

Developer Admin can pause face verification; GPS-only check-in then applies. Existing templates and
registration photos are retained.

## Theme (appearance)

Profile appearance uses a **light / dark** switch only (no Auto / system mode).

## What was fixed (27 Jul 2026)

- **Prior open / missed checkout no longer blocks today’s check-in.** System auto-closes the prior
  day when needed; Missed Checkout remains a flag with a two-day correction window.
- **Face:** multi-direction enrollment photos; attendance verify without saving photos.
- Documentation aligned to the rules above.
