/**
 * Leave calendar boundaries — week-off / holiday / NO_SHIFT plugs.
 * Full Weekly Off / Holiday redesign is out of scope; callers use these helpers.
 */
import { prisma } from "./prisma.js";
import {
  eachDateInRange,
  isSunday,
  startOfDayUtc,
} from "./attendanceDayRules.js";
import { resolveEmployeeShiftForWorkDate } from "./shiftRoster.js";

function dateKey(date: Date) {
  return startOfDayUtc(date).toISOString().slice(0, 10);
}

/** Sundays (fixed policy) and approved weekly-off dates are not leave days. */
export async function skippedWeekOffDateKeys(
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
  const skipped = new Set<string>();
  for (const date of dates) {
    const key = dateKey(date);
    if (employee?.weeklyOffPolicy === "SUNDAY_FIXED" && isSunday(date)) skipped.add(key);
    if (approvedKeys.has(key)) skipped.add(key);
  }
  return skipped;
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
 * Whether leave on holidays should still consume balance.
 * Current production behavior: holidays ARE counted (consume).
 * Until HR confirms otherwise, keep consuming; flag for policy confirmation.
 */
export const LEAVE_HOLIDAY_CONSUMES_BALANCE = true;
export const LEAVE_HOLIDAY_POLICY_CONFIRMATION_REQUIRED = true;

/**
 * Billable leave dates under current calendar rules (week-offs skipped;
 * holidays included when LEAVE_HOLIDAY_CONSUMES_BALANCE).
 */
export async function billableLeaveDates(
  employeeId: string,
  fromDate: Date,
  toDate: Date,
) {
  const dates = eachDateInRange(fromDate, toDate);
  const skipped = await skippedWeekOffDateKeys(employeeId, fromDate, toDate);
  const holidays = await holidayDateKeysInRange(fromDate, toDate);
  return dates.filter((date) => {
    const key = dateKey(date);
    if (skipped.has(key)) return false;
    if (!LEAVE_HOLIDAY_CONSUMES_BALANCE && holidays.has(key)) return false;
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
