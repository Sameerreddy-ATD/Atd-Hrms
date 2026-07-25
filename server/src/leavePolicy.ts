import { LeaveStatus, Prisma } from "@prisma/client";
import { HttpError } from "./errors.js";
import { prisma } from "./prisma.js";
import {
  eachDateInRange,
  istDateParts,
  startOfDayUtc,
  todayIstDate,
} from "./attendanceDayRules.js";

export const LEAVE_CODES = {
  CASUAL: "CASUAL",
  SICK: "SICK",
  LOP: "LOP",
  COMP_OFF: "COMP_OFF",
} as const;

const countedStatuses: LeaveStatus[] = ["PENDING", "APPROVED", "MANAGER_APPROVED", "HR_VERIFIED"];
const usedStatuses: LeaveStatus[] = ["APPROVED", "MANAGER_APPROVED", "HR_VERIFIED"];

function dateKey(date: Date) {
  return startOfDayUtc(date).toISOString().slice(0, 10);
}

function effectiveDays(request: { days: Prisma.Decimal; cancelledDates: unknown }) {
  const cancelled = Array.isArray(request.cancelledDates)
    ? request.cancelledDates.filter((value) => typeof value === "string").length
    : 0;
  return Math.max(0, Number(request.days) - cancelled);
}

export function monthsCredited(joiningDate: Date | null, now: Date) {
  if (!joiningDate) return 0;
  const joined = startOfDayUtc(joiningDate);
  const current = istDateParts(now);
  return Math.max(
    0,
    (current.year - joined.getUTCFullYear()) * 12 + (current.month - joined.getUTCMonth()),
  );
}

