/**
 * Leave calendar boundaries — week-off / holiday / NO_SHIFT plugs.
 * Consumption flags come from leaveCalendarPolicy (SystemSetting), not scattered hardcodes.
 */
import { prisma } from "./prisma.js";
import {
  eachDateInRange,
  isSunday,
  startOfDayUtc,
} from "./attendanceDayRules.js";
import { resolveEmployeeShiftForWorkDate } from "./shiftRoster.js";
import { getLeaveCalendarPolicy } from "./leaveCalendarPolicy.js";

export {
  LEAVE_HOLIDAY_POLICY_CONFIRMATION_REQUIRED,
  LEAVE_POLICY_CONFIRMATION_REQUIRED,
  LEAVE_WEEKLY_OFF_POLICY_CONFIRMATION_REQUIRED,
  getLeaveCalendarPolicy,
  setLeaveCalendarPolicy,
} from "./leaveCalendarPolicy.js";

function dateKey(date: Date) {
  return startOfDayUtc(date).toISOString().slice(0, 10);
}

/**
 * Weekly-off date keys in range (Sunday-fixed + approved selectable offs).
 * Whether they consume leave balance is controlled by calendar policy.
 */
export async function weeklyOffDateKeysInRange(
  employeeId: string,
  fromDate: Date,
  toDate: Date,
) {
  const dates = eachDateInRange(fromDate, toDate);
  const employee = await prisma.employee.findUnique({
    where: { employeeId },
    select: { weeklyOffPolicy: true },
  });
  const approved = await prisma.weeklyOffRequest.findMany({
    where: {
      employeeId,
      status: "APPROVED",
      date: { gte: startOfDayUtc(fromDate), lte: startOfDayUtc(toDate) },
    },
    select: { date: true },
  });
  const approvedKeys = new Set(approved.map((row) => dateKey(row.date)));
  const keys = new Set<string>();
  for (const date of dates) {
    const key = dateKey(date);
    if (employee?.weeklyOffPolicy === "SUNDAY_FIXED" && isSunday(date)) keys.add(key);
    if (approvedKeys.has(key)) keys.add(key);
  }
  return keys;
}

/**
 * Dates that do not count toward leave days under current calendar policy.
 * Production default: weekly offs skipped (do not consume); holidays consume.
 */
export async function skippedWeekOffDateKeys(
  employeeId: string,
  fromDate: Date,
  toDate: Date,
) {
  const policy = await getLeaveCalendarPolicy();
  const weekOffs = await weeklyOffDateKeysInRange(employeeId, fromDate, toDate);
  if (policy.weeklyOffConsumesBalance) {
    // When weekly offs consume balance, they are billable — do not skip.
    return new Set<string>();
  }
  return weekOffs;
}

/**
 * Active company holidays in range.
 * Consumption vs free day is Leave Policy controlled — this only lists dates.
 */
export async function holidayDateKeysInRange(fromDate: Date, toDate: Date) {
  const rows = await prisma.holiday.findMany({
    where: {
      status: "ACTIVE",
      date: { gte: startOfDayUtc(fromDate), lte: startOfDayUtc(toDate) },
    },
    select: { date: true, name: true },
  });
  return new Set(rows.map((row) => dateKey(row.date)));
}

/**
 * Billable leave dates under configured calendar policy.
 */
export async function billableLeaveDates(
  employeeId: string,
  fromDate: Date,
  toDate: Date,
) {
  const policy = await getLeaveCalendarPolicy();
  const dates = eachDateInRange(fromDate, toDate);
  const weekOffs = await weeklyOffDateKeysInRange(employeeId, fromDate, toDate);
  const holidays = await holidayDateKeysInRange(fromDate, toDate);
  return dates.filter((date) => {
    const key = dateKey(date);
    if (!policy.weeklyOffConsumesBalance && weekOffs.has(key)) return false;
    if (!policy.holidayConsumesBalance && holidays.has(key)) return false;
    return true;
  });
}

/**
 * Explicit NO_SHIFT on a WorkDate — leave should not silently consume balance
 * unless policy later permits. Returns true when resolution is explicit NO_SHIFT.
 */
export async function isExplicitNoShiftWorkDate(employeeId: string, workDate: Date) {
  const resolved = await resolveEmployeeShiftForWorkDate(employeeId, workDate);
  return resolved.explicitNoShift === true;
}

export async function assertLeaveDatesNotExplicitNoShift(
  employeeId: string,
  dates: Date[],
) {
  for (const date of dates) {
    if (await isExplicitNoShiftWorkDate(employeeId, date)) {
      const { HttpError } = await import("./errors.js");
      throw new HttpError(
        400,
        `Leave cannot be requested on ${dateKey(date)} because that WorkDate is explicitly scheduled as No Shift.`,
      );
    }
  }
}

/**
 * Half-day on multi-segment (split) shifts is undefined until HR confirms mapping.
 * Reject rather than invent First/Second Half → segment mapping.
 */
export async function assertHalfDayAllowedForResolvedShift(
  employeeId: string,
  workDate: Date,
) {
  const resolved = await resolveEmployeeShiftForWorkDate(employeeId, workDate);
  if (resolved.explicitNoShift) {
    const { HttpError } = await import("./errors.js");
    throw new HttpError(
      400,
      `Leave cannot be requested on ${dateKey(workDate)} because that WorkDate is explicitly scheduled as No Shift.`,
    );
  }
  const segmentCount = resolved.segments?.length ?? 0;
  if (segmentCount > 1) {
    const { HttpError } = await import("./errors.js");
    throw new HttpError(
      400,
      "Half-day leave is not available for split shifts until HR confirms which work segments map to First Half and Second Half. Please request a full day, or contact HR.",
    );
  }
}
