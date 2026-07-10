import { LeaveStatus } from "@prisma/client";
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

export function isSunday(date: Date) {
  return istDateParts(date).weekday === 0;
}

export function eachDateInRange(from: string | Date, to: string | Date) {
  const start = startOfDayUtc(from);
  const end = startOfDayUtc(to);
  const dates: Date[] = [];
  for (let cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(new Date(cursor));
  }
  return dates;
}

export async function findHolidayForEmployee(employeeId: string, eventDate: Date) {
  const employee = await prisma.employee.findUnique({
    where: { employeeId },
    select: { homeBranchId: true },
  });
  const branchId = employee?.homeBranchId ?? null;
  return prisma.holiday.findFirst({
    where: {
      status: "ACTIVE",
      date: eventDate,
      OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
    },
    orderBy: { branchId: "desc" },
  });
}

export async function findApprovedLeaveForDay(employeeId: string, eventDate: Date, paid: boolean) {
  return prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      fromDate: { lte: eventDate },
      toDate: { gte: eventDate },
      status: { in: APPROVED_LEAVE_STATUSES },
      leaveType: { paid },
    },
    include: { leaveType: true },
  });
}

export async function resolveNoEventStatus(
  employeeId: string,
  eventDate: Date,
): Promise<string> {
  const holiday = await findHolidayForEmployee(employeeId, eventDate);
  if (holiday) return `Holiday - ${holiday.name}`;

  if (isSunday(eventDate)) return "Week Off (Sunday)";

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
