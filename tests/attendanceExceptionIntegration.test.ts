/**
 * Attendance exceptions + classification — DB integration.
 * RUN_ATTENDANCE_EXCEPTION_INTEGRATION=1 DATABASE_URL=... npx vitest run tests/attendanceExceptionIntegration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventSource, EventType, PrismaClient } from "@prisma/client";
import { assignDefaultShift, createShiftTemplate } from "../server/src/shiftRoster";
import {
  getOrCreateAttendanceWorkday,
  recordPunchIn,
  recordPunchOut,
  istWallTimeToUtc,
  applyCorrectionAttendanceEvent,
} from "../server/src/attendanceWorkday";
import { syncWorkdayExceptions } from "../server/src/attendanceExceptions";
import {
  classifyAttendanceWorkday,
  classifyAttendanceWorkdayInput,
} from "../server/src/attendanceClassification";
import {
  attendanceResultFromWorkedMinutes,
  FULL_DAY_WORKED_MINUTES,
  HALF_DAY_MIN_WORKED_MINUTES,
  MISSING_CHECKOUT_THRESHOLD_MINUTES,
} from "../server/src/attendanceExceptionPolicy";

const enabled = process.env.RUN_ATTENDANCE_EXCEPTION_INTEGRATION === "1";
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let employeeId = "";
let branchId = "";
let generalId = "";
let nightId = "";
let splitId = "";

const WD = new Date("2026-08-21T00:00:00.000Z");

describe.skipIf(!enabled)("attendance exceptions classification DB integration", () => {
  beforeAll(async () => {
    const branch = await prisma.branch.create({
      data: {
        branchName: `EX Loc ${stamp}`,
        branchCode: `EX_${stamp}`.slice(0, 20).toUpperCase(),
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
        name: `EX Org ${stamp}`,
        unitCode: `ex_org_${stamp}`.slice(0, 40),
        unitType: "DIVISION",
        active: true,
      },
    });
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `EX_${stamp}`.slice(0, 20),
        name: "Exception Tester",
        departmentId: org.departmentId,
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
        shiftStartMinutes: 540,
        shiftEndMinutes: 1080,
      },
    });
    employeeId = emp.employeeId;

    const general = await createShiftTemplate({
      name: `EX General ${stamp}`,
      code: `EXG_${stamp}`.slice(0, 20).toUpperCase(),
      graceInMinutes: 30,
      graceOutMinutes: 0,
      segments: [{ startMinute: 540, endMinute: 1080, endDayOffset: 0 }],
    });
    generalId = general.id;
    const night = await createShiftTemplate({
      name: `EX Night ${stamp}`,
      code: `EXN_${stamp}`.slice(0, 20).toUpperCase(),
      graceInMinutes: 30,
      segments: [{ startMinute: 22 * 60, endMinute: 3 * 60, endDayOffset: 1 }],
    });
    nightId = night.id;
    const split = await createShiftTemplate({
      name: `EX Split ${stamp}`,
      code: `EXS_${stamp}`.slice(0, 20).toUpperCase(),
      graceInMinutes: 30,
      segments: [
        { startMinute: 540, endMinute: 780, endDayOffset: 0 },
        { startMinute: 17 * 60, endMinute: 21 * 60, endDayOffset: 0 },
      ],
    });
    splitId = split.id;
    await assignDefaultShift({
      employeeId,
      shiftId: generalId,
      effectiveFrom: WD,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("worked minute bands", () => {
    expect(attendanceResultFromWorkedMinutes(239)).toBe("ABSENT");
    expect(attendanceResultFromWorkedMinutes(HALF_DAY_MIN_WORKED_MINUTES)).toBe("HALF_DAY");
    expect(attendanceResultFromWorkedMinutes(539)).toBe("HALF_DAY");
    expect(attendanceResultFromWorkedMinutes(FULL_DAY_WORKED_MINUTES)).toBe("FULL_DAY");
    expect(attendanceResultFromWorkedMinutes(600)).toBe("FULL_DAY");
  });

  it("9h closed → Full Day; open session → Pending; no synthetic OUT", async () => {
    const inAt = istWallTimeToUtc(WD, 540);
    const outAt = istWallTimeToUtc(WD, 540 + 540);
    await recordPunchIn({
      employeeId,
      punchAt: inAt,
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    let cur = await prisma.attendanceWorkday.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId, workDate: WD } },
      include: { sessions: true, exceptions: true },
    });
    const openClass = classifyAttendanceWorkdayInput({
      workday: cur,
      sessions: cur.sessions,
      exceptions: cur.exceptions,
      now: istWallTimeToUtc(WD, 600),
    });
    expect(openClass.attendanceResult).toBe("PENDING");
    expect(openClass.hasOpenSession).toBe(true);

    await recordPunchOut({
      employeeId,
      punchAt: outAt,
      eventType: EventType.OFFICE_OUT,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    const classified = await classifyAttendanceWorkday(
      (
        await prisma.attendanceWorkday.findUniqueOrThrow({
          where: { employeeId_workDate: { employeeId, workDate: WD } },
        })
      ).workdayId,
    );
    expect(classified.classification.attendanceResult).toBe("FULL_DAY");
    expect(classified.classification.closedWorkedMinutes).toBe(540);
    const events = await prisma.attendanceEvent.findMany({ where: { employeeId } });
    expect(events.every((e) => e.eventSource !== EventSource.SYSTEM)).toBe(true);
  });

  it("exactly 4h → Half Day; <4h → Absent", async () => {
    const emp2 = await prisma.employee.create({
      data: {
        employeeCode: `EX2_${stamp}`.slice(0, 20),
        name: "Half Absent",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    await assignDefaultShift({ employeeId: emp2.employeeId, shiftId: generalId, effectiveFrom: WD });
    await recordPunchIn({
      employeeId: emp2.employeeId,
      punchAt: istWallTimeToUtc(WD, 540),
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    await recordPunchOut({
      employeeId: emp2.employeeId,
      punchAt: istWallTimeToUtc(WD, 540 + 240),
      eventType: EventType.OFFICE_OUT,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    const half = await classifyAttendanceWorkday(
      (
        await prisma.attendanceWorkday.findUniqueOrThrow({
          where: { employeeId_workDate: { employeeId: emp2.employeeId, workDate: WD } },
        })
      ).workdayId,
    );
    expect(half.classification.attendanceResult).toBe("HALF_DAY");

    const emp3 = await prisma.employee.create({
      data: {
        employeeCode: `EX3_${stamp}`.slice(0, 20),
        name: "Absent Band",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    await assignDefaultShift({ employeeId: emp3.employeeId, shiftId: generalId, effectiveFrom: WD });
    await recordPunchIn({
      employeeId: emp3.employeeId,
      punchAt: istWallTimeToUtc(WD, 540),
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    await recordPunchOut({
      employeeId: emp3.employeeId,
      punchAt: istWallTimeToUtc(WD, 540 + 180),
      eventType: EventType.OFFICE_OUT,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    const absent = await classifyAttendanceWorkday(
      (
        await prisma.attendanceWorkday.findUniqueOrThrow({
          where: { employeeId_workDate: { employeeId: emp3.employeeId, workDate: WD } },
        })
      ).workdayId,
    );
    expect(absent.classification.attendanceResult).toBe("ABSENT");
  });

  it("missing checkout after threshold; not before; night shift next-day end", async () => {
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `EXN_${stamp}`.slice(0, 20),
        name: "Night Missing",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    await assignDefaultShift({ employeeId: emp.employeeId, shiftId: nightId, effectiveFrom: WD });
    await recordPunchIn({
      employeeId: emp.employeeId,
      punchAt: istWallTimeToUtc(WD, 22 * 60),
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    const workday = await prisma.attendanceWorkday.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId: emp.employeeId, workDate: WD } },
    });
    expect(workDateIsoSafe(workday.workDate)).toBe("2026-08-21");

    const before = new Date(
      workday.scheduledEndAt!.getTime() + (MISSING_CHECKOUT_THRESHOLD_MINUTES - 1) * 60_000,
    );
    await syncWorkdayExceptions(workday.workdayId, { now: before, detectMissing: true });
    let ex = await prisma.attendanceException.findMany({
      where: { workdayId: workday.workdayId, type: "MISSING_CHECK_OUT" },
    });
    expect(ex.length).toBe(0);

    const after = new Date(
      workday.scheduledEndAt!.getTime() + MISSING_CHECKOUT_THRESHOLD_MINUTES * 60_000,
    );
    await syncWorkdayExceptions(workday.workdayId, { now: after, detectMissing: true });
    ex = await prisma.attendanceException.findMany({
      where: { workdayId: workday.workdayId, type: "MISSING_CHECK_OUT" },
    });
    expect(ex.length).toBe(1);
    const classified = await classifyAttendanceWorkday(workday.workdayId, { now: after });
    expect(classified.classification.attendanceResult).toBe("CORRECTION_REQUIRED");
    expect(classified.classification.hasOpenSession).toBe(true);
    const session = await prisma.attendanceSession.findFirst({
      where: { workdayId: workday.workdayId, status: "OPEN" },
    });
    expect(session?.checkOutAt).toBeNull();
  });

  it("detector idempotent + concurrent unique", async () => {
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `EXD_${stamp}`.slice(0, 20),
        name: "Detector Race",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    await assignDefaultShift({ employeeId: emp.employeeId, shiftId: generalId, effectiveFrom: WD });
    await recordPunchIn({
      employeeId: emp.employeeId,
      punchAt: istWallTimeToUtc(WD, 550),
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    const workday = await prisma.attendanceWorkday.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId: emp.employeeId, workDate: WD } },
    });
    const now = new Date(
      workday.scheduledEndAt!.getTime() + MISSING_CHECKOUT_THRESHOLD_MINUTES * 60_000 + 60_000,
    );
    await Promise.all([
      syncWorkdayExceptions(workday.workdayId, { now, detectMissing: true }),
      syncWorkdayExceptions(workday.workdayId, { now, detectMissing: true }),
    ]);
    const count = await prisma.attendanceException.count({
      where: { workdayId: workday.workdayId, type: "MISSING_CHECK_OUT" },
    });
    expect(count).toBe(1);
  });

  it("late within grace not late; beyond grace exception; early checkout; no salary fields", async () => {
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `EXL_${stamp}`.slice(0, 20),
        name: "Late Early",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    await assignDefaultShift({ employeeId: emp.employeeId, shiftId: generalId, effectiveFrom: WD });
    await recordPunchIn({
      employeeId: emp.employeeId,
      punchAt: istWallTimeToUtc(WD, 540 + 29),
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    await recordPunchOut({
      employeeId: emp.employeeId,
      punchAt: istWallTimeToUtc(WD, 1080 - 60),
      eventType: EventType.OFFICE_OUT,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    const wd = await prisma.attendanceWorkday.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId: emp.employeeId, workDate: WD } },
    });
    await syncWorkdayExceptions(wd.workdayId, { detectMissing: false });
    const lateOk = await prisma.attendanceException.count({
      where: { workdayId: wd.workdayId, type: "LATE_CHECK_IN" },
    });
    expect(lateOk).toBe(0);
    const early = await prisma.attendanceException.count({
      where: { workdayId: wd.workdayId, type: "EARLY_CHECK_OUT" },
    });
    expect(early).toBe(1);

    const empLate = await prisma.employee.create({
      data: {
        employeeCode: `EXLL_${stamp}`.slice(0, 20),
        name: "Actually Late",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    await assignDefaultShift({
      employeeId: empLate.employeeId,
      shiftId: generalId,
      effectiveFrom: WD,
    });
    await recordPunchIn({
      employeeId: empLate.employeeId,
      punchAt: istWallTimeToUtc(WD, 540 + 31),
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    await recordPunchOut({
      employeeId: empLate.employeeId,
      punchAt: istWallTimeToUtc(WD, 1080),
      eventType: EventType.OFFICE_OUT,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    const wdLate = await prisma.attendanceWorkday.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId: empLate.employeeId, workDate: WD } },
    });
    await syncWorkdayExceptions(wdLate.workdayId, { detectMissing: false });
    expect(
      await prisma.attendanceException.count({
        where: { workdayId: wdLate.workdayId, type: "LATE_CHECK_IN" },
      }),
    ).toBe(1);
  });

  it("approved missing checkout correction reconciles; reject leaves evidence", async () => {
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `EXC_${stamp}`.slice(0, 20),
        name: "Correction Path",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    await assignDefaultShift({ employeeId: emp.employeeId, shiftId: generalId, effectiveFrom: WD });
    const inAt = istWallTimeToUtc(WD, 545);
    await recordPunchIn({
      employeeId: emp.employeeId,
      punchAt: inAt,
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    const workday = await prisma.attendanceWorkday.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId: emp.employeeId, workDate: WD } },
    });
    const after = new Date(
      workday.scheduledEndAt!.getTime() + MISSING_CHECKOUT_THRESHOLD_MINUTES * 60_000,
    );
    await syncWorkdayExceptions(workday.workdayId, { now: after, detectMissing: true });
    const beforeEvents = await prisma.attendanceEvent.findMany({
      where: { employeeId: emp.employeeId },
      orderBy: { eventTime: "asc" },
    });
    expect(beforeEvents).toHaveLength(1);

    const outAt = istWallTimeToUtc(WD, 18 * 60 + 5);
    await applyCorrectionAttendanceEvent({
      employeeId: emp.employeeId,
      eventType: EventType.OFFICE_OUT,
      punchAt: outAt,
      branchId,
      remarks: "approved missing out",
    });
    const afterEvents = await prisma.attendanceEvent.findMany({
      where: { employeeId: emp.employeeId },
      orderBy: { eventTime: "asc" },
    });
    expect(afterEvents).toHaveLength(2);
    expect(afterEvents[0]!.eventId).toBe(beforeEvents[0]!.eventId);
    expect(afterEvents[0]!.eventTime.getTime()).toBe(beforeEvents[0]!.eventTime.getTime());
    const session = await prisma.attendanceSession.findFirstOrThrow({
      where: { workdayId: workday.workdayId },
    });
    expect(session.status).toBe("CLOSED");
    expect(session.checkOutAt?.getTime()).toBe(outAt.getTime());
    const classified = await classifyAttendanceWorkday(workday.workdayId);
    expect(classified.classification.hasOpenSession).toBe(false);
    expect(["FULL_DAY", "HALF_DAY", "ABSENT"]).toContain(
      classified.classification.attendanceResult,
    );
  });

  it("split final end; gaps excluded; cutover-like open session fixture", async () => {
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `EXS_${stamp}`.slice(0, 20),
        name: "Split Cutover",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    await assignDefaultShift({ employeeId: emp.employeeId, shiftId: splitId, effectiveFrom: WD });
    await recordPunchIn({
      employeeId: emp.employeeId,
      punchAt: istWallTimeToUtc(WD, 545),
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    await recordPunchOut({
      employeeId: emp.employeeId,
      punchAt: istWallTimeToUtc(WD, 780),
      eventType: EventType.OFFICE_OUT,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    await recordPunchIn({
      employeeId: emp.employeeId,
      punchAt: istWallTimeToUtc(WD, 17 * 60 + 5),
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    const workday = await prisma.attendanceWorkday.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId: emp.employeeId, workDate: WD } },
      include: { sessions: true },
    });
    expect(workday.scheduledEndAt?.getTime()).toBe(istWallTimeToUtc(WD, 21 * 60).getTime());
    const closed = workday.sessions
      .filter((s) => s.status === "CLOSED")
      .reduce((a, s) => a + (s.workedMinutes ?? 0), 0);
    expect(closed).toBeGreaterThan(0);
    // Gap between 13:00 and 17:05 must not inflate closed minutes beyond first session length
    expect(closed).toBeLessThanOrEqual(780 - 545 + 5);

    // Pre-existing open session (cutover style) — detector must not fabricate OUT
    const after = new Date(
      workday.scheduledEndAt!.getTime() + MISSING_CHECKOUT_THRESHOLD_MINUTES * 60_000,
    );
    await syncWorkdayExceptions(workday.workdayId, { now: after, detectMissing: true });
    const open = await prisma.attendanceSession.findFirst({
      where: { workdayId: workday.workdayId, status: "OPEN" },
    });
    expect(open?.checkOutAt).toBeNull();
    expect(open?.checkOutEventId).toBeNull();
  });

  it("explicit NO_SHIFT / NONE → Unscheduled; raw fields preserved", async () => {
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `EXU_${stamp}`.slice(0, 20),
        name: "Unscheduled",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    const { upsertRosterAssignment } = await import("../server/src/shiftRoster");
    await upsertRosterAssignment({
      employeeId: emp.employeeId,
      workDate: WD,
      shiftId: null,
    });
    await recordPunchIn({
      employeeId: emp.employeeId,
      punchAt: istWallTimeToUtc(WD, 600),
      eventType: EventType.FIELD_CHECK_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { locationMode: "MOBILE_FIELD", latitude: 17.4, longitude: 78.4 },
    });
    await recordPunchOut({
      employeeId: emp.employeeId,
      punchAt: istWallTimeToUtc(WD, 700),
      eventType: EventType.FIELD_CHECK_OUT,
      eventSource: EventSource.MOBILE_GPS,
      location: { locationMode: "MOBILE_FIELD", latitude: 17.4, longitude: 78.4 },
    });
    const workday = await prisma.attendanceWorkday.findFirstOrThrow({
      where: { employeeId: emp.employeeId },
    });
    expect(workday.explicitNoShift).toBe(true);
    const classified = await classifyAttendanceWorkday(workday.workdayId);
    expect(classified.classification.attendanceResult).toBe("UNSCHEDULED");
    const ev = await prisma.attendanceEvent.findMany({ where: { employeeId: emp.employeeId } });
    expect(ev.every((e) => e.eventTime != null)).toBe(true);
  });
});

function workDateIsoSafe(d: Date) {
  return d.toISOString().slice(0, 10);
}
