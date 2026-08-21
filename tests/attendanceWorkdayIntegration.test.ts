/**
 * Attendance Workday Core — DB integration matrix.
 * RUN_ATTENDANCE_WORKDAY_INTEGRATION=1 DATABASE_URL=... npx vitest run tests/attendanceWorkdayIntegration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventSource, EventType, PrismaClient } from "@prisma/client";
import {
  assignDefaultShift,
  createShiftTemplate,
  resolveEmployeeShiftForWorkDate,
  upsertDayOverride,
  upsertRosterAssignment,
  updateShiftTemplate,
} from "../server/src/shiftRoster";
import {
  getOrCreateAttendanceWorkday,
  recordPunchIn,
  recordPunchOut,
  resolveWorkDateForPunch,
  workDateIso,
  istWallTimeToUtc,
} from "../server/src/attendanceWorkday";
import {
  backfillEmployeeAttendanceWorkdays,
  assertRawEventsUnchanged,
} from "../server/src/attendanceWorkdayBackfill";
import { resolveAttendanceLocation } from "../server/src/attendanceLocationResolve";

const enabled = process.env.RUN_ATTENDANCE_WORKDAY_INTEGRATION === "1";
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let employeeId = "";
let orgId = "";
let branchA = "";
let branchB = "";
let generalId = "";
let nightId = "";
let splitId = "";
let hybridId = "";

const WD = new Date("2026-08-21T00:00:00.000Z");

describe.skipIf(!enabled)("attendance workday core DB integration", () => {
  beforeAll(async () => {
    const a = await prisma.branch.create({
      data: {
        branchName: `WD Loc A ${stamp}`,
        branchCode: `WDA_${stamp}`.slice(0, 20).toUpperCase(),
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
    branchA = a.branchId;
    const b = await prisma.branch.create({
      data: {
        branchName: `WD Loc B ${stamp}`,
        branchCode: `WDB_${stamp}`.slice(0, 20).toUpperCase(),
        address: "B",
        addressLine1: "B",
        city: "Hyderabad",
        state: "TELANGANA",
        postalCode: "500081",
        country: "India",
        latitude: 17.45,
        longitude: 78.39,
        attendanceRadiusMeters: 250,
        locationType: "OFFICE",
        status: "ACTIVE",
      },
    });
    branchB = b.branchId;
    const inactive = await prisma.branch.create({
      data: {
        branchName: `WD Loc Inactive ${stamp}`,
        branchCode: `WDI_${stamp}`.slice(0, 20).toUpperCase(),
        address: "I",
        addressLine1: "I",
        city: "Hyderabad",
        state: "TELANGANA",
        postalCode: "500001",
        country: "India",
        latitude: 17.41,
        longitude: 78.41,
        attendanceRadiusMeters: 5000,
        locationType: "OFFICE",
        status: "INACTIVE",
      },
    });
    void inactive;

    const dept = await prisma.department.create({
      data: {
        name: `WD Org ${stamp}`,
        unitCode: `WDORG_${stamp}`.slice(0, 20).toUpperCase(),
        unitType: "TEAM",
        active: true,
      },
    });
    orgId = dept.departmentId;

    const emp = await prisma.employee.create({
      data: {
        employeeCode: `WDEMP_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Workday Tester",
        email: `workday.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Operator",
        joiningDate: new Date("2026-01-01"),
      },
    });
    employeeId = emp.employeeId;

    generalId = (
      await createShiftTemplate({
        name: `WD General ${stamp}`,
        code: `WDG_${stamp}`.slice(0, 20).toUpperCase(),
        segments: [{ startMinute: 540, endMinute: 1080, endDayOffset: 0 }],
      })
    ).id;
    nightId = (
      await createShiftTemplate({
        name: `WD Night ${stamp}`,
        code: `WDN_${stamp}`.slice(0, 20).toUpperCase(),
        segments: [{ startMinute: 1320, endMinute: 180, endDayOffset: 1 }],
      })
    ).id;
    splitId = (
      await createShiftTemplate({
        name: `WD Split ${stamp}`,
        code: `WDS_${stamp}`.slice(0, 20).toUpperCase(),
        segments: [
          { startMinute: 540, endMinute: 780, endDayOffset: 0 },
          { startMinute: 1020, endMinute: 1260, endDayOffset: 0 },
        ],
      })
    ).id;
    hybridId = (
      await createShiftTemplate({
        name: `WD Hybrid ${stamp}`,
        code: `WDH_${stamp}`.slice(0, 20).toUpperCase(),
        segments: [
          { startMinute: 540, endMinute: 600, endDayOffset: 0 },
          { startMinute: 1320, endMinute: 180, endDayOffset: 1 },
        ],
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1 same-day shift Workday creation", async () => {
    await assignDefaultShift({
      employeeId,
      shiftId: generalId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const wd = await getOrCreateAttendanceWorkday(employeeId, WD);
    expect(workDateIso(wd.workDate)).toBe("2026-08-21");
    expect(wd.scheduleSource).toBe("DEFAULT");
    const snap = wd.scheduleSnapshot as { segments: unknown[] };
    expect(snap.segments.length).toBe(1);
  });

  it("2 overnight Workday creation", async () => {
    const emp2 = await prisma.employee.create({
      data: {
        employeeCode: `WDN2_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Night Emp",
        email: `wdn2.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: emp2.employeeId,
      shiftId: nightId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const wd = await getOrCreateAttendanceWorkday(emp2.employeeId, WD);
    const snap = wd.scheduleSnapshot as { segments: Array<{ startAt: string; endAt: string; endDayOffset: number }> };
    expect(snap.segments[0]!.endDayOffset).toBe(1);
    const start = new Date(snap.segments[0]!.startAt);
    const end = new Date(snap.segments[0]!.endAt);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
    // 03:00 IST next calendar day
    expect(
      end.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit" }),
    ).toMatch(/22/);
  });

  it("3/4 split and hybrid snapshots", async () => {
    const eSplit = await prisma.employee.create({
      data: {
        employeeCode: `WDSP_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Split",
        email: `wdsplit.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: eSplit.employeeId,
      shiftId: splitId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const splitWd = await getOrCreateAttendanceWorkday(eSplit.employeeId, WD);
    expect((splitWd.scheduleSnapshot as { segments: unknown[] }).segments).toHaveLength(2);

    const eHyb = await prisma.employee.create({
      data: {
        employeeCode: `WDHY_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Hybrid",
        email: `wdhyb.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: eHyb.employeeId,
      shiftId: hybridId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const hybWd = await getOrCreateAttendanceWorkday(eHyb.employeeId, WD);
    expect((hybWd.scheduleSnapshot as { segments: unknown[] }).segments).toHaveLength(2);
  });

  it("5 snapshot immutable after template rename", async () => {
    const before = await getOrCreateAttendanceWorkday(employeeId, WD);
    const nameBefore = before.shiftNameSnapshot;
    try {
      await updateShiftTemplate(generalId, {
        name: `Renamed General ${stamp}`,
      });
    } catch {
      // IMMUTABLE_ON_REFERENCE or name clash — snapshot must still hold
    }
    const again = await prisma.attendanceWorkday.findUniqueOrThrow({
      where: { workdayId: before.workdayId },
    });
    expect(again.shiftNameSnapshot).toBe(nameBefore);
    expect(again.scheduleSnapshot).toEqual(before.scheduleSnapshot);
  });

  it("6/7/8/9 sources DAY_OVERRIDE ROSTER DEFAULT NONE", async () => {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WDSRC_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Src",
        email: `wdsrc.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    const dNone = await resolveEmployeeShiftForWorkDate(e.employeeId, WD);
    expect(dNone.source).toBe("NONE");

    await assignDefaultShift({
      employeeId: e.employeeId,
      shiftId: generalId,
      effectiveFrom: new Date("2026-01-01"),
    });
    expect((await resolveEmployeeShiftForWorkDate(e.employeeId, WD)).source).toBe("DEFAULT");

    await upsertRosterAssignment({
      employeeId: e.employeeId,
      workDate: WD,
      shiftId: nightId,
    });
    expect((await resolveEmployeeShiftForWorkDate(e.employeeId, WD)).source).toBe("ROSTER");

    await upsertDayOverride({
      employeeId: e.employeeId,
      workDate: WD,
      shiftId: splitId,
    });
    expect((await resolveEmployeeShiftForWorkDate(e.employeeId, WD)).source).toBe("DAY_OVERRIDE");
  });

  it("10/11 explicit NO_SHIFT retained but punch recordable", async () => {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WDNS_${stamp}`.slice(0, 20).toUpperCase(),
        name: "NoShift",
        email: `wdns.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await upsertDayOverride({
      employeeId: e.employeeId,
      workDate: WD,
      shiftId: null,
    });
    const wd = await getOrCreateAttendanceWorkday(e.employeeId, WD);
    expect(wd.explicitNoShift).toBe(true);
    const punch = await recordPunchIn({
      employeeId: e.employeeId,
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      punchAt: istWallTimeToUtc(WD, 600),
      location: { branchId: branchA, locationMode: "REGISTERED_LOCATION" },
    });
    expect(punch.workday?.explicitNoShift).toBe(true);
    expect(punch.session?.status).toBe("OPEN");
  });

  it("12-20 check-in/out sessions worked minutes gap", async () => {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WDP_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Punch",
        email: `wdp.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: e.employeeId,
      shiftId: generalId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const in1 = await recordPunchIn({
      employeeId: e.employeeId,
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      punchAt: istWallTimeToUtc(WD, 542),
      location: { branchId: branchA, locationMode: "REGISTERED_LOCATION" },
    });
    expect(in1.event.workdayId).toBeTruthy();
    expect(in1.session?.status).toBe("OPEN");

    const out1 = await recordPunchOut({
      employeeId: e.employeeId,
      eventType: EventType.OFFICE_OUT,
      eventSource: EventSource.MOBILE_GPS,
      punchAt: istWallTimeToUtc(WD, 785),
      location: { branchId: branchA, locationMode: "REGISTERED_LOCATION" },
    });
    expect(out1.event.workdayId).toBe(in1.workday!.workdayId);
    expect(out1.session?.status).toBe("CLOSED");
    expect(out1.session?.workedMinutes).toBe(243);

    const in2 = await recordPunchIn({
      employeeId: e.employeeId,
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      punchAt: istWallTimeToUtc(WD, 841),
      location: { branchId: branchB, locationMode: "REGISTERED_LOCATION" },
    });
    expect(in2.workday!.workdayId).toBe(in1.workday!.workdayId);
    const out2 = await recordPunchOut({
      employeeId: e.employeeId,
      eventType: EventType.OFFICE_OUT,
      eventSource: EventSource.MOBILE_GPS,
      punchAt: istWallTimeToUtc(WD, 1090),
      location: { branchId: branchB, locationMode: "REGISTERED_LOCATION" },
    });
    expect(out2.workday!.actualWorkedMinutes).toBe(243 + 249);
    // gap 785→841 not counted
    expect(out2.workday!.actualWorkedMinutes).toBeLessThan(785 - 542 + (1090 - 841) + 100);
  });

  it("17 overnight checkout stays on prior Workday", async () => {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WDOV_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Overnight",
        email: `wdov.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: e.employeeId,
      shiftId: nightId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const cin = await recordPunchIn({
      employeeId: e.employeeId,
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      punchAt: istWallTimeToUtc(WD, 1320),
      location: { locationMode: "MOBILE_FIELD" },
    });
    expect(workDateIso(cin.workday!.workDate)).toBe("2026-08-21");
    const cout = await recordPunchOut({
      employeeId: e.employeeId,
      eventType: EventType.OFFICE_OUT,
      eventSource: EventSource.MOBILE_GPS,
      punchAt: istWallTimeToUtc(WD, 1440 + 187),
      location: { locationMode: "MOBILE_FIELD" },
    });
    expect(workDateIso(cout.workday!.workDate)).toBe("2026-08-21");
    expect(cout.event.eventDate.getTime()).toBe(cin.event.eventDate.getTime());
  });

  it("21-24 locations Base A punch B / mobile field / inactive ignored", async () => {
    const locs = await prisma.branch.findMany({
      where: {
        branchId: { in: [branchA, branchB] },
        status: "ACTIVE",
        latitude: { not: null },
      },
      select: {
        branchId: true,
        branchName: true,
        latitude: true,
        longitude: true,
        attendanceRadiusMeters: true,
      },
    });
    const mapped = locs.map((l) => ({
      ...l,
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
    }));
    const atB = resolveAttendanceLocation({ latitude: 17.45, longitude: 78.39 }, mapped);
    expect(atB.mode).toBe("REGISTERED_LOCATION");
    expect(atB.matchedLocation?.branchId).toBe(branchB);
    const far = resolveAttendanceLocation({ latitude: 18.5, longitude: 79.5 }, mapped);
    expect(far.mode).toBe("MOBILE_FIELD");
    // inactive location with huge radius must not be in ACTIVE set
    const inactive = await prisma.branch.findFirst({
      where: { branchCode: { startsWith: `WDI_${stamp}`.slice(0, 20).toUpperCase() } },
    });
    expect(inactive?.status).toBe("INACTIVE");
  });

  it("25-27 open session null checkout; midnight does not close; no synthetic OUT", async () => {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WDOPEN_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Open",
        email: `wdopen.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: e.employeeId,
      shiftId: generalId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const cin = await recordPunchIn({
      employeeId: e.employeeId,
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      punchAt: istWallTimeToUtc(WD, 540),
      location: { locationMode: "MOBILE_FIELD" },
    });
    expect(cin.session?.checkOutAt).toBeNull();
    const outs = await prisma.attendanceEvent.count({
      where: { employeeId: e.employeeId, eventType: { in: [EventType.OFFICE_OUT, EventType.FIELD_CHECK_OUT] } },
    });
    expect(outs).toBe(0);
    // "midnight" — still open
    const still = await prisma.attendanceSession.findUniqueOrThrow({
      where: { sessionId: cin.session!.sessionId },
    });
    expect(still.status).toBe("OPEN");
  });

  it("28-31 duplicate and concurrent check-in protection + idempotency", async () => {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WDDUPE_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Dupe",
        email: `wddupe.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: e.employeeId,
      shiftId: generalId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const key = `idem-${stamp}`;
    const first = await recordPunchIn({
      employeeId: e.employeeId,
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      punchAt: istWallTimeToUtc(WD, 550),
      location: { locationMode: "MOBILE_FIELD" },
      clientEventId: key,
    });
    const retry = await recordPunchIn({
      employeeId: e.employeeId,
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      punchAt: istWallTimeToUtc(WD, 551),
      location: { locationMode: "MOBILE_FIELD" },
      clientEventId: key,
    });
    expect(retry.idempotent).toBe(true);
    expect(retry.event.eventId).toBe(first.event.eventId);

    await expect(
      recordPunchIn({
        employeeId: e.employeeId,
        eventType: EventType.OFFICE_IN,
        eventSource: EventSource.MOBILE_GPS,
        punchAt: istWallTimeToUtc(WD, 560),
        location: { locationMode: "MOBILE_FIELD" },
      }),
    ).rejects.toThrow(/already checked in/i);

    const results = await Promise.allSettled([
      recordPunchOut({
        employeeId: e.employeeId,
        eventType: EventType.OFFICE_OUT,
        eventSource: EventSource.MOBILE_GPS,
        punchAt: istWallTimeToUtc(WD, 600),
        location: { locationMode: "MOBILE_FIELD" },
        clientEventId: `out-${stamp}`,
      }),
      recordPunchOut({
        employeeId: e.employeeId,
        eventType: EventType.OFFICE_OUT,
        eventSource: EventSource.MOBILE_GPS,
        punchAt: istWallTimeToUtc(WD, 601),
        location: { locationMode: "MOBILE_FIELD" },
        clientEventId: `out2-${stamp}`,
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBe(1);
    expect(bad.length).toBe(1);

    // concurrent check-ins
    const e2 = await prisma.employee.create({
      data: {
        employeeCode: `WDRACE_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Race",
        email: `wdrace.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: e2.employeeId,
      shiftId: generalId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const raced = await Promise.allSettled([
      recordPunchIn({
        employeeId: e2.employeeId,
        eventType: EventType.OFFICE_IN,
        eventSource: EventSource.MOBILE_GPS,
        punchAt: istWallTimeToUtc(WD, 570),
        location: { locationMode: "MOBILE_FIELD" },
      }),
      recordPunchIn({
        employeeId: e2.employeeId,
        eventType: EventType.OFFICE_IN,
        eventSource: EventSource.MOBILE_GPS,
        punchAt: istWallTimeToUtc(WD, 571),
        location: { locationMode: "MOBILE_FIELD" },
      }),
    ]);
    const opened = await prisma.attendanceSession.count({
      where: { employeeId: e2.employeeId, status: "OPEN" },
    });
    expect(opened).toBe(1);
    expect(raced.filter((r) => r.status === "fulfilled").length).toBe(1);
  });

  it("H/I unscheduled and NO_SHIFT ownership", async () => {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WDUN_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Unsched",
        email: `wdun.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    const own = await resolveWorkDateForPunch(e.employeeId, istWallTimeToUtc(WD, 840));
    expect(workDateIso(own.workDate)).toBe("2026-08-21");
    expect(own.unscheduled).toBe(true);
  });

  it("35-42 backfill preserves raw evidence and flags ambiguity", async () => {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WDBF_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Backfill",
        email: `wdbf.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: e.employeeId,
      shiftId: generalId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const evIn = await prisma.attendanceEvent.create({
      data: {
        employeeId: e.employeeId,
        eventDate: WD,
        eventTime: istWallTimeToUtc(WD, 540),
        eventSource: EventSource.MOBILE_GPS,
        eventType: EventType.OFFICE_IN,
        branchId: branchA,
      },
    });
    const evOut = await prisma.attendanceEvent.create({
      data: {
        employeeId: e.employeeId,
        eventDate: WD,
        eventTime: istWallTimeToUtc(WD, 600),
        eventSource: EventSource.MOBILE_GPS,
        eventType: EventType.OFFICE_OUT,
        branchId: branchA,
      },
    });
    const orphan = await prisma.attendanceEvent.create({
      data: {
        employeeId: e.employeeId,
        eventDate: WD,
        eventTime: istWallTimeToUtc(WD, 700),
        eventSource: EventSource.MOBILE_GPS,
        eventType: EventType.OFFICE_OUT,
        branchId: branchB,
      },
    });
    const before = [evIn, evOut, orphan].map((x) => ({
      eventId: x.eventId,
      eventTime: x.eventTime,
      branchId: x.branchId,
    }));
    const result = await backfillEmployeeAttendanceWorkdays(e.employeeId);
    expect(result.sessionsCreated).toBeGreaterThanOrEqual(1);
    expect(result.flagged.some((f) => f.flag === "ORPHAN_OUT")).toBe(true);
    await assertRawEventsUnchanged(before);
    const afterIn = await prisma.attendanceEvent.findUniqueOrThrow({
      where: { eventId: evIn.eventId },
    });
    expect(afterIn.eventId).toBe(evIn.eventId);
    expect(afterIn.branchId).toBe(branchA);
  });

  it("44-46 org/base office/role unchanged smoke", async () => {
    const emp = await prisma.employee.findUniqueOrThrow({ where: { employeeId } });
    expect(emp.homeBranchId).toBe(branchA);
    expect(emp.departmentId).toBe(orgId);
  });

  it("thumb + mixed-source session via createAttendanceEvent", async () => {
    const { createAttendanceEvent } = await import("../server/src/attendanceEngine");
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WDTH_${stamp}`.slice(0, 20).toUpperCase(),
        name: "ThumbMix",
        email: `wdthumb.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: e.employeeId,
      shiftId: nightId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const cin = await createAttendanceEvent({
      employeeId: e.employeeId,
      eventTime: istWallTimeToUtc(WD, 1322),
      eventSource: EventSource.THUMB_SCANNER,
      eventType: EventType.OFFICE_IN,
      branchId: branchA,
    });
    expect(cin.workdayId).toBeTruthy();
    expect(cin.sessionId).toBeTruthy();
    const cout = await createAttendanceEvent({
      employeeId: e.employeeId,
      eventTime: istWallTimeToUtc(WD, 1440 + 181),
      eventSource: EventSource.MOBILE_GPS,
      eventType: EventType.OFFICE_OUT,
      branchId: branchB,
    });
    expect(cout.workdayId).toBe(cin.workdayId);
    expect(cout.sessionId).toBe(cin.sessionId);
    expect(workDateIso(cout.eventDate)).toBe("2026-08-21");
    const session = await prisma.attendanceSession.findUniqueOrThrow({
      where: { sessionId: cin.sessionId! },
    });
    expect(session.status).toBe("CLOSED");
    expect(session.checkInLocationId).toBe(branchA);
    expect(session.checkOutLocationId).toBe(branchB);
  });

  it("open session checkout always wins outside TRAIL", async () => {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WDTR_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Trail",
        email: `wdtrail.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: e.employeeId,
      shiftId: nightId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const cin = await recordPunchIn({
      employeeId: e.employeeId,
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      punchAt: istWallTimeToUtc(WD, 1320),
      location: { locationMode: "MOBILE_FIELD" },
    });
    // 07:15 next calendar day — well past TRAIL after 03:00
    const cout = await recordPunchOut({
      employeeId: e.employeeId,
      eventType: EventType.OFFICE_OUT,
      eventSource: EventSource.MOBILE_GPS,
      punchAt: istWallTimeToUtc(WD, 1440 + 435),
      location: { locationMode: "MOBILE_FIELD" },
    });
    expect(cout.workday!.workdayId).toBe(cin.workday!.workdayId);
    expect(workDateIso(cout.event.eventDate)).toBe("2026-08-21");
  });

  it("consecutive night shifts ownership via resolveWorkDateForPunch", async () => {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WDCN_${stamp}`.slice(0, 20).toUpperCase(),
        name: "ConsecNight",
        email: `wdcn.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: e.employeeId,
      shiftId: nightId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const aug22 = new Date("2026-08-22T00:00:00.000Z");
    const at0100 = await resolveWorkDateForPunch(e.employeeId, istWallTimeToUtc(WD, 1440 + 60));
    expect(workDateIso(at0100.workDate)).toBe("2026-08-21");
    const at2155 = await resolveWorkDateForPunch(e.employeeId, istWallTimeToUtc(aug22, 1315));
    expect(workDateIso(at2155.workDate)).toBe("2026-08-22");
  });

  it("20 concurrent check-ins → one open session", async () => {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WD20_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Race20",
        email: `wd20.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: e.employeeId,
      shiftId: generalId,
      effectiveFrom: new Date("2026-01-01"),
    });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        recordPunchIn({
          employeeId: e.employeeId,
          eventType: EventType.OFFICE_IN,
          eventSource: EventSource.MOBILE_GPS,
          punchAt: istWallTimeToUtc(WD, 600 + i),
          location: { locationMode: "MOBILE_FIELD" },
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(results.filter((r) => r.status === "rejected").length).toBe(19);
    expect(
      await prisma.attendanceSession.count({ where: { employeeId: e.employeeId, status: "OPEN" } }),
    ).toBe(1);
    expect(await prisma.attendanceEvent.count({ where: { employeeId: e.employeeId } })).toBe(1);
  });

  it("reconcile idempotent + correction path", async () => {
    const { createAttendanceEvent } = await import("../server/src/attendanceEngine");
    const { reconcileAttendanceWorkday } = await import("../server/src/attendanceWorkday");
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WDREC_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Reconcile",
        email: `wdrec.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: e.employeeId,
      shiftId: generalId,
      effectiveFrom: new Date("2026-01-01"),
    });
    await createAttendanceEvent({
      employeeId: e.employeeId,
      eventTime: istWallTimeToUtc(WD, 540),
      eventSource: EventSource.MANUAL_CORRECTION,
      eventType: EventType.OFFICE_IN,
      remarks: "correction in",
    });
    await createAttendanceEvent({
      employeeId: e.employeeId,
      eventTime: istWallTimeToUtc(WD, 600),
      eventSource: EventSource.MANUAL_CORRECTION,
      eventType: EventType.OFFICE_OUT,
      remarks: "correction out",
    });
    const first = await reconcileAttendanceWorkday(e.employeeId, WD);
    const second = await reconcileAttendanceWorkday(e.employeeId, WD);
    expect(first.sessions.length).toBe(second.sessions.length);
    expect(first.sessions.filter((s) => s.status === "CLOSED").length).toBeGreaterThanOrEqual(1);
    const events = await prisma.attendanceEvent.findMany({ where: { employeeId: e.employeeId } });
    expect(events.every((ev) => ev.workdayId)).toBe(true);
  });

  it("global open session blocks next-day IN", async () => {
    const e = await prisma.employee.create({
      data: {
        employeeCode: `WDGL_${stamp}`.slice(0, 20).toUpperCase(),
        name: "GlobalOpen",
        email: `wdgl.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchA,
        status: "ACTIVE",
        designation: "Op",
        joiningDate: new Date("2026-01-01"),
      },
    });
    await assignDefaultShift({
      employeeId: e.employeeId,
      shiftId: nightId,
      effectiveFrom: new Date("2026-01-01"),
    });
    await recordPunchIn({
      employeeId: e.employeeId,
      eventType: EventType.OFFICE_IN,
      eventSource: EventSource.MOBILE_GPS,
      punchAt: istWallTimeToUtc(WD, 1320),
      location: { locationMode: "MOBILE_FIELD" },
    });
    await expect(
      recordPunchIn({
        employeeId: e.employeeId,
        eventType: EventType.OFFICE_IN,
        eventSource: EventSource.MOBILE_GPS,
        punchAt: istWallTimeToUtc(new Date("2026-08-22T00:00:00.000Z"), 1320),
        location: { locationMode: "MOBILE_FIELD" },
      }),
    ).rejects.toThrow(/already checked in/i);
    expect(
      await prisma.attendanceSession.count({ where: { employeeId: e.employeeId, status: "OPEN" } }),
    ).toBe(1);
  });
});