export function calendarYearRange(date: Date) {
  const year = istDateParts(date).year;
  return {
    year,
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

export async function syncEmployeeLeaveBalances(employeeId: string, now = new Date()) {
  const { year, start: yearStart, end: yearEnd } = calendarYearRange(now);
  const [employee, types, requests, compCredits, existingBalances] = await Promise.all([
    prisma.employee.findUniqueOrThrow({
      where: { employeeId },
      select: { joiningDate: true },
    }),
    prisma.leaveType.findMany({ where: { active: true } }),
    prisma.leaveRequest.findMany({
      where: { employeeId, status: { in: usedStatuses } },
      select: {
        leaveTypeId: true,
        fromDate: true,
        days: true,
        cancelledDates: true,
      },
    }),
    prisma.compOffCredit.count({
      where: {
        employeeId,
        consumedByLeaveRequestId: null,
        earnedDate: { gte: yearStart, lte: yearEnd },
      },
    }),
    prisma.leaveBalance.findMany({ where: { employeeId } }),
  ]);
  const existingByType = new Map(existingBalances.map((balance) => [balance.leaveTypeId, balance]));

  return Promise.all(
    types.map(async (type) => {
      const existing = existingByType.get(type.leaveTypeId);
      const resetsAnnually = type.code === LEAVE_CODES.SICK || type.code === LEAVE_CODES.COMP_OFF;
      const relevant = requests.filter(
        (request) =>
          request.leaveTypeId === type.leaveTypeId &&
          (!resetsAnnually || (request.fromDate >= yearStart && request.fromDate <= yearEnd)),
      );
      const used = relevant.reduce((total, request) => total + effectiveDays(request), 0);
      let entitled = 0;
      if (type.code === LEAVE_CODES.CASUAL) {
        entitled = monthsCredited(employee.joiningDate, now) * Number(type.monthlyCredit ?? 1);
      } else if (type.code === LEAVE_CODES.SICK) {
        entitled = Number(type.annualAllowance ?? 6);
      } else if (type.code === LEAVE_CODES.COMP_OFF) {
        entitled = compCredits + used;
      }
      const adjustment =
        type.code === LEAVE_CODES.COMP_OFF && existing?.calculationYear !== year
          ? 0
          : Number(existing?.manualAdjustment ?? 0);
      const balance = type.code === LEAVE_CODES.LOP ? 0 : entitled + adjustment - used;
      return prisma.leaveBalance.upsert({
        where: { employeeId_leaveTypeId: { employeeId, leaveTypeId: type.leaveTypeId } },
        create: {
          employeeId,
          leaveTypeId: type.leaveTypeId,
          entitled,
          used,
          balance,
          manualAdjustment: adjustment,
          calculationYear: resetsAnnually ? year : null,
        },
        update: {
          entitled,
          used,
          balance,
          manualAdjustment: adjustment,
          calculationYear: resetsAnnually ? year : null,
        },
        include: { leaveType: true },
      });
    }),
  );
}

function cancelledDateSet(cancelledDates: unknown) {
  return new Set(
    Array.isArray(cancelledDates)
      ? cancelledDates.filter((value): value is string => typeof value === "string")
      : [],
  );
}

function requestOverlapsDates(
  request: { fromDate: Date; toDate: Date; cancelledDates: unknown },
  dates: Date[],
) {
  const cancelled = cancelledDateSet(request.cancelledDates);
  return dates.some((date) => {
    const key = dateKey(date);
    if (cancelled.has(key)) return false;
    return startOfDayUtc(request.fromDate) <= date && date <= startOfDayUtc(request.toDate);
  });
}

export async function validateLeaveApplication(input: {
  employeeId: string;
  leaveTypeId: string;
  fromDate: Date;
  toDate: Date;
  days: number;
}) {
  const type = await prisma.leaveType.findFirst({
    where: { leaveTypeId: input.leaveTypeId, active: true },
  });
  if (!type) throw new HttpError(400, "Select a valid leave type");
  const dates = eachDateInRange(input.fromDate, input.toDate);
  if (!dates.length || dates.length !== input.days) {
    throw new HttpError(400, "Leave days do not match the selected date range");
  }
  const today = todayIstDate();
  if (startOfDayUtc(input.fromDate) < today)
    throw new HttpError(400, "Leave cannot start in the past");

  const overlappingCandidates = await prisma.leaveRequest.findMany({
    where: {
      employeeId: input.employeeId,
      status: { in: countedStatuses },
      fromDate: { lte: startOfDayUtc(input.toDate) },
      toDate: { gte: startOfDayUtc(input.fromDate) },
    },
    select: { fromDate: true, toDate: true, cancelledDates: true },
  });
  if (overlappingCandidates.some((request) => requestOverlapsDates(request, dates))) {
    throw new HttpError(400, "Another active leave request overlaps these dates");
  }

  if (
    type.code === LEAVE_CODES.COMP_OFF &&
    istDateParts(input.fromDate).year !== istDateParts(new Date()).year
  ) {
    throw new HttpError(400, "Comp Off must be used by December 31 of the year it was earned");
  }

  const balances = await syncEmployeeLeaveBalances(input.employeeId);
  const balance = balances.find((row) => row.leaveTypeId === type.leaveTypeId);
  if (type.code === LEAVE_CODES.SICK) {
    if (input.fromDate.getUTCMonth() !== input.toDate.getUTCMonth()) {
      throw new HttpError(400, "Sick Leave must be requested within one calendar month");
    }
    const monthStart = new Date(
      Date.UTC(input.fromDate.getUTCFullYear(), input.fromDate.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(input.fromDate.getUTCFullYear(), input.fromDate.getUTCMonth() + 1, 0),
    );
    const monthly = await prisma.leaveRequest.findMany({
      where: {
        employeeId: input.employeeId,
        leaveTypeId: type.leaveTypeId,
        status: { in: countedStatuses },
        fromDate: { gte: monthStart, lte: monthEnd },
      },
      select: { days: true, cancelledDates: true },
    });
    const monthUsed = monthly.reduce((total, request) => total + effectiveDays(request), 0);
    if (monthUsed + input.days > Number(type.maxPerMonth ?? 2)) {
      throw new HttpError(400, "A maximum of 2 Sick Leave days may be used in one month");
    }
    const { start: yearStart, end: yearEnd } = calendarYearRange(input.fromDate);
    const pendingYear = await prisma.leaveRequest.findMany({
      where: {
        employeeId: input.employeeId,
        leaveTypeId: type.leaveTypeId,
        status: "PENDING",
        fromDate: { gte: yearStart, lte: yearEnd },
      },
      select: { days: true, cancelledDates: true },
    });
    const pendingDays = pendingYear.reduce((total, request) => total + effectiveDays(request), 0);
    if (input.days > Number(balance?.balance ?? 0) - pendingDays) {
      throw new HttpError(400, "Sick Leave cannot exceed the available balance");
    }
  }
  if (type.code === LEAVE_CODES.COMP_OFF && input.days > Number(balance?.balance ?? 0)) {
    throw new HttpError(400, "Comp Off cannot exceed earned credits");
  }
  if (type.code === LEAVE_CODES.COMP_OFF && input.days !== 1) {
    throw new HttpError(400, "Use one Comp Off credit per request");
  }
  return { type, balances, dates };
}

export async function consumeCompOffCredits(
  employeeId: string,
  leaveRequestId: string,
  days: number,
  leaveDate: Date,
  client: Prisma.TransactionClient = prisma,
) {
  const { start, end } = calendarYearRange(leaveDate);
  const credits = await client.compOffCredit.findMany({
    where: { employeeId, consumedByLeaveRequestId: null, earnedDate: { gte: start, lte: end } },
    orderBy: { earnedDate: "asc" },
    take: days,
  });
  if (credits.length !== days)
    throw new HttpError(400, "Not enough Comp Off credits are available");
  const claimed = await client.compOffCredit.updateMany({
    where: {
      compOffCreditId: { in: credits.map((credit) => credit.compOffCreditId) },
      consumedByLeaveRequestId: null,
    },
    data: { consumedByLeaveRequestId: leaveRequestId },
  });
  if (claimed.count !== days) {
    throw new HttpError(409, "Comp Off credit was used by another request. Refresh and try again");
  }
}

export async function releaseCompOffCredits(leaveRequestId: string) {
  await prisma.compOffCredit.updateMany({
    where: { consumedByLeaveRequestId: leaveRequestId },
    data: { consumedByLeaveRequestId: null },
  });
}

export function medicalDocumentDueAt(toDate: Date) {
  const due = new Date(toDate);
  due.setUTCDate(due.getUTCDate() + 3);
  due.setUTCHours(18, 29, 59, 999);
  return due;
}

export function leavePolicyDescription(code: string) {
  if (code === LEAVE_CODES.CASUAL)
    return "1 day is credited on the first of every month beginning with the month after joining. Up to 12 days accrue yearly, unused credits carry forward, and the balance may become negative.";
  if (code === LEAVE_CODES.SICK)
    return "6 days are available each calendar year, with a maximum of 2 days per month. A shareable medical document link is due within 3 days after returning.";
  if (code === LEAVE_CODES.LOP)
    return "Unpaid Leave / LOP is recorded separately from paid leave credits.";
  return "Earned automatically after a completed work session on a listed company holiday. Use it by December 31 of the year earned; it expires at year end. Usage does not require approval.";
}
