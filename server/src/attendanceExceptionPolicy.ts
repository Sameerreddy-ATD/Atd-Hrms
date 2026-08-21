/**
 * Workday attendance policy constants (exceptions / classification).
 * Classification operates on AttendanceWorkday — not calendar midnight.
 */
export const MISSING_CHECKOUT_THRESHOLD_MINUTES = 30;
export const MISSING_CHECKIN_GRACE_MINUTES = 30;
export const CORRECTION_WINDOW_DAYS = 2;
/** Inclusive lower bound for Half Day (minutes). */
export const HALF_DAY_MIN_WORKED_MINUTES = 240;
/** Inclusive lower bound for Full Day (minutes). */
export const FULL_DAY_WORKED_MINUTES = 540;
export const CLASSIFICATION_VERSION = 1;

export const ExceptionType = {
  MISSING_CHECK_IN: "MISSING_CHECK_IN",
  MISSING_CHECK_OUT: "MISSING_CHECK_OUT",
  LATE_CHECK_IN: "LATE_CHECK_IN",
  EARLY_CHECK_OUT: "EARLY_CHECK_OUT",
  UNSCHEDULED_ATTENDANCE: "UNSCHEDULED_ATTENDANCE",
  SCHEDULED_NO_SHIFT_WORK: "SCHEDULED_NO_SHIFT_WORK",
  DUPLICATE_PUNCH: "DUPLICATE_PUNCH",
  ATTENDANCE_CONFLICT: "ATTENDANCE_CONFLICT",
} as const;
export type ExceptionTypeName = (typeof ExceptionType)[keyof typeof ExceptionType];

export const ExceptionStatus = {
  OPEN: "OPEN",
  CORRECTION_PENDING: "CORRECTION_PENDING",
  RESOLVED: "RESOLVED",
  DISMISSED: "DISMISSED",
} as const;

export const WorkdayLifecycle = {
  OPEN: "OPEN",
  AWAITING_CORRECTION: "AWAITING_CORRECTION",
  READY: "READY",
  FINAL: "FINAL",
} as const;

export const CorrectionLockState = {
  OPEN: "OPEN",
  EMPLOYEE_LOCKED: "EMPLOYEE_LOCKED",
} as const;

export const CorrectionIntent = {
  MISSING_CHECK_IN: "MISSING_CHECK_IN",
  MISSING_CHECK_OUT: "MISSING_CHECK_OUT",
  INCORRECT_CHECK_IN: "INCORRECT_CHECK_IN",
  INCORRECT_CHECK_OUT: "INCORRECT_CHECK_OUT",
} as const;

/** Workday-level operational results (string storage on AttendanceWorkday). */
export const WorkdayAttendanceResult = {
  FULL_DAY: "FULL_DAY",
  HALF_DAY: "HALF_DAY",
  ABSENT: "ABSENT",
  PENDING: "PENDING",
  CORRECTION_REQUIRED: "CORRECTION_REQUIRED",
  HOLIDAY: "HOLIDAY",
  WEEKLY_OFF: "WEEKLY_OFF",
  PAID_LEAVE: "PAID_LEAVE",
  UNPAID_LEAVE: "UNPAID_LEAVE",
  UNSCHEDULED: "UNSCHEDULED",
  /** Approved leave + recorded attendance evidence — both retained for review. */
  LEAVE_ATTENDANCE_CONFLICT: "LEAVE_ATTENDANCE_CONFLICT",
} as const;
export type WorkdayAttendanceResultName =
  (typeof WorkdayAttendanceResult)[keyof typeof WorkdayAttendanceResult];

/**
 * Finalized worked-minute bands (closed sessions only).
 * &lt; 240 → ABSENT; 240–539 → HALF_DAY; ≥ 540 → FULL_DAY
 */
export function attendanceResultFromWorkedMinutes(
  workedMinutes: number,
): "FULL_DAY" | "HALF_DAY" | "ABSENT" {
  if (workedMinutes >= FULL_DAY_WORKED_MINUTES) return "FULL_DAY";
  if (workedMinutes >= HALF_DAY_MIN_WORKED_MINUTES) return "HALF_DAY";
  return "ABSENT";
}

/** Employee correction window end: eligibilityInstant + CORRECTION_WINDOW_DAYS (exclusive after). */
export function employeeCorrectionWindowEndsAt(eligibilityInstant: Date): Date {
  const end = new Date(eligibilityInstant.getTime());
  end.setUTCDate(end.getUTCDate() + CORRECTION_WINDOW_DAYS);
  return end;
}

export function exceptionDedupeKey(
  workdayId: string,
  type: string,
  relatedSessionId?: string | null,
): string {
  return `${workdayId}|${type}|${relatedSessionId ?? "*"}`;
}

export function workdayResultLabel(result: string): string {
  switch (result) {
    case WorkdayAttendanceResult.FULL_DAY:
      return "Full Day";
    case WorkdayAttendanceResult.HALF_DAY:
      return "Half Day";
    case WorkdayAttendanceResult.ABSENT:
      return "Absent";
    case WorkdayAttendanceResult.CORRECTION_REQUIRED:
      return "Correction Required";
    case WorkdayAttendanceResult.HOLIDAY:
      return "Holiday";
    case WorkdayAttendanceResult.WEEKLY_OFF:
      return "Week Off";
    case WorkdayAttendanceResult.PAID_LEAVE:
      return "Paid Leave";
    case WorkdayAttendanceResult.UNPAID_LEAVE:
      return "Unpaid Leave / LOP";
    case WorkdayAttendanceResult.LEAVE_ATTENDANCE_CONFLICT:
      return "Leave + Attendance conflict";
    case WorkdayAttendanceResult.UNSCHEDULED:
      return "Unscheduled attendance";
    default:
      return "Pending";
  }
}
