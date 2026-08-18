import { LeaveStatus, Role } from "@prisma/client";
import { prisma } from "./prisma.js";

export const APPROVED_LEAVE_STATUSES: LeaveStatus[] = [
  "APPROVED",
  "MANAGER_APPROVED",
  "HR_VERIFIED",
];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function startOfDayUtc(date: string | Date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function istDateParts(date: Date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth(),
    day: ist.getUTCDate(),
    weekday: ist.getUTCDay(),
  };
}

export function todayIstDate(now = new Date()) {
  const parts = istDateParts(now);
  return new Date(Date.UTC(parts.year, parts.month, parts.day));
}

function dayKeyUtc(date: Date) {
  return startOfDayUtc(date).toISOString().slice(0, 10);
}

/** Current calendar month in Asia/Kolkata as YYYY-MM. */
export function istMonthKey(now = new Date()) {
  return dayKeyUtc(todayIstDate(now)).slice(0, 7);
}

/**
 * Inclusive first/last calendar days for a YYYY-MM month key (IST).
 * For the current month, `to` stops at today so future dates are not included.
 */
export function istMonthRangeThroughToday(monthKey?: string, now = new Date()) {
  const key = monthKey && /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : istMonthKey(now);
  const [year, month] = key.split("-").map(Number);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const today = todayIstDate(now);
  const to = monthEnd.getTime() > today.getTime() ? today : monthEnd;
  return {
    from,
    to: to.getTime() < from.getTime() ? from : to,
    fromKey: dayKeyUtc(from),
    toKey: dayKeyUtc(to.getTime() < from.getTime() ? from : to),
  };
}

/** Clamp an attendance date range so `to` never exceeds today (IST). */
export function clampAttendanceRangeToToday(input: { from?: Date; to?: Date; now?: Date }) {
  const today = todayIstDate(input.now);
  let from = input.from ? startOfDayUtc(input.from) : undefined;
  let to = input.to ? startOfDayUtc(input.to) : undefined;
  if (to && to.getTime() > today.getTime()) to = today;
  if (from && from.getTime() > today.getTime()) from = today;
  if (from && to && to.getTime() < from.getTime()) to = from;
  return { from, to };
}

export function isSunday(date: Date) {
  return istDateParts(date).weekday === 0;
}

/**
 * Instant when an IST attendance calendar day ends (next IST midnight).
 * `attendanceDate` is the date-only key (UTC midnight of Y-M-D).
 */
export function endOfAttendanceDayIst(attendanceDate: Date) {
  const day = startOfDayUtc(attendanceDate);
  const nextKey = new Date(day);
  nextKey.setUTCDate(nextKey.getUTCDate() + 1);
  return new Date(nextKey.getTime() - IST_OFFSET_MS);
}

const WEEKDAY_KEYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

function dayKey(date: Date) {
  return startOfDayUtc(date).toISOString().slice(0, 10);
}

function cancelledDateKeys(value: unknown) {
  return Array.isArray(value)
    ? value.filter((date): date is string => typeof date === "string")
    : [];
}

function dayCanBeSettled(eventDate: Date) {
  const now = istDateParts(new Date());
  const today = Date.UTC(now.year, now.month, now.day);
  const eventDay = startOfDayUtc(eventDate).getTime();
  if (eventDay < today) return true;
  if (eventDay > today) return false;
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  return istNow.getUTCHours() >= 10;
}

export function eachDateInRange(from: string | Date, to: string | Date) {
  const start = startOfDayUtc(from);
  const end = startOfDayUtc(to);
  const dates: Date[] = [];
  for (
    let cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    dates.push(new Date(cursor));
  }
  return dates;
}

