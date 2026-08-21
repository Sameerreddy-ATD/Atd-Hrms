/**
 * Company default General Shift — DB integration.
 * RUN_COMPANY_DEFAULT_INTEGRATION=1 DATABASE_URL=... npx vitest run tests/companyDefaultShiftIntegration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventSource, EventType, PrismaClient } from "@prisma/client";
import {
  assignDefaultShift,
  createShiftTemplate,
  resolveEmployeeShiftForWorkDate,
  upsertDayOverride,
  upsertRosterAssignment,
} from "../server/src/shiftRoster";
import {
  ensureCompanyDefaultShiftConfigured,
  getCompanyDefaultShiftId,
  setCompanyDefaultShiftId,
  CANONICAL_GENERAL_SHIFT_ID,
  CANONICAL_GENERAL_EXPECTED_MINUTES,
} from "../server/src/attendanceCompanyDefault";
import {
  getOrCreateAttendanceWorkday,
  recordPunchIn,
  recordPunchOut,
  istWallTimeToUtc,
} from "../server/src/attendanceWorkday";
import { classifyAttendanceWorkday } from "../server/src/attendanceClassification";
import {
  attendanceResultFromWorkedMinutes,
  MISSING_CHECKOUT_THRESHOLD_MINUTES,
} from "../server/src/attendanceExceptionPolicy";
import { syncWorkdayExceptions } from "../server/src/attendanceExceptions";

const enabled = process.env.RUN_COMPANY_DEFAULT_INTEGRATION === "1";
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let employeeId = "";
let branchId = "";
let earlyId = "";
let eveningId = "";
let nightId = "";
let splitId = "";
let companyShiftId = "";

const AUG18 = new Date("2026-08-18T00:00:00.000Z");
const AUG19 = new Date("2026-08-19T00:00:00.000Z");
const AUG20 = new Date("2026-08-20T00:00:00.000Z");
const AUG21 = new Date("2026-08-21T00:00:00.000Z");
const AUG22 = new Date("2026-08-22T00:00:00.000Z");

describe.skipIf(!enabled)("company default General Shift DB integration", () => {
  beforeAll(async () => {
    const ensured = await ensureCompanyDefaultShiftConfigured();
    companyShiftId = ensured.shiftId;
    expect(await getCompanyDefaultShiftId()).toBe(companyShiftId);

    const branch = await prisma.branch.create({
      data: {
        branchName: `CD Loc ${stamp}`,
        branchCode: `CD_${stamp}`.slice(0, 20).toUpperCase(),
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
        name: `CD Org ${stamp}`,
        unitCode: `cd_org_${stamp}`.slice(0, 40),
        unitType: "DIVISION",
        active: true,
      },
    });
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `CD_${stamp}`.slice(0, 20),
        name: "Company Default Tester",
        departmentId: org.departmentId,
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    employeeId = emp.employeeId;

    earlyId = (
      await createShiftTemplate({
        name: `CD Early ${stamp}`,
        code: `CDE_${stamp}`.slice(0, 20).toUpperCase(),
        graceInMinutes: 30,
        segments: [{ startMinute: 360, endMinute: 900, endDayOffset: 0 }],
      })
    ).id;
    eveningId = (
      await createShiftTemplate({
        name: `CD Evening ${stamp}`,
        code: `CDV_${stamp}`.slice(0, 20).toUpperCase(),
        graceInMinutes: 30,
        segments: [{ startMinute: 840, endMinute: 1380, endDayOffset: 0 }],
      })
    ).id;
    nightId = (
      await createShiftTemplate({
        name: `CD Night ${stamp}`,
        code: `CDN_${stamp}`.slice(0, 20).toUpperCase(),
        graceInMinutes: 30,
        segments: [{ startMinute: 22 * 60, endMinute: 3 * 60, endDayOffset: 1 }],
      })
    ).id;
    splitId = (
      await createShiftTemplate({
        name: `CD Split ${stamp}`,
        code: `CDS_${stamp}`.slice(0, 20).toUpperCase(),
        graceInMinutes: 30,
        segments: [
          { startMinute: 540, endMinute: 780, endDayOffset: 0 },
          { startMinute: 17 * 60, endMinute: 21 * 60, endDayOffset: 0 },
        ],
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1–3 company default configured as General 09:30–18:30 / 540", async () => {
    const shift = await prisma.shiftDefinition.findUniqueOrThrow({
      where: { shiftId: companyShiftId },
      include: { segments: true },
    });
    expect(shift.name).toBe("General Shift");
    expect(shift.startMinutes).toBe(570);
    expect(shift.endMinutes).toBe(1110);
    expect(shift.expectedWorkMinutes).toBe(CANONICAL_GENERAL_EXPECTED_MINUTES);
    expect(shift.timezone).toBe("Asia/Kolkata");
    expect(shift.segments[0]?.startMinute).toBe(570);
    expect(shift.segments[0]?.endMinute).toBe(1110);
    if (companyShiftId === CANONICAL_GENERAL_SHIFT_ID) {
      expect(shift.shiftId).toBe("shift-morning-0930");
    }
  });

  it("4 company default fallback when no employee/roster/override", async () => {
    const resolved = await resolveEmployeeShiftForWorkDate(employeeId, AUG21);
    expect(resolved.source).toBe("COMPANY_DEFAULT");
    expect(resolved.defaultScope).toBe("COMPANY");
    expect(resolved.explicitNoShift).toBe(false);
    expect(resolved.shiftTemplate?.id).toBe(companyShiftId);
    expect(resolved.expectedWorkMinutes).toBe(540);
    expect(resolved.firstSegmentStartMinute).toBe(570);
    expect(resolved.finalSegmentEndMinute).toBe(1110);
  });

  it("5 employee default beats company default", async () => {
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `CDE5_${stamp}`.slice(0, 20),
        name: "Employee Default Wins",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    await assignDefaultShift({
      employeeId: emp.employeeId,
      shiftId: earlyId,
      effectiveFrom: AUG18,
    });
    const resolved = await resolveEmployeeShiftForWorkDate(emp.employeeId, AUG21);
    expect(resolved.source).toBe("DEFAULT");
    expect(resolved.defaultScope).toBe("EMPLOYEE");
    expect(resolved.shiftTemplate?.id).toBe(earlyId);
  });

  it("6 roster beats employee/company defaults", async () => {
    await assignDefaultShift({
      employeeId,
      shiftId: companyShiftId,
      effectiveFrom: AUG18,
    });
    await upsertRosterAssignment({
      employeeId,
      workDate: AUG19,
      shiftId: eveningId,
    });
    const resolved = await resolveEmployeeShiftForWorkDate(employeeId, AUG19);
    expect(resolved.source).toBe("ROSTER");
    expect(resolved.shiftTemplate?.id).toBe(eveningId);
  });

  it("7 day override beats roster", async () => {
    await upsertRosterAssignment({
      employeeId,
      workDate: AUG20,
      shiftId: eveningId,
    });
    await upsertDayOverride({
      employeeId,
      workDate: AUG20,
      shiftId: nightId,
    });
    const resolved = await resolveEmployeeShiftForWorkDate(employeeId, AUG20);
    expect(resolved.source).toBe("DAY_OVERRIDE");
    expect(resolved.shiftTemplate?.id).toBe(nightId);
  });

  it("8 NO_SHIFT blocks company fallback", async () => {
    await upsertRosterAssignment({
      employeeId,
      workDate: AUG21,
      shiftId: null,
    });
    const resolved = await resolveEmployeeShiftForWorkDate(employeeId, AUG21);
    expect(resolved.source).toBe("ROSTER");
    expect(resolved.explicitNoShift).toBe(true);
    expect(resolved.shiftTemplate).toBeNull();
    expect(resolved.expectedWorkMinutes).toBe(0);
  });

  it("9–12 historical Workday snapshots retain shift per day", async () => {
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `CDH_${stamp}`.slice(0, 20),
        name: "History Snapshot",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    await assignDefaultShift({
      employeeId: emp.employeeId,
      shiftId: companyShiftId,
      effectiveFrom: AUG18,
    });
    await upsertRosterAssignment({
      employeeId: emp.employeeId,
      workDate: AUG19,
      shiftId: eveningId,
    });
    await upsertDayOverride({
      employeeId: emp.employeeId,
      workDate: AUG20,
      shiftId: nightId,
    });
    await upsertRosterAssignment({
      employeeId: emp.employeeId,
      workDate: AUG22,
      shiftId: splitId,
    });

    const w18 = await getOrCreateAttendanceWorkday(emp.employeeId, AUG18);
    expect(w18.shiftTemplateId).toBe(companyShiftId);
    expect(w18.expectedWorkMinutes).toBe(540);
    expect(w18.scheduleSource).toBe("DEFAULT");

    const w19 = await getOrCreateAttendanceWorkday(emp.employeeId, AUG19);
    expect(w19.shiftTemplateId).toBe(eveningId);
    expect(w19.scheduleSource).toBe("ROSTER");

    const w20 = await getOrCreateAttendanceWorkday(emp.employeeId, AUG20);
    expect(w20.shiftTemplateId).toBe(nightId);
    expect(w20.scheduleSource).toBe("DAY_OVERRIDE");

    // Aug21: no roster/override → employee General default
    const w21 = await getOrCreateAttendanceWorkday(emp.employeeId, AUG21);
    expect(w21.shiftTemplateId).toBe(companyShiftId);
    expect(w21.expectedWorkMinutes).toBe(540);

    const w22 = await getOrCreateAttendanceWorkday(emp.employeeId, AUG22);
    expect(w22.shiftTemplateId).toBe(splitId);
    expect(w22.expectedWorkMinutes).toBe(480);

    const nightAgain = await prisma.attendanceWorkday.findUniqueOrThrow({
      where: { workdayId: w20.workdayId },
    });
    expect(nightAgain.shiftTemplateId).toBe(nightId);
    expect(nightAgain.shiftNameSnapshot).toBe(w20.shiftNameSnapshot);

    const eveningAgain = await prisma.attendanceWorkday.findUniqueOrThrow({
      where: { workdayId: w19.workdayId },
    });
    expect(eveningAgain.shiftTemplateId).toBe(eveningId);
  });

  it("13 company default change does not rewrite existing Workday", async () => {
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `CDR_${stamp}`.slice(0, 20),
        name: "Rewrite Guard",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    await upsertDayOverride({
      employeeId: emp.employeeId,
      workDate: AUG20,
      shiftId: nightId,
    });
    const before = await getOrCreateAttendanceWorkday(emp.employeeId, AUG20);
    const other = await createShiftTemplate({
      name: `CD Other ${stamp}`,
      code: `CDO_${stamp}`.slice(0, 20).toUpperCase(),
      segments: [{ startMinute: 600, endMinute: 1140, endDayOffset: 0 }],
    });
    await setCompanyDefaultShiftId(other.id);
    const after = await prisma.attendanceWorkday.findUniqueOrThrow({
      where: { workdayId: before.workdayId },
    });
    expect(after.shiftTemplateId).toBe(before.shiftTemplateId);
    expect(after.scheduleSnapshot).toEqual(before.scheduleSnapshot);
    expect(after.scheduledStartAt?.toISOString()).toBe(before.scheduledStartAt?.toISOString());
    expect(after.scheduledEndAt?.toISOString()).toBe(before.scheduledEndAt?.toISOString());
    // restore
    await setCompanyDefaultShiftId(companyShiftId);
  });

  it("14 General 540 worked → Full Day; bands unchanged", () => {
    expect(attendanceResultFromWorkedMinutes(210)).toBe("ABSENT");
    expect(attendanceResultFromWorkedMinutes(240)).toBe("HALF_DAY");
    expect(attendanceResultFromWorkedMinutes(480)).toBe("HALF_DAY");
    expect(attendanceResultFromWorkedMinutes(540)).toBe("FULL_DAY");
  });

  it("15 General missing checkout eligible at 19:00 (end 18:30 + 30)", async () => {
    const empMc = await prisma.employee.create({
      data: {
        employeeCode: `CDMC_${stamp}`.slice(0, 20),
        name: "MC Boundary",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    await assignDefaultShift({
      employeeId: empMc.employeeId,
      shiftId: companyShiftId,
      effectiveFrom: AUG18,
    });
    const wd = new Date("2026-08-25T00:00:00.000Z");
    await recordPunchIn({
      employeeId: empMc.employeeId,
      punchAt: istWallTimeToUtc(wd, 572),
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    const workday = await prisma.attendanceWorkday.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId: empMc.employeeId, workDate: wd } },
    });
    expect(workday.scheduledEndAt).toBeTruthy();
    const end = workday.scheduledEndAt!;
    const eligible = new Date(end.getTime() + MISSING_CHECKOUT_THRESHOLD_MINUTES * 60_000);
    // 18:30 IST + 30m = 19:00 IST
    expect(eligible.toISOString()).toBe(istWallTimeToUtc(wd, 19 * 60).toISOString());

    await syncWorkdayExceptions(workday.workdayId, {
      now: new Date(eligible.getTime() - 1),
      detectMissing: true,
    });
    let ex = await prisma.attendanceException.findFirst({
      where: { workdayId: workday.workdayId, type: "MISSING_CHECK_OUT" },
    });
    expect(ex).toBeNull();

    await syncWorkdayExceptions(workday.workdayId, {
      now: eligible,
      detectMissing: true,
    });
    ex = await prisma.attendanceException.findFirst({
      where: { workdayId: workday.workdayId, type: "MISSING_CHECK_OUT" },
    });
    expect(ex).toBeTruthy();
  });

  it("16 explicit NO_SHIFT work remains unscheduled", async () => {
    const empNs = await prisma.employee.create({
      data: {
        employeeCode: `CDNS_${stamp}`.slice(0, 20),
        name: "No Shift Punch",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    const wd = new Date("2026-08-26T00:00:00.000Z");
    await upsertRosterAssignment({
      employeeId: empNs.employeeId,
      workDate: wd,
      shiftId: null,
    });
    await recordPunchIn({
      employeeId: empNs.employeeId,
      punchAt: istWallTimeToUtc(wd, 600),
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    const workday = await prisma.attendanceWorkday.findUniqueOrThrow({
      where: { employeeId_workDate: { employeeId: empNs.employeeId, workDate: wd } },
    });
    expect(workday.explicitNoShift).toBe(true);
    expect(workday.shiftTemplateId).toBeNull();
    expect(workday.scheduleSource).toBe("ROSTER");
    expect(workday.expectedWorkMinutes ?? 0).toBe(0);
  });

  it("closed General 9h classifies Full Day on Workday", async () => {
    const empFd = await prisma.employee.create({
      data: {
        employeeCode: `CDFD_${stamp}`.slice(0, 20),
        name: "Full Day Gen",
        homeBranchId: branchId,
        status: "ACTIVE",
        attendanceRequired: true,
      },
    });
    await assignDefaultShift({
      employeeId: empFd.employeeId,
      shiftId: companyShiftId,
      effectiveFrom: AUG18,
    });
    const wd = new Date("2026-08-27T00:00:00.000Z");
    await recordPunchIn({
      employeeId: empFd.employeeId,
      punchAt: istWallTimeToUtc(wd, 570),
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    await recordPunchOut({
      employeeId: empFd.employeeId,
      punchAt: istWallTimeToUtc(wd, 570 + 540),
      eventType: EventType.OFFICE_OUT,
      eventSource: EventSource.MOBILE_GPS,
      location: { branchId, locationMode: "REGISTERED_LOCATION" },
    });
    const classified = await classifyAttendanceWorkday(
      (
        await prisma.attendanceWorkday.findUniqueOrThrow({
          where: { employeeId_workDate: { employeeId: empFd.employeeId, workDate: wd } },
        })
      ).workdayId,
    );
    expect(classified.classification.attendanceResult).toBe("FULL_DAY");
    expect(classified.classification.closedWorkedMinutes).toBe(540);
  });
});
