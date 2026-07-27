import { LeaveLedgerEntryType, LeaveStatus, Prisma } from "@prisma/client";
import { HttpError } from "./errors.js";
import { prisma } from "./prisma.js";
import {
  eachDateInRange,
  istDateParts,
  startOfDayUtc,
  todayIstDate,
} from "./attendanceDayRules.js";
import { medicalDocumentDueAt48h, monthEndIst } from "./attendancePolicy.js";
import { activeEmployeeIdsExcludingDeveloperAdmin } from "./attendanceDayRules.js";

export const LEAVE_CODES = {
  CASUAL: "CASUAL",
  SICK: "SICK",
  LOP: "LOP",
  COMP_OFF: "COMP_OFF",
} as const;

const countedStatuses: LeaveStatus[] = ["PENDING", "APPROVED", "MANAGER_APPROVED", "HR_VERIFIED"];
const usedStatuses: LeaveStatus[] = ["APPROVED", "MANAGER_APPROVED", "HR_VERIFIED"];

export function projectedLeaveBalance(input: {
  currentBalance: number;
  leaveCode: string;
  status: LeaveStatus;
  requestedDays: number;
}) {
  if (input.leaveCode === LEAVE_CODES.LOP) return null;
  if (input.status === "PENDING" && input.leaveCode !== LEAVE_CODES.COMP_OFF) {
    return input.currentBalance - input.requestedDays;
  }
  return input.currentBalance;
}

function dateKey(date: Date) {
  return startOfDayUtc(date).toISOString().slice(0, 10);
}

function effectiveDays(request: { days: Prisma.Decimal; cancelledDates: unknown }) {
  const cancelled = Array.isArray(request.cancelledDates)
    ? request.cancelledDates.filter((value) => typeof value === "string").length
    : 0;
  // Half-day requests store days=0.5 with a single calendar date — cancelled dates wipe the whole request day.
  if (Number(request.days) < 1) {
    return cancelled > 0 ? 0 : Number(request.days);
  }
  return Math.max(0, Number(request.days) - cancelled);
}

/**
 * Casual Leave credits earned under joining-date + month-end rules.
 * Join on/before the 5th → first credit at end of joining month.
 * Join after the 5th → first credit at end of the following month.
 * Up to 12 new credits per calendar year; carry-forward is preserved via balance sync.
 */
export function casualLeaveCreditsEarned(joiningDate: Date | null, now: Date) {
  if (!joiningDate) return 0;
  const joined = startOfDayUtc(joiningDate);
  const joinDay = joined.getUTCDate();
  let firstYear = joined.getUTCFullYear();
  let firstMonth = joined.getUTCMonth();
  if (joinDay > 5) {
    firstMonth += 1;
    if (firstMonth > 11) {
      firstMonth = 0;
      firstYear += 1;
    }
  }

  const parts = istDateParts(now);
  const lastDay = new Date(Date.UTC(parts.year, parts.month + 1, 0)).getUTCDate();
  const includeCurrent = parts.day >= lastDay;
  let endYear = parts.year;
  let endMonth = parts.month;
  if (!includeCurrent) {
    endMonth -= 1;
    if (endMonth < 0) {
      endMonth = 11;
      endYear -= 1;
    }
  }

  return cappedCreditsByYear(firstYear, firstMonth, endYear, endMonth);
}