export async function findHolidayForEmployee(employeeId: string, eventDate: Date) {
  const login = await prisma.user.findFirst({
    where: { employeeId },
    select: { role: true },
  });
  if (login?.role === Role.DRIVER) return null;
  return prisma.holiday.findFirst({
    where: {
      status: "ACTIVE",
      date: eventDate,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function findApprovedLeaveForDay(employeeId: string, eventDate: Date, paid: boolean) {
  const date = startOfDayUtc(eventDate);
  const requests = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      fromDate: { lte: date },
      toDate: { gte: date },
      status: { in: APPROVED_LEAVE_STATUSES },
      leaveType: { paid },
    },
    include: { leaveType: true },
  });
  return requests.find(
    (request) => !cancelledDateKeys(request.cancelledDates).includes(dayKey(date)),
  );
}

export async function cancelApprovedLeaveForDay(employeeId: string, eventDate: Date) {
  const date = startOfDayUtc(eventDate);
  const dateKey = dayKey(date);
  const requests = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      fromDate: { lte: date },
      toDate: { gte: date },
      status: { in: APPROVED_LEAVE_STATUSES },
    },
    include: { leaveType: true },
  });
  const updated = [];
  for (const request of requests) {
    if (cancelledDateKeys(request.cancelledDates).includes(dateKey)) continue;
    const cancelled = await cancelLeaveDates(request.leaveRequestId, [date]);
    if (request.leaveType.code === "COMP_OFF" && cancelled.status === "CANCELLED") {
      await prisma.compOffCredit.updateMany({
        where: { consumedByLeaveRequestId: request.leaveRequestId },
        data: { consumedByLeaveRequestId: null },
      });
    }
    updated.push(cancelled);
  }
  return updated;
}

export async function cancelLeaveDates(leaveRequestId: string, dates: Array<string | Date>) {
  const request = await prisma.leaveRequest.findUniqueOrThrow({ where: { leaveRequestId } });
  const rangeKeys = eachDateInRange(request.fromDate, request.toDate).map(dayKey);
  const requestedKeys = dates.map((date) => dayKey(new Date(date)));
  const cancelled = new Set(cancelledDateKeys(request.cancelledDates));
  for (const date of requestedKeys) {
    if (rangeKeys.includes(date)) cancelled.add(date);
  }
  const cancelledDates = [...cancelled].sort();
  const fullyCancelled = rangeKeys.every((date) => cancelled.has(date));
  return prisma.leaveRequest.update({
    where: { leaveRequestId },
    data: {
      cancelledDates,
      ...(fullyCancelled ? { status: "CANCELLED" } : {}),
    },
    include: { leaveType: true, employee: { include: { manager: true } } },
  });
}

export async function resolveNoEventStatus(employeeId: string, eventDate: Date): Promise<string> {
  if (!dayCanBeSettled(eventDate)) return "Pending attendance";

  const holiday = await findHolidayForEmployee(employeeId, eventDate);
  if (holiday) return `Holiday - ${holiday.name}`;

  const weeklyOff = await prisma.weeklyOffRequest.findFirst({
    where: { employeeId, date: startOfDayUtc(eventDate), status: "APPROVED" },
  });
  if (weeklyOff) {
    const dayOfWeek = WEEKDAY_KEYS[istDateParts(eventDate).weekday];
    return `Week Off (${dayOfWeek[0]}${dayOfWeek.slice(1).toLowerCase()})`;
  }

  // Fixed-Sunday policy: every Sunday is week off without a request row.
  if (isSunday(eventDate)) {
    const employee = await prisma.employee.findUnique({
      where: { employeeId },
      select: { weeklyOffPolicy: true },
    });
    if (employee?.weeklyOffPolicy === "SUNDAY_FIXED") {
      return "Week Off (Sunday)";
    }
  }

  const paidLeave = await findApprovedLeaveForDay(employeeId, eventDate, true);
  if (paidLeave) return "Paid Leave";

  const unpaidLeave = await findApprovedLeaveForDay(employeeId, eventDate, false);
  if (unpaidLeave) return "Unpaid Leave / LOP";

  return "Absent";
}

export async function activeEmployeeIdsExcludingDeveloperAdmin() {
  const employees = await prisma.employee.findMany({
    where: {
      status: "ACTIVE",
      attendanceRequired: true,
      OR: [{ user: null }, { user: { role: { not: "DEVELOPER_ADMIN" } } }],
    },
    select: { employeeId: true },
  });
  return employees.map((row) => row.employeeId);
}

export async function ensureDailySummariesForRange(
  employeeId: string,
  from: string | Date,
  to: string | Date,
  recalculate: (employeeId: string, date: Date) => Promise<unknown>,
) {
  const dates = eachDateInRange(from, to);
  for (const date of dates) {
    await recalculate(employeeId, date);
  }
}

export async function recalculateLeaveDateRange(
  employeeId: string,
  from: Date,
  to: Date,
  recalculate: (employeeId: string, date: Date) => Promise<unknown>,
) {
  const dates = eachDateInRange(from, to);
  for (const date of dates) {
    await recalculate(employeeId, date);
  }
}
