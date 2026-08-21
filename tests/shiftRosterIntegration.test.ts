/**
 * Shift/Roster foundation — hardened DB matrix (NO_SHIFT, history, validation).
 * RUN_SHIFT_INTEGRATION=1 DATABASE_URL=... npx vitest run tests/shiftRosterIntegration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  assignDefaultShift,
  createShiftTemplate,
  duplicateShiftTemplate,
  ensureLiveLikeShiftFixtures,
  expectedWorkMinutesFromSegments,
  resolveEmployeeShiftForWorkDate,
  setShiftTemplateActive,
  updateShiftTemplate,
  upsertDayOverride,
  upsertRosterAssignment,
  validateSegments,
} from "../server/src/shiftRoster";

const enabled = process.env.RUN_SHIFT_INTEGRATION === "1";
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let employeeId = "";
let orgId = "";
let branchId = "";
let beforeMorningIds: string[] = [];

describe.skipIf(!enabled)("shift roster foundation DB integration (hardened)", () => {
  beforeAll(async () => {
    beforeMorningIds = (
      await prisma.shiftDefinition.findMany({
        where: { shiftId: { in: ["shift-morning-0900", "shift-morning-0930"] } },
        select: { shiftId: true },
      })
    ).map((s) => s.shiftId);

    const branch = await prisma.branch.create({
      data: {
        branchName: `Shift Hard Loc ${stamp}`,
        branchCode: `SHH_${stamp}`.slice(0, 20).toUpperCase(),
        address: "Test",
        addressLine1: "Test",
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

    const dept = await prisma.department.create({
      data: {
        name: `Shift Hard Org ${stamp}`,
        unitCode: `SHORG_${stamp}`.slice(0, 20).toUpperCase(),
        unitType: "TEAM",
        active: true,
      },
    });
    orgId = dept.departmentId;

    const emp = await prisma.employee.create({
      data: {
        employeeCode: `SHEMP_${stamp}`.slice(0, 20).toUpperCase(),
        name: "Shift Hard Tester",
        email: `shifthard.${stamp}@test.local`,
        departmentId: orgId,
        homeBranchId: branchId,
        status: "ACTIVE",
        designation: "Operator",
        joiningDate: new Date("2026-01-01"),
      },
    });
    employeeId = emp.employeeId;
  }, 60_000);

  afterAll(async () => {
    if (employeeId) {
      await prisma.employeeShiftDayOverride.deleteMany({ where: { employeeId } });
      await prisma.rosterAssignment.deleteMany({ where: { employeeId } });
      await prisma.employeeShiftAssignment.deleteMany({ where: { employeeId } });
      await prisma.employee.delete({ where: { employeeId } }).catch(() => undefined);
    }
    if (orgId) await prisma.department.delete({ where: { departmentId: orgId } }).catch(() => undefined);
    if (branchId) await prisma.branch.delete({ where: { branchId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("preserves legacy morning shift IDs and segment backfill", async () => {
    for (const id of ["shift-morning-0900", "shift-morning-0930"]) {
      if (beforeMorningIds.includes(id)) {
        const row = await prisma.shiftDefinition.findUnique({
          where: { shiftId: id },
          include: { segments: true },
        });
        expect(row).toBeTruthy();
        expect(row!.segments.length).toBe(1);
      }
    }
    await ensureLiveLikeShiftFixtures();
  });

  it("validates same-day, overnight, split, hybrid; rejects overlap, duplicate, >24h", () => {
    expect(
      expectedWorkMinutesFromSegments([{ startMinute: 540, endMinute: 1080, endDayOffset: 0 }]),
    ).toBe(540);
    expect(
      expectedWorkMinutesFromSegments([{ startMinute: 1320, endMinute: 180, endDayOffset: 1 }]),
    ).toBe(300);
    expect(
      expectedWorkMinutesFromSegments([
        { startMinute: 540, endMinute: 780, endDayOffset: 0 },
        { startMinute: 840, endMinute: 1080, endDayOffset: 0 },
      ]),
    ).toBe(480);
    expect(() =>
      validateSegments([
        { startMinute: 540, endMinute: 780, endDayOffset: 0 },
        { startMinute: 720, endMinute: 900, endDayOffset: 0 },
      ]),
    ).toThrow(/overlap/i);
    expect(() =>
      validateSegments([
        { startMinute: 1320, endMinute: 180, endDayOffset: 1 },
        { startMinute: 1380, endMinute: 60, endDayOffset: 1 },
      ]),
    ).toThrow(/overlap/i);
    expect(() =>
      validateSegments([
        { startMinute: 540, endMinute: 780, endDayOffset: 0 },
        { startMinute: 540, endMinute: 780, endDayOffset: 0 },
      ]),
    ).toThrow(/duplicate/i);
    expect(() =>
      validateSegments([{ startMinute: 1320, endMinute: 1380, endDayOffset: 1 }]),
    ).toThrow(/24 hours/i);
    expect(() =>
      validateSegments([{ startMinute: 540, endMinute: 540, endDayOffset: 0 }]),
    ).toThrow(/after start/i);
  });

  it("NO_SHIFT day override and roster block DEFAULT fallback", async () => {
    const general = await createShiftTemplate({
      name: `Hard Gen ${stamp}`,
      code: `HGEN_${stamp}`.toUpperCase(),
      segments: [{ startMinute: 540, endMinute: 1080, endDayOffset: 0 }],
    });
    await assignDefaultShift({
      employeeId,
      shiftId: general.id,
      effectiveFrom: new Date("2026-08-01"),
    });

    const wed = new Date("2026-08-19");
    let resolved = await resolveEmployeeShiftForWorkDate(employeeId, wed);
    expect(resolved.source).toBe("DEFAULT");

    await upsertRosterAssignment({
      employeeId,
      workDate: wed,
      shiftId: null,
    });
    resolved = await resolveEmployeeShiftForWorkDate(employeeId, wed);
    expect(resolved.source).toBe("ROSTER");
    expect(resolved.explicitNoShift).toBe(true);
    expect(resolved.shiftTemplate).toBeNull();

    await upsertDayOverride({
      employeeId,
      workDate: wed,
      shiftId: null,
      reason: "off day",
    });
    resolved = await resolveEmployeeShiftForWorkDate(employeeId, wed);
    expect(resolved.source).toBe("DAY_OVERRIDE");
    expect(resolved.explicitNoShift).toBe(true);
    expect(resolved.shiftTemplate).toBeNull();
  });

  it("historical schedule immutability + duplicate revise", async () => {
    const tpl = await createShiftTemplate({
      name: `Hist ${stamp}`,
      code: `HIST_${stamp}`.toUpperCase(),
      segments: [{ startMinute: 540, endMinute: 1080, endDayOffset: 0 }],
    });
    await assignDefaultShift({
      employeeId,
      shiftId: tpl.id,
      effectiveFrom: new Date("2026-07-01"),
    });
    await expect(
      updateShiftTemplate(tpl.id, {
        segments: [{ startMinute: 600, endMinute: 1140, endDayOffset: 0 }],
      }),
    ).rejects.toThrow(/schedule history/i);

    const renamed = await updateShiftTemplate(tpl.id, { name: `Hist Renamed ${stamp}` });
    expect(renamed.code).toBe(tpl.code);
    expect(renamed.segments[0]?.startMinute).toBe(540);

    const aug15 = await resolveEmployeeShiftForWorkDate(employeeId, new Date("2026-08-15"));
    expect(aug15.shiftTemplate?.id).toBe(tpl.id);
    expect(aug15.firstSegmentStartMinute).toBe(540);

    const copy = await duplicateShiftTemplate(tpl.id, {
      name: `Hist Rev ${stamp}`,
      code: `HISTREV_${stamp}`.toUpperCase(),
      segments: [{ startMinute: 600, endMinute: 1140, endDayOffset: 0 }],
    });
    expect(copy.segments[0]?.startMinute).toBe(600);
  });

  it("DEFAULT exclusive effectiveTo: Mar 31 A / Apr 1 B and future Sep 1", async () => {
    const a = await createShiftTemplate({
      name: `DefA ${stamp}`,
      code: `DEFA_${stamp}`.toUpperCase(),
      segments: [{ startMinute: 540, endMinute: 1080, endDayOffset: 0 }],
    });
    const b = await createShiftTemplate({
      name: `DefB ${stamp}`,
      code: `DEFB_${stamp}`.toUpperCase(),
      segments: [{ startMinute: 360, endMinute: 900, endDayOffset: 0 }],
    });
    await assignDefaultShift({
      employeeId,
      shiftId: a.id,
      effectiveFrom: new Date("2026-01-01"),
    });
    await assignDefaultShift({
      employeeId,
      shiftId: b.id,
      effectiveFrom: new Date("2026-04-01"),
    });
    expect((await resolveEmployeeShiftForWorkDate(employeeId, new Date("2026-03-31"))).shiftTemplate?.id).toBe(
      a.id,
    );
    expect((await resolveEmployeeShiftForWorkDate(employeeId, new Date("2026-04-01"))).shiftTemplate?.id).toBe(
      b.id,
    );

    const c = await createShiftTemplate({
      name: `DefC ${stamp}`,
      code: `DEFC_${stamp}`.toUpperCase(),
      segments: [{ startMinute: 840, endMinute: 1380, endDayOffset: 0 }],
    });
    await assignDefaultShift({
      employeeId,
      shiftId: c.id,
      effectiveFrom: new Date("2026-09-01"),
    });
    expect((await resolveEmployeeShiftForWorkDate(employeeId, new Date("2026-08-31"))).shiftTemplate?.id).toBe(
      b.id,
    );
    expect((await resolveEmployeeShiftForWorkDate(employeeId, new Date("2026-09-01"))).shiftTemplate?.id).toBe(
      c.id,
    );
  });

  it("inactive blocked for new assign; history still resolves; org/base/role unchanged", async () => {
    const before = await prisma.employee.findUniqueOrThrow({ where: { employeeId } });
    const night = await createShiftTemplate({
      name: `Night Hist ${stamp}`,
      code: `NIGHTH_${stamp}`.toUpperCase(),
      segments: [{ startMinute: 1320, endMinute: 180, endDayOffset: 1 }],
    });
    expect(night.segments[0]?.endDayOffset).toBe(1);

    await assignDefaultShift({
      employeeId,
      shiftId: night.id,
      effectiveFrom: new Date("2026-10-01"),
    });
    await setShiftTemplateActive(night.id, false);
    await expect(
      assignDefaultShift({
        employeeId,
        shiftId: night.id,
        effectiveFrom: new Date("2026-10-15"),
      }),
    ).rejects.toThrow(/Inactive/i);

    const resolved = await resolveEmployeeShiftForWorkDate(employeeId, new Date("2026-10-05"));
    expect(resolved.shiftTemplate?.id).toBe(night.id);
    expect(resolved.crossesMidnight).toBe(true);
    expect(resolved.workDate).toBe("2026-10-05");

    const after = await prisma.employee.findUniqueOrThrow({ where: { employeeId } });
    expect(after.departmentId).toBe(before.departmentId);
    expect(after.homeBranchId).toBe(before.homeBranchId);
    expect(after.designation).toBe(before.designation);

    const audits = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            "SHIFT_TEMPLATE_CREATED",
            "DEFAULT_SHIFT_ASSIGNED",
            "ROSTER_NO_SHIFT_SET",
            "DAY_OVERRIDE_NO_SHIFT_SET",
            "SHIFT_TEMPLATE_DEACTIVATED",
          ],
        },
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    });
    expect(audits.length).toBeGreaterThan(0);
  });
});