function cappedCreditsByYear(
  firstYear: number,
  firstMonth: number,
  endYear: number,
  endMonth: number,
) {
  let total = 0;
  let year = firstYear;
  let month = firstMonth;
  const yearCounts = new Map<number, number>();
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const used = yearCounts.get(year) ?? 0;
    if (used < 12) {
      yearCounts.set(year, used + 1);
      total += 1;
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return total;
}

/** @deprecated use casualLeaveCreditsEarned */
export function monthsCredited(joiningDate: Date | null, now: Date) {
  return casualLeaveCreditsEarned(joiningDate, now);
}

export function calendarYearRange(date: Date) {
  const year = istDateParts(date).year;
  return {
    year,
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

export async function appendLeaveLedger(input: {
  employeeId: string;
  leaveTypeId: string;
  entryType: LeaveLedgerEntryType;
  amount: number;
  balanceAfter: number;
  effectiveDate: Date;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  createdByUserId?: string;
  client?: Prisma.TransactionClient;
}) {
  const client = input.client ?? prisma;
  try {
    await client.leaveLedgerEntry.create({
      data: {
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        entryType: input.entryType,
        amount: input.amount,
        balanceAfter: input.balanceAfter,
        effectiveDate: startOfDayUtc(input.effectiveDate),
        referenceType: input.referenceType,
        referenceId: input.referenceId ?? `${input.entryType}-${dateKey(input.effectiveDate)}`,
        note: input.note,
        createdByUserId: input.createdByUserId,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return; // idempotent
    }
    throw error;
  }
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
        revokedAt: null,
        expiredAt: null,
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
        entitled = casualLeaveCreditsEarned(employee.joiningDate, now) * Number(type.monthlyCredit ?? 1);
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
  request: { fromDate: Date; toDate: Date; cancelledDates: unknown; days: Prisma.Decimal },
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
  session?: "FULL" | "FIRST_HALF" | "SECOND_HALF";
}) {
  const type = await prisma.leaveType.findFirst({
    where: { leaveTypeId: input.leaveTypeId, active: true },
  });
  if (!type) throw new HttpError(400, "Select a valid leave type");
  const session = input.session ?? "FULL";
  const dates = eachDateInRange(input.fromDate, input.toDate);
  if (!dates.length) throw new HttpError(400, "Select a valid date range");

  if (session !== "FULL") {
    if (dates.length !== 1 || input.days !== 0.5) {
      throw new HttpError(400, "Half-day leave must be a single date for 0.5 days");
    }
  } else if (dates.length !== input.days) {
    throw new HttpError(400, "Leave days do not match the selected date range");
  }

  const today = todayIstDate();
  if (type.code === LEAVE_CODES.SICK) {
    if (startOfDayUtc(input.fromDate) < today) {
      throw new HttpError(400, "Sick Leave cannot start in the past");
    }
  } else {
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (startOfDayUtc(input.fromDate) < tomorrow) {
      throw new HttpError(400, "This leave type must be requested at least one day in advance");
    }
  }

  const overlappingCandidates = await prisma.leaveRequest.findMany({
    where: {
      employeeId: input.employeeId,
      status: { in: countedStatuses },
      fromDate: { lte: startOfDayUtc(input.toDate) },
      toDate: { gte: startOfDayUtc(input.fromDate) },
    },
    select: { fromDate: true, toDate: true, cancelledDates: true, days: true },
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
  }

  if (type.code !== LEAVE_CODES.LOP) {
    const pendingSameType = await prisma.leaveRequest.findMany({
      where: {
        employeeId: input.employeeId,
        leaveTypeId: type.leaveTypeId,
        status: "PENDING",
      },
      select: { days: true, cancelledDates: true },
    });
    const pendingDays = pendingSameType.reduce((total, request) => total + effectiveDays(request), 0);
    if (input.days > Number(balance?.balance ?? 0) - pendingDays) {
      throw new HttpError(400, "This request would exceed the available paid leave balance");
    }
  }

  if (type.code === LEAVE_CODES.COMP_OFF && input.days !== 1) {
    throw new HttpError(400, "Use one Comp Off credit per request");
  }
  return { type, balances, dates, session };
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
    where: {
      employeeId,
      consumedByLeaveRequestId: null,
      revokedAt: null,
      expiredAt: null,
      earnedDate: { gte: start, lte: end },
    },
    orderBy: { earnedDate: "asc" },
    take: days,
  });
  if (credits.length !== days)
    throw new HttpError(400, "Not enough Comp Off credits are available");
  const claimed = await client.compOffCredit.updateMany({
    where: {
      compOffCreditId: { in: credits.map((credit) => credit.compOffCreditId) },
      consumedByLeaveRequestId: null,
      revokedAt: null,
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
  return medicalDocumentDueAt48h(toDate);
}

export function leavePolicyDescription(code: string) {
  if (code === LEAVE_CODES.CASUAL)
    return "1 day is credited at month-end. Joining on or before the 5th earns credit for the joining month; joining after the 5th starts the following month. Up to 12 days accrue yearly and unused credits carry forward with no cap.";
  if (code === LEAVE_CODES.SICK)
    return "6 days are available each calendar year (including mid-year joiners), with a maximum of 2 days per month. Upload a medical certificate to the secure vault within 48 hours after returning; reminders are sent at 24 hours and 2 hours before the deadline.";
  if (code === LEAVE_CODES.LOP)
    return "Unpaid Leave / LOP is recorded separately from paid leave credits.";
  return "Earned after a completed holiday work session of at least nine hours. One credit per holiday. Usage requires Reporting Head approval and expires on December 31 of the year earned.";
}

export async function runMonthEndCasualLeaveAccrual(now = new Date()) {
  const parts = istDateParts(now);
  const effective = startOfDayUtc(monthEndIst(parts.year, parts.month));
  const casual = await prisma.leaveType.findFirst({ where: { code: LEAVE_CODES.CASUAL } });
  if (!casual) return 0;
  const employeeIds = await activeEmployeeIdsExcludingDeveloperAdmin();
  let written = 0;
  for (const employeeId of employeeIds) {
    const before = await prisma.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId: { employeeId, leaveTypeId: casual.leaveTypeId } },
    });
    const balances = await syncEmployeeLeaveBalances(employeeId, now);
    const after = balances.find((row) => row.leaveTypeId === casual.leaveTypeId);
    const delta = Number(after?.entitled ?? 0) - Number(before?.entitled ?? 0);
    if (delta > 0) {
      await appendLeaveLedger({
        employeeId,
        leaveTypeId: casual.leaveTypeId,
        entryType: LeaveLedgerEntryType.ACCRUAL,
        amount: delta,
        balanceAfter: Number(after?.balance ?? 0),
        effectiveDate: effective,
        referenceType: "MONTH_END_ACCRUAL",
        referenceId: `${parts.year}-${parts.month + 1}`,
        note: "Month-end Casual Leave accrual",
      });
      written += 1;
    }
  }
  return written;
}

export async function runYearEndLeaveExpiry(year: number) {
  const { start, end } = calendarYearRange(new Date(Date.UTC(year, 6, 1)));
  const sick = await prisma.leaveType.findFirst({ where: { code: LEAVE_CODES.SICK } });
  const comp = await prisma.leaveType.findFirst({ where: { code: LEAVE_CODES.COMP_OFF } });
  let count = 0;

  const expiredCredits = await prisma.compOffCredit.updateMany({
    where: {
      earnedDate: { gte: start, lte: end },
      consumedByLeaveRequestId: null,
      revokedAt: null,
      expiredAt: null,
    },
    data: { expiredAt: end },
  });
  count += expiredCredits.count;

  if (comp) {
    await prisma.auditLog.create({
      data: {
        action: "comp_off_year_end_expiry",
        newValue: { year, expired: expiredCredits.count },
      },
    });
  }

  if (sick) {
    const employeeIds = await activeEmployeeIdsExcludingDeveloperAdmin();
    for (const employeeId of employeeIds) {
      const balances = await syncEmployeeLeaveBalances(employeeId, end);
      const row = balances.find((balance) => balance.leaveTypeId === sick.leaveTypeId);
      const remaining = Number(row?.balance ?? 0);
      if (remaining > 0) {
        await appendLeaveLedger({
          employeeId,
          leaveTypeId: sick.leaveTypeId,
          entryType: LeaveLedgerEntryType.EXPIRY,
          amount: -remaining,
          balanceAfter: 0,
          effectiveDate: end,
          referenceType: "YEAR_END_EXPIRY",
          referenceId: `SICK-${year}`,
          note: "Unused Sick Leave expired on December 31",
        });
        // Zero remaining by recording usage-equivalent through calculationYear rollover on next sync
        count += 1;
      }
    }
  }

  // Casual Leave carry-forward is automatic (no expiry); record a ledger snapshot for audit
  const casual = await prisma.leaveType.findFirst({ where: { code: LEAVE_CODES.CASUAL } });
  if (casual) {
    const employeeIds = await activeEmployeeIdsExcludingDeveloperAdmin();
    for (const employeeId of employeeIds) {
      const balances = await syncEmployeeLeaveBalances(employeeId, end);
      const row = balances.find((balance) => balance.leaveTypeId === casual.leaveTypeId);
      const remaining = Number(row?.balance ?? 0);
      if (remaining !== 0) {
        await appendLeaveLedger({
          employeeId,
          leaveTypeId: casual.leaveTypeId,
          entryType: LeaveLedgerEntryType.CARRY_FORWARD,
          amount: remaining,
          balanceAfter: remaining,
          effectiveDate: new Date(Date.UTC(year + 1, 0, 1)),
          referenceType: "YEAR_CARRY_FORWARD",
          referenceId: `CL-${year}`,
          note: "Casual Leave carried forward with no cap",
        });
      }
    }
  }

  return count;
}
