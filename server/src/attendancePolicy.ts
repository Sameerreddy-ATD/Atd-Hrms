import { AttendanceLocationSource, AttendanceResult, Prisma } from "@prisma/client";
import { istDateParts, startOfDayUtc } from "./attendanceDayRules.js";
import { prisma } from "./prisma.js";

export const GRACE_MINUTES = 30;
export const HALF_DAY_HOURS = 4;
export const FULL_DAY_HOURS = 9;
export const CORRECTION_WINDOW_DAYS = 2;

export type ShiftWindow = {
  shiftType: "DAY" | "NIGHT";
  shiftStartMinutes: number;
  shiftEndMinutes: number;
  shiftId?: string;
  shiftName?: string;
};

export function hoursBetween(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 36e5);
}

export function attendanceResultFromHours(totalHours: number): AttendanceResult {
  if (totalHours >= FULL_DAY_HOURS) return AttendanceResult.FULL_DAY;
  if (totalHours >= HALF_DAY_HOURS) return AttendanceResult.HALF_DAY;
  return AttendanceResult.ABSENT;
}

export function attendanceResultLabel(result: AttendanceResult, holidayName?: string): string {
  switch (result) {
    case AttendanceResult.FULL_DAY:
      return "Full Day";
    case AttendanceResult.HALF_DAY:
      return "Half Day";
    case AttendanceResult.ABSENT:
      return "Absent";
    case AttendanceResult.HOLIDAY:
      return holidayName ? `Holiday - ${holidayName}` : "Holiday";
    case AttendanceResult.WEEKLY_OFF:
      return "Week Off";
    case AttendanceResult.PAID_LEAVE:
      return "Paid Leave";
    case AttendanceResult.UNPAID_LEAVE:
      return "Unpaid Leave / LOP";
    default:
      return "Pending attendance";
  }
}

export function locationSourceLabel(
  source: AttendanceLocationSource | null | undefined,
  branchName?: string | null,
): string {
  if (source === AttendanceLocationSource.BRANCH_MOBILE) {
    return branchName ? `Branch-Mobile · ${branchName}` : "Branch-Mobile";
  }
  if (source === AttendanceLocationSource.MOBILE) return "Mobile";
  if (source === AttendanceLocationSource.THUMB_SCANNER) {
    return branchName ? `${branchName} - biometric` : "Thumb Scanner";
  }
  if (source === AttendanceLocationSource.MANUAL) return "Manual Entry";
  return "System";
}

export function classifyMobileSource(matchedBranchId?: string | null): AttendanceLocationSource {
  return matchedBranchId
    ? AttendanceLocationSource.BRANCH_MOBILE
    : AttendanceLocationSource.MOBILE;
}

/** IST midnight of attendance date + minutes from midnight (supports night end next calendar day). */
export function shiftInstantOnDate(
  attendanceDate: Date,
  minutesFromMidnight: number,
  dayOffset = 0,
) {
  const date = startOfDayUtc(attendanceDate);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  const istMs = date.getTime() + minutesFromMidnight * 60_000 - 5.5 * 60 * 60 * 1000;
  return new Date(istMs);
}

export function shiftWindowBounds(attendanceDate: Date, shift: ShiftWindow) {
  const start = shiftInstantOnDate(attendanceDate, shift.shiftStartMinutes, 0);
  const crossesMidnight =
    shift.shiftType === "NIGHT" || shift.shiftEndMinutes <= shift.shiftStartMinutes;
  const end = shiftInstantOnDate(attendanceDate, shift.shiftEndMinutes, crossesMidnight ? 1 : 0);
  return {
    start,
    end,
    graceEnd: new Date(start.getTime() + GRACE_MINUTES * 60_000),
    missedCheckInAt: new Date(start.getTime() + GRACE_MINUTES * 60_000),
    missedCheckOutAt: new Date(end.getTime() + GRACE_MINUTES * 60_000),
  };
}

export function correctionDeadlineFor(attendanceDate: Date, shiftEnd: Date) {
  const base = new Date(Math.max(shiftEnd.getTime(), startOfDayUtc(attendanceDate).getTime()));
  base.setUTCDate(base.getUTCDate() + CORRECTION_WINDOW_DAYS);
  return base;
}

export function isLateCheckIn(checkInAt: Date, graceEnd: Date) {
  return checkInAt.getTime() > graceEnd.getTime();
}

export async function findActiveShiftAssignment(employeeId: string, attendanceDate: Date) {
  const date = startOfDayUtc(attendanceDate);
  return prisma.employeeShiftAssignment.findFirst({
    where: {
      employeeId,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
    },
    include: { shift: true },
    orderBy: { effectiveFrom: "desc" },
  });
}

