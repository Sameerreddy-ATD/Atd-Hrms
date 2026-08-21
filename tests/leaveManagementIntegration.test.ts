/**
 * Leave Management Foundation — DB integration matrix.
 * RUN_LEAVE_INTEGRATION=1 DATABASE_URL=... npx vitest run tests/leaveManagementIntegration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EventSource,
  EventType,
  LeaveSession,
  PrismaClient,
  Role,
} from "@prisma/client";
import {
  validateLeaveApplication,
  syncEmployeeLeaveBalances,
  LEAVE_CODES,
} from "../server/src/leavePolicy.js";
import {
  assertHalfDayAllowedForResolvedShift,
  billableLeaveDates,
  LEAVE_HOLIDAY_POLICY_CONFIRMATION_REQUIRED,
} from "../server/src/leaveCalendar.js";
import {
  getLeaveCalendarPolicy,
  setLeaveCalendarPolicy,
} from "../server/src/leaveCalendarPolicy.js";
import { recordLeaveHistory, LeaveHistoryAction } from "../server/src/leaveApprovalHistory.js";
import { classifyAttendanceWorkday } from "../server/src/attendanceClassification.js";
import {
  getOrCreateAttendanceWorkday,
  recordPunchIn,
  istWallTimeToUtc,
} from "../server/src/attendanceWorkday.js";
import {
  assignDefaultShift,
  createShiftTemplate,
  upsertDayOverride,
} from "../server/src/shiftRoster.js";
import { WorkdayAttendanceResult } from "../server/src/attendanceExceptionPolicy.js";
import { startOfDayUtc } from "../server/src/attendanceDayRules.js";

const enabled = process.env.RUN_LEAVE_INTEGRATION === "1";
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let employeeId = "";
let managerId = "";
let branchId = "";
let departmentId = "";
let employeeUserId = "";
let managerUserId = "";
let casualTypeId = "";
let casualCode = "";
let inactiveTypeId = "";
let generalShiftId = "";
let nightShiftId = "";
let splitShiftId = "";

/** Future weekday at least `daysAhead` from today (skips Sundays). */
function futureWeekday(daysAhead: number) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Past weekday at least `daysAgo` before today (skips Sundays) — settleable for leave classification. */
function pastWeekday(daysAgo: number) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

async function ensureCasualBalance(minBalance = 20) {
  await syncEmployeeLeaveBalances(employeeId);
  const row = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId: { employeeId, leaveTypeId: casualTypeId } },
  });
  if (!row || Number(row.balance) < minBalance) {
    const entitled = Number(row?.entitled ?? 0);
    const used = Number(row?.used ?? 0);
    const neededAdj = minBalance - (entitled - used);
    await prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId: { employeeId, leaveTypeId: casualTypeId } },
      create: {
        employeeId,
        leaveTypeId: casualTypeId,
        entitled,
        used,
        balance: entitled + Math.max(neededAdj, minBalance) - used,
        manualAdjustment: Math.max(neededAdj, minBalance),
      },
      update: { manualAdjustment: Math.max(neededAdj, minBalance) },
    });
    await syncEmployeeLeaveBalances(employeeId);
  }
}

