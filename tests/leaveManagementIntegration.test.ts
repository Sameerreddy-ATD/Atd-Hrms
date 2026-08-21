/**
 * Leave Management Foundation — DB integration matrix.
 * RUN_LEAVE_INTEGRATION=1 DATABASE_URL=... npx vitest run tests/leaveManagementIntegration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LeaveSession, PrismaClient } from "@prisma/client";
import {
  leaveSessionsOverlap,
  validateLeaveApplication,
  syncEmployeeLeaveBalances,
  LEAVE_CODES,
} from "../server/src/leavePolicy.js";
import { billableLeaveDates, LEAVE_HOLIDAY_POLICY_CONFIRMATION_REQUIRED } from "../server/src/leaveCalendar.js";
import { recordLeaveHistory, LeaveHistoryAction } from "../server/src/leaveApprovalHistory.js";
import {
  classifyAttendanceWorkday,
} from "../server/src/attendanceClassification.js";
import { getOrCreateAttendanceWorkday, recordPunchIn, istWallTimeToUtc } from "../server/src/attendanceWorkday.js";
import { assignDefaultShift, createShiftTemplate } from "../server/src/shiftRoster.js";
import { WorkdayAttendanceResult } from "../server/src/attendanceExceptionPolicy.js";
import { startOfDayUtc } from "../server/src/attendanceDayRules.js";

const enabled = process.env.RUN_LEAVE_INTEGRATION === "1";
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let employeeId = "";
let managerId = "";
let branchId = "";
let casualTypeId = "";
let inactiveTypeId = "";
let generalShiftId = "";

const tomorrow = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 2); // +2 avoids IST edge vs “tomorrow”
  // Prefer a weekday
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d;
};

describe.skipIf(!enabled)("leave management foundation DB integration", () => {
  beforeAll(async () => {
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
    const mgr = await prisma.employee.create({
      data: {
        employeeCode: `LVM_${stamp}`.slice(0, 20),
        name: "Leave Manager",
        departmentId: org.departmentId,
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    managerId = mgr.employeeId;
    await prisma.department.update({
      where: { departmentId: org.departmentId },
      data: { headEmployeeId: managerId },
    });
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `LVE_${stamp}`.slice(0, 20),
        name: "Leave Employee",
        departmentId: org.departmentId,
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
        joiningDate: new Date("2025-01-05T00:00:00.000Z"),
        weeklyOffPolicy: "SUNDAY_FIXED",
      },
    });
    employeeId = emp.employeeId;

    const casual = await prisma.leaveType.findFirst({ where: { code: LEAVE_CODES.CASUAL } });
    if (!casual) throw new Error("CASUAL leave type missing — seed required");
    casualTypeId = casual.leaveTypeId;

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
    await assignDefaultShift({
      employeeId,
      shiftId: generalShiftId,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    });

    await syncEmployeeLeaveBalances(employeeId);
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1 active Leave Type exists (CASUAL)", async () => {
    const t = await prisma.leaveType.findFirst({ where: { leaveTypeId: casualTypeId, active: true } });
    expect(t).toBeTruthy();
  });

  it("2 inactive type blocked for new requests", async () => {
    const day = tomorrow();
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

  it("3 stable unique code", async () => {
    await expect(
      prisma.leaveType.create({
        data: { name: `Dup ${stamp}`, code: LEAVE_CODES.CASUAL, paid: true },
      }),
    ).rejects.toThrow();
  });

  it("4 policy fields configurable on LeaveType", async () => {
    const updated = await prisma.leaveType.update({
      where: { leaveTypeId: casualTypeId },
      data: { halfDayAllowed: true, minNoticeDays: null },
    });
    expect(updated.halfDayAllowed).toBe(true);
  });

  it("5–7 full / first-half / second-half overlap rules", () => {
    expect(leaveSessionsOverlap(LeaveSession.FULL, LeaveSession.FIRST_HALF)).toBe(true);
    expect(leaveSessionsOverlap(LeaveSession.FIRST_HALF, LeaveSession.SECOND_HALF)).toBe(false);
    expect(leaveSessionsOverlap(LeaveSession.FIRST_HALF, LeaveSession.FIRST_HALF)).toBe(true);
  });

  it("8 half-day blocked when policy disabled", async () => {
    await prisma.leaveType.update({
      where: { leaveTypeId: casualTypeId },
      data: { halfDayAllowed: false },
    });
    const day = tomorrow();
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

  it("9–11 overlapping full-day and pending handled", async () => {
    const day = tomorrow();
    const created = await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 1,
        session: LeaveSession.FULL,
        reason: "overlap fixture",
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

    // first + second half may both be valid when no FULL pending — clean then test
    await prisma.leaveRequest.update({
      where: { leaveRequestId: created.leaveRequestId },
      data: { status: "WITHDRAWN" },
    });
    const first = await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 0.5,
        session: LeaveSession.FIRST_HALF,
        reason: "am",
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
    await prisma.leaveRequest.update({
      where: { leaveRequestId: first.leaveRequestId },
      data: { status: "WITHDRAWN" },
    });
  });

  it("12–17 balance server-side + ledger adjustment + history", async () => {
    const before = await syncEmployeeLeaveBalances(employeeId);
    const casual = before.find((b) => b.leaveType.code === LEAVE_CODES.CASUAL);
    expect(casual).toBeTruthy();
    expect(Number(casual!.balance)).toBeGreaterThanOrEqual(0);

    const day = tomorrow();
    day.setUTCDate(day.getUTCDate() + 3);
    while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);

    const req = await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: day,
        toDate: day,
        days: 1,
        session: LeaveSession.FULL,
        reason: "balance consume",
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
    const afterApprove = await syncEmployeeLeaveBalances(employeeId);
    const used = afterApprove.find((b) => b.leaveType.code === LEAVE_CODES.CASUAL)!;
    expect(Number(used.used)).toBeGreaterThanOrEqual(1);

    await prisma.leaveRequest.update({
      where: { leaveRequestId: req.leaveRequestId },
      data: { status: "REJECTED" },
    });
    const afterReject = await syncEmployeeLeaveBalances(employeeId);
    // rejected must not keep consumption relative to approved path — used drops
    expect(Number(afterReject.find((b) => b.leaveType.code === LEAVE_CODES.CASUAL)!.used)).toBeLessThan(
      Number(used.used),
    );

    const adj = await prisma.leaveLedgerEntry.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        entryType: "ADJUSTMENT",
        amount: 1,
        balanceAfter: Number(casual!.balance) + 1,
        effectiveDate: startOfDayUtc(new Date()),
        referenceType: "MANUAL",
        referenceId: `adj_${stamp}`,
        note: "test adjustment",
      },
    });
    expect(adj.note).toBe("test adjustment");

    const history = await prisma.leaveApprovalHistory.findMany({
      where: { leaveRequestId: req.leaveRequestId },
    });
    expect(history.length).toBeGreaterThanOrEqual(1);
  });

  it("24–25 approved leave without punches is not Absent; punch+leave = conflict", async () => {
    const workDate = new Date("2026-08-21T00:00:00.000Z");
    await prisma.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: casualTypeId,
        fromDate: workDate,
        toDate: workDate,
        days: 1,
        session: LeaveSession.FULL,
        reason: "attendance leave fixture",
        status: "APPROVED",
        managerId,
      },
    });
    const wd = await getOrCreateAttendanceWorkday({ employeeId, workDate });
    const classified = await classifyAttendanceWorkday(wd.workdayId);
    expect(classified.classification.attendanceResult).not.toBe(WorkdayAttendanceResult.ABSENT);
    expect(
      [WorkdayAttendanceResult.PAID_LEAVE, WorkdayAttendanceResult.PENDING].includes(
        classified.classification.attendanceResult as never,
      ) || classified.classification.attendanceResult === WorkdayAttendanceResult.PAID_LEAVE,
    ).toBe(true);

    await recordPunchIn({
      employeeId,
      workDate,
      punchedAt: istWallTimeToUtc(workDate, 10, 0),
      source: "TEST",
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
        status: "APPROVED",
      },
    });
    expect(leaveStill).toBeGreaterThan(0);
  });

  it("28 holiday policy confirmation flag set", () => {
    expect(LEAVE_HOLIDAY_POLICY_CONFIRMATION_REQUIRED).toBe(true);
  });

  it("billableLeaveDates skips Sunday for SUNDAY_FIXED", async () => {
    // Find a Sunday and Monday in the future
    const sun = tomorrow();
    while (sun.getUTCDay() !== 0) sun.setUTCDate(sun.getUTCDate() + 1);
    const mon = new Date(sun);
    mon.setUTCDate(mon.getUTCDate() + 1);
    const dates = await billableLeaveDates(employeeId, sun, mon);
    expect(dates.every((d) => d.getUTCDay() !== 0)).toBe(true);
  });
});