/** Ensure a catalog assignment exists (lazy backfill from employee profile shift times). */
export async function ensureEmployeeShiftAssignment(
  employeeId: string,
  attendanceDate: Date,
  assignedBy?: string | null,
) {
  const existing = await findActiveShiftAssignment(employeeId, attendanceDate);
  if (existing?.shift) return existing;

  const employee = await prisma.employee.findUniqueOrThrow({
    where: { employeeId },
    select: {
      shiftType: true,
      shiftStartMinutes: true,
      shiftEndMinutes: true,
      joiningDate: true,
    },
  });

  let shift = await prisma.shiftDefinition.findFirst({
    where: {
      active: true,
      shiftType: employee.shiftType,
      startMinutes: employee.shiftStartMinutes,
      endMinutes: employee.shiftEndMinutes,
    },
  });
  if (!shift) {
    const hours = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const code = `CUSTOM_${employee.shiftType}_${employee.shiftStartMinutes}_${employee.shiftEndMinutes}`;
    const name = `${employee.shiftType === "NIGHT" ? "Night" : "Day"} ${hours(employee.shiftStartMinutes)}–${hours(employee.shiftEndMinutes)}`;
    shift = await prisma.shiftDefinition.upsert({
      where: { code },
      update: {
        name,
        shiftType: employee.shiftType,
        startMinutes: employee.shiftStartMinutes,
        endMinutes: employee.shiftEndMinutes,
        active: true,
      },
      create: {
        name,
        code,
        shiftType: employee.shiftType,
        startMinutes: employee.shiftStartMinutes,
        endMinutes: employee.shiftEndMinutes,
        active: true,
      },
    });
  }

  const effectiveFrom = startOfDayUtc(employee.joiningDate ?? attendanceDate);
  return prisma.employeeShiftAssignment.create({
    data: {
      employeeId,
      shiftId: shift.shiftId,
      effectiveFrom,
      assignedBy: assignedBy ?? null,
    },
    include: { shift: true },
  });
}

export async function resolveEmployeeShift(
  employeeId: string,
  attendanceDate: Date,
): Promise<ShiftWindow> {
  const assignment =
    (await findActiveShiftAssignment(employeeId, attendanceDate)) ??
    (await ensureEmployeeShiftAssignment(employeeId, attendanceDate));
  if (assignment?.shift) {
    return {
      shiftType: assignment.shift.shiftType,
      shiftStartMinutes: assignment.shift.startMinutes,
      shiftEndMinutes: assignment.shift.endMinutes,
      shiftId: assignment.shift.shiftId,
      shiftName: assignment.shift.name,
    };
  }
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { employeeId },
    select: { shiftType: true, shiftStartMinutes: true, shiftEndMinutes: true },
  });
  return {
    shiftType: employee.shiftType,
    shiftStartMinutes: employee.shiftStartMinutes,
    shiftEndMinutes: employee.shiftEndMinutes,
  };
}

export function yearEndIst(year: number) {
  // 31 Dec 23:59:59.999 IST = 31 Dec 18:29:59.999 UTC
  return new Date(Date.UTC(year, 11, 31, 18, 29, 59, 999));
}

export function monthEndIst(year: number, monthIndex: number) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, lastDay, 18, 29, 59, 999));
}

export function medicalDocumentDueAt48h(toDate: Date) {
  // Return-to-work is the next calendar day 00:00 IST; deadline is 48 hours after that.
  const returnToWorkIst = startOfDayUtc(toDate);
  returnToWorkIst.setUTCDate(returnToWorkIst.getUTCDate() + 1);
  const returnUtc = new Date(returnToWorkIst.getTime() - 5.5 * 60 * 60 * 1000);
  return new Date(returnUtc.getTime() + 48 * 60 * 60 * 1000);
}

export type SummaryFlags = {
  attendanceResult: AttendanceResult;
  status: string;
  isLate: boolean;
  isMissedCheckout: boolean;
  hasMissedCheckout: boolean;
  hasMissingOutEvent: boolean;
  isLocked: boolean;
  provisionalCheckOutAt: Date | null;
  correctionDeadlineAt: Date | null;
  checkInSource: AttendanceLocationSource | null;
  checkOutSource: AttendanceLocationSource | null;
  matchedBranchId: string | null;
};

export function decimalHours(value: number) {
  return new Prisma.Decimal(Math.round(value * 1_000_000) / 1_000_000);
}

export function istNowParts(now = new Date()) {
  return istDateParts(now);
}