describe.skipIf(!enabled)("leave management foundation DB integration", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for leave management integration tests");
    }

    const branch = await prisma.branch.create({
      data: {
        branchName: `LV Loc ${stamp}`,
        branchCode: `LV_${stamp}`.slice(0, 20).toUpperCase(),
        address: "A",
        addressLine1: "A",
        city: "Hyderabad",
        state: "TELANGANA",
        postalCode: "500001",
        country: "India",
        latitude: 17.4,
        longitude: 78.4,
        attendanceRadiusMeters: 250,
        locationType: "OFFICE",
        status: "ACTIVE",
      },
    });
    branchId = branch.branchId;

    const org = await prisma.department.create({
      data: {
        name: `LV Org ${stamp}`,
        unitCode: `lv_org_${stamp}`.slice(0, 40),
        unitType: "DIVISION",
        active: true,
      },
    });
    departmentId = org.departmentId;

    const mgr = await prisma.employee.create({
      data: {
        employeeCode: `LVM_${stamp}`.slice(0, 20),
        name: "Leave Manager",
        departmentId,
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    managerId = mgr.employeeId;
    await prisma.department.update({
      where: { departmentId },
      data: { headEmployeeId: managerId },
    });

    const emp = await prisma.employee.create({
      data: {
        employeeCode: `LVE_${stamp}`.slice(0, 20),
        name: "Leave Employee",
        departmentId,
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
        joiningDate: new Date("2025-01-05T00:00:00.000Z"),
        weeklyOffPolicy: "SUNDAY_FIXED",
      },
    });
    employeeId = emp.employeeId;

    const empUser = await prisma.user.create({
      data: {
        employeeId,
        name: emp.name,
        email: `lv-emp-${stamp}@test.local`,
        role: Role.EMPLOYEE,
        passwordHash: "x",
        firstLoginPasswordChangeRequired: false,
      },
    });
    employeeUserId = empUser.id;

    const mgrUser = await prisma.user.create({
      data: {
        employeeId: managerId,
        name: mgr.name,
        email: `lv-mgr-${stamp}@test.local`,
        role: Role.MANAGER,
        passwordHash: "x",
        firstLoginPasswordChangeRequired: false,
      },
    });
    managerUserId = mgrUser.id;

    const casual = await prisma.leaveType.findFirst({ where: { code: LEAVE_CODES.CASUAL } });
    if (casual) {
      casualTypeId = casual.leaveTypeId;
      casualCode = casual.code;
      await prisma.leaveType.update({
        where: { leaveTypeId: casualTypeId },
        data: { halfDayAllowed: true, active: true },
      });
    } else {
      const created = await prisma.leaveType.create({
        data: {
          name: `Casual Leave ${stamp}`,
          code: `CASUAL_LV_${stamp}`.slice(0, 40).toUpperCase(),
          paid: true,
          active: true,
          halfDayAllowed: true,
          monthlyCredit: 1,
          carryForward: true,
        },
      });
      casualTypeId = created.leaveTypeId;
      casualCode = created.code;
    }

    const inactive = await prisma.leaveType.create({
      data: {
        name: `Inactive Type ${stamp}`,
        code: `INACT_${stamp}`.slice(0, 20).toUpperCase(),
        paid: true,
        active: false,
        halfDayAllowed: true,
      },
    });
    inactiveTypeId = inactive.leaveTypeId;

    const general = await createShiftTemplate({
      name: `LV General ${stamp}`,
      code: `LVG_${stamp}`.slice(0, 20).toUpperCase(),
      graceInMinutes: 30,
      segments: [{ startMinute: 570, endMinute: 1110, endDayOffset: 0 }],
    });
    generalShiftId = general.id;

    const night = await createShiftTemplate({
      name: `LV Night ${stamp}`,
      code: `LVN_${stamp}`.slice(0, 20).toUpperCase(),
      graceInMinutes: 30,
      segments: [{ startMinute: 22 * 60, endMinute: 3 * 60, endDayOffset: 1 }],
    });
    nightShiftId = night.id;

    const split = await createShiftTemplate({
      name: `LV Split ${stamp}`,
      code: `LVS_${stamp}`.slice(0, 20).toUpperCase(),
      graceInMinutes: 30,
      segments: [
        { startMinute: 540, endMinute: 780, endDayOffset: 0 },
        { startMinute: 17 * 60, endMinute: 21 * 60, endDayOffset: 0 },
      ],
    });
    splitShiftId = split.id;

    await assignDefaultShift({
      employeeId,
      shiftId: generalShiftId,
      effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
    });

    await setLeaveCalendarPolicy({
      holidayConsumesBalance: true,
      weeklyOffConsumesBalance: false,
    });

    await ensureCasualBalance(30);
  }, 120_000);

  afterAll(async () => {
    await setLeaveCalendarPolicy({
      holidayConsumesBalance: true,
      weeklyOffConsumesBalance: false,
    }).catch(() => undefined);
    await prisma.$disconnect();
  });

  // ── Leave Types / Policies ──────────────────────────────────────────────

  it("active leave type exists", async () => {
    const t = await prisma.leaveType.findFirst({
      where: { leaveTypeId: casualTypeId, active: true },
    });
    expect(t).toBeTruthy();
    expect(t!.code).toBe(casualCode);
  });

  it("inactive type blocked for new requests", async () => {
    const day = futureWeekday(3);
    await expect(
      validateLeaveApplication({
        employeeId,
        leaveTypeId: inactiveTypeId,
        fromDate: day,
        toDate: day,
        days: 1,
        session: LeaveSession.FULL,
      }),
    ).rejects.toThrow(/valid leave type/i);
  });

  it("unique stable leave type code", async () => {
    await expect(
      prisma.leaveType.create({
        data: { name: `Dup ${stamp}`, code: casualCode, paid: true },
      }),
    ).rejects.toThrow();
  });

  it("policy field halfDayAllowed toggle works", async () => {
    const off = await prisma.leaveType.update({
      where: { leaveTypeId: casualTypeId },
      data: { halfDayAllowed: false },
    });
    expect(off.halfDayAllowed).toBe(false);
    const on = await prisma.leaveType.update({
      where: { leaveTypeId: casualTypeId },
      data: { halfDayAllowed: true },
    });
    expect(on.halfDayAllowed).toBe(true);
  });

  it("getLeaveCalendarPolicy defaults: holiday consumes, weekly off does not", async () => {
    await setLeaveCalendarPolicy({
      holidayConsumesBalance: true,
      weeklyOffConsumesBalance: false,
    });
    const policy = await getLeaveCalendarPolicy();
    expect(policy.holidayConsumesBalance).toBe(true);
    expect(policy.weeklyOffConsumesBalance).toBe(false);
    expect(LEAVE_HOLIDAY_POLICY_CONFIRMATION_REQUIRED).toBe(true);
  });

  it("setLeaveCalendarPolicy flips holiday consume; billableLeaveDates respects it", async () => {
    const holidayDate = futureWeekday(40);
    while (holidayDate.getUTCDay() === 0) holidayDate.setUTCDate(holidayDate.getUTCDate() + 1);

    await prisma.holiday.create({
      data: {
        name: `LV Holiday ${stamp}`,
        date: holidayDate,
        type: "PUBLIC",
        status: "ACTIVE",
        description: "leave calendar policy fixture",
      },
    });

    await setLeaveCalendarPolicy({ holidayConsumesBalance: true });
    const withConsume = await billableLeaveDates(employeeId, holidayDate, holidayDate);
    expect(withConsume.some((d) => d.getTime() === startOfDayUtc(holidayDate).getTime())).toBe(
      true,
    );

    await setLeaveCalendarPolicy({ holidayConsumesBalance: false });
    const withoutConsume = await billableLeaveDates(employeeId, holidayDate, holidayDate);
    expect(withoutConsume.some((d) => d.getTime() === startOfDayUtc(holidayDate).getTime())).toBe(
      false,
    );

    await setLeaveCalendarPolicy({ holidayConsumesBalance: true });
  });

  // ── Requests ────────────────────────────────────────────────────────────

  it("full day validateLeaveApplication", async () => {
    await ensureCasualBalance();
    const day = futureWeekday(5);
    const result = await validateLeaveApplication({
      employeeId,
      leaveTypeId: casualTypeId,
      fromDate: day,
      toDate: day,
      days: 1,
      session: LeaveSession.FULL,
    });
    expect(result.session).toBe(LeaveSession.FULL);
    expect(result.dates.length).toBe(1);
  });

  it("first half validateLeaveApplication", async () => {
    await ensureCasualBalance();
    await prisma.leaveType.update({
      where: { leaveTypeId: casualTypeId },
      data: { halfDayAllowed: true },
    });
    const day = futureWeekday(6);
    const result = await validateLeaveApplication({
      employeeId,
      leaveTypeId: casualTypeId,
      fromDate: day,
      toDate: day,
      days: 0.5,
      session: LeaveSession.FIRST_HALF,
    });
    expect(result.session).toBe(LeaveSession.FIRST_HALF);
  });

  it("second half validateLeaveApplication", async () => {
    await ensureCasualBalance();
    const day = futureWeekday(7);
    const result = await validateLeaveApplication({
      employeeId,
      leaveTypeId: casualTypeId,
      fromDate: day,
      toDate: day,
      days: 0.5,
      session: LeaveSession.SECOND_HALF,
    });
    expect(result.session).toBe(LeaveSession.SECOND_HALF);
  });

  it("half-day disabled on type rejects", async () => {
    await prisma.leaveType.update({
      where: { leaveTypeId: casualTypeId },
      data: { halfDayAllowed: false },
    });
    const day = futureWeekday(8);
    await expect(
      validateLeaveApplication({
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 0.5,
        session: LeaveSession.FIRST_HALF,
      }),
    ).rejects.toThrow(/Half-day leave is not allowed/i);
    await prisma.leaveType.update({
      where: { leaveTypeId: casualTypeId },
      data: { halfDayAllowed: true },
    });
  });

  it("overlapping approved rejected", async () => {
    await ensureCasualBalance();
    const day = futureWeekday(10);
    await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 1,
        session: LeaveSession.FULL,
        reason: "approved overlap fixture",
        status: "APPROVED",
        managerId,
      },
    });
    await expect(
      validateLeaveApplication({
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 1,
        session: LeaveSession.FULL,
      }),
    ).rejects.toThrow(/overlaps/i);
  });

  it("overlapping pending rejected", async () => {
    await ensureCasualBalance();
    const day = futureWeekday(11);
    await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 1,
        session: LeaveSession.FULL,
        reason: "pending overlap fixture",
        status: "PENDING",
        managerId,
      },
    });
    await expect(
      validateLeaveApplication({
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 1,
        session: LeaveSession.FULL,
      }),
    ).rejects.toThrow(/overlaps/i);
  });

  it("first-half + second-half compatible (both valid)", async () => {
    await ensureCasualBalance();
    await prisma.leaveType.update({
      where: { leaveTypeId: casualTypeId },
      data: { halfDayAllowed: true },
    });
    const day = futureWeekday(12);
    await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 0.5,
        session: LeaveSession.FIRST_HALF,
        reason: "am half",
        status: "PENDING",
        managerId,
      },
    });
    await expect(
      validateLeaveApplication({
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 0.5,
        session: LeaveSession.SECOND_HALF,
      }),
    ).resolves.toBeTruthy();
  });

  it("split-shift half-day REJECTED via assertHalfDayAllowedForResolvedShift / validateLeaveApplication", async () => {
    await ensureCasualBalance();
    await prisma.leaveType.update({
      where: { leaveTypeId: casualTypeId },
      data: { halfDayAllowed: true },
    });
    const day = futureWeekday(14);
    await upsertDayOverride({
      employeeId,
      workDate: day,
      shiftId: splitShiftId,
      reason: "split half-day leave fixture",
    });

    await expect(assertHalfDayAllowedForResolvedShift(employeeId, day)).rejects.toThrow(
      /split shifts|Half-day leave is not available/i,
    );
    await expect(
      validateLeaveApplication({
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 0.5,
        session: LeaveSession.FIRST_HALF,
      }),
    ).rejects.toThrow(/split shifts|Half-day leave is not available/i);
  });

  // ── Balances ────────────────────────────────────────────────────────────

  it("syncEmployeeLeaveBalances returns entitled/used/balance", async () => {
    const balances = await syncEmployeeLeaveBalances(employeeId);
    const casual = balances.find((b) => b.leaveTypeId === casualTypeId);
    expect(casual).toBeTruthy();
    expect(typeof Number(casual!.entitled)).toBe("number");
    expect(typeof Number(casual!.used)).toBe("number");
    expect(typeof Number(casual!.balance)).toBe("number");
    expect(Number(casual!.entitled)).toBeGreaterThanOrEqual(0);
  });

  it("pending reserves used", async () => {
    await ensureCasualBalance();
    const before = await syncEmployeeLeaveBalances(employeeId);
    const usedBefore = Number(before.find((b) => b.leaveTypeId === casualTypeId)!.used);
    const day = futureWeekday(16);
    await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 1,
        session: LeaveSession.FULL,
        reason: "pending reserve",
        status: "PENDING",
        managerId,
      },
    });
    const after = await syncEmployeeLeaveBalances(employeeId);
    expect(Number(after.find((b) => b.leaveTypeId === casualTypeId)!.used)).toBe(usedBefore + 1);
  });

  it("APPROVED consumption", async () => {
    await ensureCasualBalance();
    const before = await syncEmployeeLeaveBalances(employeeId);
    const usedBefore = Number(before.find((b) => b.leaveTypeId === casualTypeId)!.used);
    const day = futureWeekday(17);
    const req = await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 1,
        session: LeaveSession.FULL,
        reason: "approved consume",
        status: "APPROVED",
        managerId,
      },
    });
    await recordLeaveHistory({
      leaveRequestId: req.leaveRequestId,
      action: LeaveHistoryAction.APPROVED,
      fromStatus: "PENDING",
      toStatus: "APPROVED",
    });
    const after = await syncEmployeeLeaveBalances(employeeId);
    expect(Number(after.find((b) => b.leaveTypeId === casualTypeId)!.used)).toBe(usedBefore + 1);
  });

  it("REJECTED restores (no consumption)", async () => {
    await ensureCasualBalance();
    const day = futureWeekday(18);
    const req = await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 1,
        session: LeaveSession.FULL,
        reason: "reject restore",
        status: "PENDING",
        managerId,
      },
    });
    const whilePending = await syncEmployeeLeaveBalances(employeeId);
    const usedPending = Number(whilePending.find((b) => b.leaveTypeId === casualTypeId)!.used);

    await prisma.leaveRequest.update({
      where: { leaveRequestId: req.leaveRequestId },
      data: { status: "REJECTED" },
    });
    const afterReject = await syncEmployeeLeaveBalances(employeeId);
    expect(Number(afterReject.find((b) => b.leaveTypeId === casualTypeId)!.used)).toBe(
      usedPending - 1,
    );
  });

  it("CANCELLED / WITHDRAWN restore", async () => {
    await ensureCasualBalance();
    const dayCancel = futureWeekday(19);
    const dayWithdraw = futureWeekday(20);

    const cancelReq = await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: dayCancel,
        toDate: dayCancel,
        days: 1,
        session: LeaveSession.FULL,
        reason: "cancel restore",
        status: "APPROVED",
        managerId,
      },
    });
    const afterApprove = await syncEmployeeLeaveBalances(employeeId);
    const usedAfterApprove = Number(
      afterApprove.find((b) => b.leaveTypeId === casualTypeId)!.used,
    );

    await prisma.leaveRequest.update({
      where: { leaveRequestId: cancelReq.leaveRequestId },
      data: { status: "CANCELLED" },
    });
    const afterCancel = await syncEmployeeLeaveBalances(employeeId);
    expect(Number(afterCancel.find((b) => b.leaveTypeId === casualTypeId)!.used)).toBe(
      usedAfterApprove - 1,
    );

    const withdrawReq = await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: dayWithdraw,
        toDate: dayWithdraw,
        days: 1,
        session: LeaveSession.FULL,
        reason: "withdraw restore",
        status: "PENDING",
        managerId,
      },
    });
    const whilePending = await syncEmployeeLeaveBalances(employeeId);
    const usedPending = Number(whilePending.find((b) => b.leaveTypeId === casualTypeId)!.used);

    await prisma.leaveRequest.update({
      where: { leaveRequestId: withdrawReq.leaveRequestId },
      data: { status: "WITHDRAWN" },
    });
    const afterWithdraw = await syncEmployeeLeaveBalances(employeeId);
    expect(Number(afterWithdraw.find((b) => b.leaveTypeId === casualTypeId)!.used)).toBe(
      usedPending - 1,
    );
  });

  it("LeaveLedgerEntry ADJUSTMENT with note", async () => {
    const balances = await syncEmployeeLeaveBalances(employeeId);
    const casual = balances.find((b) => b.leaveTypeId === casualTypeId)!;
    const adj = await prisma.leaveLedgerEntry.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        entryType: "ADJUSTMENT",
        amount: 1,
        balanceAfter: Number(casual.balance) + 1,
        effectiveDate: startOfDayUtc(new Date()),
        referenceType: "MANUAL",
        referenceId: `adj_${stamp}`,
        note: "test adjustment",
      },
    });
    expect(adj.entryType).toBe("ADJUSTMENT");
    expect(adj.note).toBe("test adjustment");
  });

  it("recordLeaveHistory preserved", async () => {
    const day = futureWeekday(21);
    const req = await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 1,
        session: LeaveSession.FULL,
        reason: "history fixture",
        status: "PENDING",
        managerId,
      },
    });
    await recordLeaveHistory({
      leaveRequestId: req.leaveRequestId,
      actorUserId: managerUserId,
      action: LeaveHistoryAction.SUBMITTED,
      fromStatus: null,
      toStatus: "PENDING",
      note: "submitted",
    });
    await recordLeaveHistory({
      leaveRequestId: req.leaveRequestId,
      actorUserId: managerUserId,
      action: LeaveHistoryAction.REJECTED,
      fromStatus: "PENDING",
      toStatus: "REJECTED",
      note: "history note kept",
    });
    const history = await prisma.leaveApprovalHistory.findMany({
      where: { leaveRequestId: req.leaveRequestId },
      orderBy: { createdAt: "asc" },
    });
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.some((h) => h.action === "REJECTED" && h.note === "history note kept")).toBe(
      true,
    );
  });

  // ── Attendance ──────────────────────────────────────────────────────────

  it("approved leave + no sessions → PAID_LEAVE (not ABSENT)", async () => {
    const workDate = pastWeekday(5);
    await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: workDate,
        toDate: workDate,
        days: 1,
        session: LeaveSession.FULL,
        reason: "attendance leave no punch",
        status: "APPROVED",
        managerId,
      },
    });
    const wd = await getOrCreateAttendanceWorkday(employeeId, workDate);
    const classified = await classifyAttendanceWorkday(wd.workdayId);
    expect(classified.classification.attendanceResult).toBe(WorkdayAttendanceResult.PAID_LEAVE);
    expect(classified.classification.attendanceResult).not.toBe(WorkdayAttendanceResult.ABSENT);
  });

  it("approved leave + punch → LEAVE_ATTENDANCE_CONFLICT; sessions > 0; leave still APPROVED", async () => {
    const workDate = pastWeekday(6);
    await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: workDate,
        toDate: workDate,
        days: 1,
        session: LeaveSession.FULL,
        reason: "attendance leave conflict",
        status: "APPROVED",
        managerId,
      },
    });
    const wd = await getOrCreateAttendanceWorkday(employeeId, workDate);
    await recordPunchIn({
      employeeId,
      punchAt: istWallTimeToUtc(workDate, 10 * 60),
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
      clientEventId: `lv-conflict-in-${stamp}`,
    });

    const eventCountBefore = await prisma.attendanceEvent.count({
      where: { employeeId },
    });

    const conflict = await classifyAttendanceWorkday(wd.workdayId);
    expect(conflict.classification.attendanceResult).toBe(
      WorkdayAttendanceResult.LEAVE_ATTENDANCE_CONFLICT,
    );

    const sessions = await prisma.attendanceSession.count({ where: { workdayId: wd.workdayId } });
    expect(sessions).toBeGreaterThan(0);

    const leaveStill = await prisma.leaveRequest.count({
      where: {
        employeeId,
        fromDate: workDate,
        toDate: workDate,
        status: "APPROVED",
      },
    });
    expect(leaveStill).toBeGreaterThan(0);

    const eventCountAfter = await prisma.attendanceEvent.count({
      where: { employeeId },
    });
    expect(eventCountAfter).toBe(eventCountBefore);
  });

  it("Night shift WorkDate leave: classify no punches → leave result", async () => {
    const workDate = pastWeekday(12);
    await upsertDayOverride({
      employeeId,
      workDate,
      shiftId: nightShiftId,
      reason: "night leave fixture",
    });
    await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: workDate,
        toDate: workDate,
        days: 1,
        session: LeaveSession.FULL,
        reason: "night shift leave",
        status: "APPROVED",
        managerId,
      },
    });
    // Fresh workday so snapshot picks night 22:00–03:00 override
    const existing = await prisma.attendanceWorkday.findUnique({
      where: { employeeId_workDate: { employeeId, workDate } },
    });
    if (existing) {
      await prisma.attendanceWorkday.update({
        where: { workdayId: existing.workdayId },
        data: { openSessionId: null },
      });
      await prisma.attendanceException.deleteMany({ where: { workdayId: existing.workdayId } });
      await prisma.attendanceSession.deleteMany({ where: { workdayId: existing.workdayId } });
      await prisma.attendanceEvent.updateMany({
        where: { workdayId: existing.workdayId },
        data: { workdayId: null, sessionId: null },
      });
      await prisma.attendanceWorkday.delete({ where: { workdayId: existing.workdayId } });
    }
    const wd = await getOrCreateAttendanceWorkday(employeeId, workDate);
    expect(wd.shiftTemplateId).toBe(nightShiftId);
    const classified = await classifyAttendanceWorkday(wd.workdayId);
    expect(classified.classification.attendanceResult).toBe(WorkdayAttendanceResult.PAID_LEAVE);
    expect(classified.classification.attendanceResult).not.toBe(WorkdayAttendanceResult.ABSENT);
  });

  it("NO_SHIFT day: day override NO_SHIFT → validateLeaveApplication rejects", async () => {
    const day = futureWeekday(22);
    await upsertDayOverride({
      employeeId,
      workDate: day,
      shiftId: null,
      reason: "explicit no shift leave block",
    });
    await expect(
      validateLeaveApplication({
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 1,
        session: LeaveSession.FULL,
      }),
    ).rejects.toThrow(/No Shift/i);
  });

  // ── Integrity markers ───────────────────────────────────────────────────

  it("integrity: sample User.role / department / branch still exist for fixtures", async () => {
    const empUser = await prisma.user.findUnique({ where: { id: employeeUserId } });
    const mgrUser = await prisma.user.findUnique({ where: { id: managerUserId } });
    expect(empUser?.role).toBe(Role.EMPLOYEE);
    expect(mgrUser?.role).toBe(Role.MANAGER);

    const dept = await prisma.department.findUnique({ where: { departmentId } });
    expect(dept).toBeTruthy();
    expect(dept!.name).toContain("LV Org");

    const branch = await prisma.branch.findUnique({ where: { branchId } });
    expect(branch).toBeTruthy();
    expect(branch!.branchName).toContain("LV Loc");

    const emp = await prisma.employee.findUnique({ where: { employeeId } });
    expect(emp?.departmentId).toBe(departmentId);
    expect(emp?.homeBranchId).toBe(branchId);
  });
});
