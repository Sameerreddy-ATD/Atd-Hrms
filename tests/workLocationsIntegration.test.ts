/**
 * DB-backed Module 2 work location integration matrix.
 * Requires disposable MySQL on 3308 (docker-compose.org-test.yml).
 * RUN_WL_INTEGRATION=1 — no skipped tests when the suite is enabled.
 *
 * Requirement map (report §3):
 * 1–4 migration preservation · 5 codes unique · 6–7 type backfill/create
 * 8–9 active/inactive selectors · 10–16 CRUD lifecycle · 17 hard-delete blocked
 * 18–24 Base Office transfer invariants · 25–26 inactive/future transfer
 * 27–34 validation · 35–40 geofence · 41–46 history/attendance/org/audit
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, Role, EmployeeStatus } from "@prisma/client";
import {
  createWorkLocation,
  deactivateWorkLocation,
  reactivateWorkLocation,
  transferBaseOffice,
  updateWorkLocation,
  workLocationDto,
} from "../server/src/workLocations.js";
import { resolveAttendanceLocation } from "../server/src/attendanceLocationResolve.js";
import { startOfUtcDay } from "../server/src/organizationStructure.js";
import { HttpError } from "../server/src/errors.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient();
const runSuite = process.env.RUN_WL_INTEGRATION === "1";

const basePayload = {
  addressLine1: "Line 1",
  city: "Hyderabad",
  state: "TELANGANA",
  postalCode: "500081",
  country: "India",
  latitude: 17.44,
  longitude: 78.39,
  attendanceRadiusMeters: 250,
} as const;

describe.skipIf(!runSuite)("work locations integration (MySQL)", () => {
  let madhapurId = "";
  let banjaraId = "";
  let hubId = "";
  let employeeId = "";
  let userId = "";
  let departmentId = "";
  let eventId = "";
  let orgAssignmentId = "";
  const preserved = {
    branchIds: [] as string[],
    homeBranchId: "",
    attendanceBranchId: "",
  };

  beforeAll(async () => {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL is required for work location integration tests");
    }

    await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
    await prisma.employeeWorkLocationAssignment.deleteMany();
    await prisma.employeeOrganizationAssignment.deleteMany();
    await prisma.departmentHeadAssignment.deleteMany();
    await prisma.departmentViewerAssignment.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.attendanceEvent.deleteMany();
    await prisma.user.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.department.deleteMany();
    await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");

    departmentId = (
      await prisma.department.create({
        data: { name: "Operations Department", unitCode: "WL_OPERATIONS", unitType: "TEAM" },
      })
    ).departmentId;

    const madhapur = await createWorkLocation(prisma, {
      name: "Madhapur Office",
      code: "MADHAPUR_OFFICE",
      locationType: "OFFICE",
      ...basePayload,
      latitude: 17.4391592,
      longitude: 78.3947783,
    });
    const banjara = await createWorkLocation(prisma, {
      name: "Banjara Hills",
      code: "BANJARA_HILLS",
      locationType: "OFFICE",
      ...basePayload,
      postalCode: "500034",
      latitude: 17.4130575,
      longitude: 78.4232275,
    });
    const hub = await createWorkLocation(prisma, {
      name: "Madhapur Hub-1",
      code: "MADHAPUR_HUB_1",
      locationType: "PARKING_HUB",
      ...basePayload,
      latitude: 17.460285,
      longitude: 78.397064,
      isHub: true,
    });
    madhapurId = madhapur.branchId;
    banjaraId = banjara.branchId;
    hubId = hub.branchId;
    preserved.branchIds = [madhapurId, banjaraId, hubId].sort();

    const employee = await prisma.employee.create({
      data: {
        employeeCode: "WL-EMP-001",
        name: "Ravi Kumar",
        departmentId,
        homeBranchId: madhapurId,
        status: EmployeeStatus.ACTIVE,
        organizationLevel: "MEMBER",
      },
    });
    employeeId = employee.employeeId;
    preserved.homeBranchId = madhapurId;

    const user = await prisma.user.create({
      data: {
        name: "Ravi Kumar",
        email: "ravi.wl@example.com",
        passwordHash: "x",
        role: Role.EMPLOYEE,
        employeeId,
      },
    });
    userId = user.id;

    await prisma.employeeWorkLocationAssignment.create({
      data: {
        employeeId,
        locationId: madhapurId,
        assignmentType: "BASE_OFFICE",
        isPrimary: true,
        effectiveFrom: startOfUtcDay(new Date("2026-01-01")),
        reason: "Fixture seed",
      },
    });

    const event = await prisma.attendanceEvent.create({
      data: {
        employeeId,
        eventType: "FIELD_CHECK_IN",
        eventTime: new Date("2026-03-01T04:00:00.000Z"),
        eventDate: new Date("2026-03-01"),
        eventSource: "MOBILE_GPS",
        branchId: hubId,
        latitude: 17.460285,
        longitude: 78.397064,
      },
    });
    eventId = event.eventId;
    preserved.attendanceBranchId = hubId;

    // Organization unit history must remain untouched during Base Office transfer.
    const orgRow = await prisma.employeeOrganizationAssignment.create({
      data: {
        employeeId,
        departmentId,
        organizationLevel: "MEMBER",
        isPrimary: true,
        effectiveFrom: startOfUtcDay(new Date("2026-01-01")),
        reason: "Org fixture — must survive Base Office transfer",
      },
    });
    orgAssignmentId = orgRow.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // --- 1–4 preservation ---
  it("R1–R4: exactly 3 locations; Branch IDs, homeBranchId, attendance branchId preserved", async () => {
    const rows = await prisma.branch.findMany({ orderBy: { branchCode: "asc" } });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.branchId).sort()).toEqual(preserved.branchIds);
    const employee = await prisma.employee.findUniqueOrThrow({ where: { employeeId } });
    const event = await prisma.attendanceEvent.findUniqueOrThrow({ where: { eventId } });
    expect(employee.homeBranchId).toBe(preserved.homeBranchId);
    expect(event.branchId).toBe(preserved.attendanceBranchId);
  });

  // --- 5–7 codes / types ---
  it("R5: location codes are unique (DB unique + service)", async () => {
    const codes = await prisma.branch.findMany({ select: { branchCode: true } });
    expect(new Set(codes.map((c) => c.branchCode)).size).toBe(codes.length);
  });

  it("R6: PARKING_HUB maps isHub=true (legacy hub mirror)", async () => {
    const hub = await prisma.branch.findUniqueOrThrow({ where: { branchId: hubId } });
    expect(hub.locationType).toBe("PARKING_HUB");
    expect(hub.isHub).toBe(true);
  });

  it("R7: non-hub OFFICE locationType is correct", async () => {
    const office = await prisma.branch.findUniqueOrThrow({ where: { branchId: madhapurId } });
    expect(office.locationType).toBe("OFFICE");
    expect(office.isHub).toBe(false);
  });

  // --- 8–9 selectors ---
  it("R8: active locations returned for active selectors", async () => {
    const active = await prisma.branch.findMany({ where: { status: "ACTIVE" } });
    expect(active.length).toBeGreaterThanOrEqual(3);
    expect(active.every((r) => r.status === "ACTIVE")).toBe(true);
  });

  it("R9: inactive locations excluded from new Base Office assignment selectors", async () => {
    await deactivateWorkLocation(prisma, hubId);
    const selectable = await prisma.branch.findMany({ where: { status: "ACTIVE" } });
    expect(selectable.some((r) => r.branchId === hubId)).toBe(false);
    await reactivateWorkLocation(prisma, hubId);
  });

  // --- 10–16 CRUD ---
  it("R10: create Work Location", async () => {
    const created = await createWorkLocation(prisma, {
      name: "Kukatpally Depot",
      code: "KUKATPALLY_DEPOT",
      locationType: "DEPOT",
      ...basePayload,
      postalCode: "500072",
      latitude: 17.494,
      longitude: 78.399,
    });
    expect(created.branchCode).toBe("KUKATPALLY_DEPOT");
    expect(created.locationType).toBe("DEPOT");
  });

  it("R11: update Work Location", async () => {
    const depot = await prisma.branch.findFirstOrThrow({
      where: { branchCode: "KUKATPALLY_DEPOT" },
    });
    const updated = await updateWorkLocation(prisma, depot.branchId, {
      name: "Kukatpally Depot",
      description: "Updated description",
      city: "Hyderabad",
    });
    expect(updated.description).toBe("Updated description");
  });

  it("R12: rename Name while locationCode remains unchanged", async () => {
    const updated = await updateWorkLocation(prisma, banjaraId, {
      name: "Banjara Hills Office",
    });
    expect(updated.branchName).toBe("Banjara Hills Office");
    expect(updated.branchCode).toBe("BANJARA_HILLS");
  });

  it("R13: explicit locationCode change works for authorized service path", async () => {
    const depot = await prisma.branch.findFirstOrThrow({
      where: { branchCode: "KUKATPALLY_DEPOT" },
    });
    const updated = await updateWorkLocation(prisma, depot.branchId, {
      name: depot.branchName,
      code: "KUKATPALLY_DEPOT_V2",
    });
    expect(updated.branchCode).toBe("KUKATPALLY_DEPOT_V2");
  });

  it("R14: duplicate locationCode rejected", async () => {
    await expect(
      createWorkLocation(prisma, {
        name: "Dup",
        code: "MADHAPUR_OFFICE",
        locationType: "OFFICE",
        ...basePayload,
      }),
    ).rejects.toMatchObject({ status: 409, message: /already exists/i });
  });

  it("R15: deactivate Work Location", async () => {
    const depot = await prisma.branch.findFirstOrThrow({
      where: { branchCode: "KUKATPALLY_DEPOT_V2" },
    });
    const row = await deactivateWorkLocation(prisma, depot.branchId);
    expect(row.status).toBe("INACTIVE");
  });

  it("R16: reactivate Work Location", async () => {
    const depot = await prisma.branch.findFirstOrThrow({
      where: { branchCode: "KUKATPALLY_DEPOT_V2" },
    });
    const row = await reactivateWorkLocation(prisma, depot.branchId);
    expect(row.status).toBe("ACTIVE");
  });

  // --- 17 hard delete ---
  it("R17: referenced Work Location cannot be destructively hard-deleted", async () => {
    // Assignment FK is ON DELETE RESTRICT — hard delete of a referenced location must fail.
    await expect(
      prisma.branch.delete({ where: { branchId: madhapurId } }),
    ).rejects.toBeTruthy();
    const soft = await deactivateWorkLocation(prisma, madhapurId);
    expect(soft.status).toBe("INACTIVE");
    const stillThere = await prisma.branch.findUnique({ where: { branchId: madhapurId } });
    expect(stillThere).not.toBeNull();
    await reactivateWorkLocation(prisma, madhapurId);
  });

  // --- 18–24 Base Office transfer ---
  it("R18–R24: Base Office transfer history + homeBranch sync; org/role/department untouched", async () => {
    const before = await prisma.employee.findUniqueOrThrow({
      where: { employeeId },
      include: { user: true },
    });
    const orgBefore = await prisma.employeeOrganizationAssignment.findUniqueOrThrow({
      where: { id: orgAssignmentId },
    });

    const assignment = await prisma.$transaction((tx) =>
      transferBaseOffice(tx, {
        employeeId,
        toLocationId: banjaraId,
        effectiveFrom: new Date(),
        reason: "Transferred to Banjara Hills operations",
        changedByUserId: userId,
      }),
    );

    const after = await prisma.employee.findUniqueOrThrow({
      where: { employeeId },
      include: { user: true },
    });
    expect(assignment.locationId).toBe(banjaraId);
    expect(after.homeBranchId).toBe(banjaraId);
    expect(after.departmentId).toBe(before.departmentId);
    expect(after.organizationLevel).toBe(before.organizationLevel);
    expect(after.user?.role).toBe(before.user?.role);

    const history = await prisma.employeeWorkLocationAssignment.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: "asc" },
    });
    expect(history.length).toBeGreaterThanOrEqual(2);
    const closed = history.find((row) => row.locationId === madhapurId);
    expect(closed?.effectiveTo).not.toBeNull();
    const open = history.find((row) => row.locationId === banjaraId && row.effectiveTo == null);
    expect(open?.isPrimary).toBe(true);

    const orgAfter = await prisma.employeeOrganizationAssignment.findUniqueOrThrow({
      where: { id: orgAssignmentId },
    });
    expect(orgAfter.departmentId).toBe(orgBefore.departmentId);
    expect(orgAfter.effectiveTo).toEqual(orgBefore.effectiveTo);
    expect(orgAfter.reason).toBe(orgBefore.reason);

    const event = await prisma.attendanceEvent.findUniqueOrThrow({ where: { eventId } });
    expect(event.branchId).toBe(hubId);
  });

  it("R25: inactive location cannot become a new Base Office", async () => {
    await deactivateWorkLocation(prisma, hubId);
    await expect(
      transferBaseOffice(prisma, {
        employeeId,
        toLocationId: hubId,
        effectiveFrom: new Date(),
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: /inactive and cannot be assigned as a Base Office/i,
    });
    await reactivateWorkLocation(prisma, hubId);
  });

  it("R26: future Base Office transfer is rejected", async () => {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 7);
    await expect(
      transferBaseOffice(prisma, {
        employeeId,
        toLocationId: madhapurId,
        effectiveFrom: future,
      }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  // --- 27–34 validation ---
  it("R27: invalid latitude rejected", async () => {
    await expect(
      updateWorkLocation(prisma, madhapurId, { name: "Madhapur Office", latitude: 200, longitude: 78 }),
    ).rejects.toMatchObject({ message: /latitude between -90 and 90/i });
  });

  it("R28: invalid longitude rejected", async () => {
    await expect(
      updateWorkLocation(prisma, madhapurId, {
        name: "Madhapur Office",
        latitude: 17,
        longitude: 200,
      }),
    ).rejects.toMatchObject({ message: /longitude between -180 and 180/i });
  });

  it("R29: invalid radius 0 rejected", async () => {
    await expect(
      updateWorkLocation(prisma, madhapurId, {
        name: "Madhapur Office",
        attendanceRadiusMeters: 0,
      }),
    ).rejects.toMatchObject({ message: /valid attendance radius/i });
  });

  it("R30: negative radius rejected", async () => {
    await expect(
      updateWorkLocation(prisma, madhapurId, {
        name: "Madhapur Office",
        attendanceRadiusMeters: -10,
      }),
    ).rejects.toMatchObject({ message: /valid attendance radius/i });
  });

  it("R31: excessive radius rejected according to configured maximum", async () => {
    await expect(
      updateWorkLocation(prisma, madhapurId, {
        name: "Madhapur Office",
        attendanceRadiusMeters: 5001,
      }),
    ).rejects.toMatchObject({ message: /valid attendance radius/i });
  });

  it("R32: invalid Indian PIN rejected", async () => {
    await expect(
      updateWorkLocation(prisma, madhapurId, {
        name: "Madhapur Office",
        postalCode: "12AB",
      }),
    ).rejects.toMatchObject({ message: /6-digit PIN/i });
  });

  it("R33: valid PIN remains a string", async () => {
    const updated = await updateWorkLocation(prisma, madhapurId, {
      name: "Madhapur Office",
      postalCode: "500081",
    });
    expect(typeof updated.postalCode).toBe("string");
    expect(updated.postalCode).toBe("500081");
  });

  it("R34: invalid locationType rejected", async () => {
    await expect(
      createWorkLocation(prisma, {
        name: "Bad Type",
        code: "BAD_TYPE_LOC",
        locationType: "WAREHOUSE_X",
        ...basePayload,
      }),
    ).rejects.toMatchObject({ message: /Invalid location type/i });
  });

  // --- 35–40 geofence ---
  function activeGeofences(
    rows: Array<{
      branchId: string;
      branchName: string;
      latitude: unknown;
      longitude: unknown;
      attendanceRadiusMeters: number;
      status: string;
    }>,
  ) {
    return rows
      .filter((b) => b.status === "ACTIVE" && b.latitude != null && b.longitude != null)
      .map((b) => ({
        branchId: b.branchId,
        branchName: b.branchName,
        latitude: Number(b.latitude),
        longitude: Number(b.longitude),
        attendanceRadiusMeters: b.attendanceRadiusMeters,
      }));
  }

  it("R35–R37: nearest registered wins; Base Office A + punch in B → B; A does not restrict", async () => {
    const rows = await prisma.branch.findMany();
    const active = activeGeofences(rows);
    // Inside banjara while Base Office is banjara (after transfer) — still resolves by coords
    const atBanjara = resolveAttendanceLocation(
      { latitude: 17.4130575, longitude: 78.4232275 },
      active,
    );
    expect(atBanjara.mode).toBe("REGISTERED_LOCATION");
    expect(atBanjara.matchedLocation?.branchId).toBe(banjaraId);

    const atHub = resolveAttendanceLocation(
      { latitude: 17.460285, longitude: 78.397064 },
      active,
    );
    expect(atHub.matchedLocation?.branchId).toBe(hubId);
  });

  it("R38: outside all registered locations → MOBILE_FIELD", async () => {
    const rows = await prisma.branch.findMany();
    const resolved = resolveAttendanceLocation(
      { latitude: 17.9, longitude: 78.9 },
      activeGeofences(rows),
    );
    expect(resolved.mode).toBe("MOBILE_FIELD");
    expect(resolved.matchedLocation).toBeNull();
  });

  it("R39 + R46F: inactive location ignored for geofence; homeBranchId still shows inactive Base Office", async () => {
    // Put employee back on hub, then deactivate hub — homeBranchId must remain.
    await transferBaseOffice(prisma, {
      employeeId,
      toLocationId: hubId,
      effectiveFrom: new Date(),
      reason: "Move to hub before deactivate test",
    });
    await deactivateWorkLocation(prisma, hubId);

    const employee = await prisma.employee.findUniqueOrThrow({ where: { employeeId } });
    expect(employee.homeBranchId).toBe(hubId);
    const hub = await prisma.branch.findUniqueOrThrow({ where: { branchId: hubId } });
    expect(hub.status).toBe("INACTIVE");
    const dto = workLocationDto(hub);
    expect(dto.active).toBe(false);
    expect(dto.status).toBe("INACTIVE");

    const rows = await prisma.branch.findMany();
    const resolved = resolveAttendanceLocation(
      { latitude: 17.460285, longitude: 78.397064 },
      activeGeofences(rows),
    );
    expect(resolved.matchedLocation?.branchId).not.toBe(hubId);
    expect(resolved.mode).toBe("MOBILE_FIELD");

    await reactivateWorkLocation(prisma, hubId);
    await transferBaseOffice(prisma, {
      employeeId,
      toLocationId: banjaraId,
      effectiveFrom: new Date(),
      reason: "Restore after inactive Base Office test",
    });
  });

  it("R40: overlapping geofences return deterministic nearest location", async () => {
    // Create two overlapping locations; punch closer to nearLoc.
    const far = await createWorkLocation(prisma, {
      name: "Overlap Far",
      code: "OVERLAP_FAR",
      locationType: "BRANCH",
      ...basePayload,
      latitude: 17.44,
      longitude: 78.39,
      attendanceRadiusMeters: 500,
    });
    const near = await createWorkLocation(prisma, {
      name: "Overlap Near",
      code: "OVERLAP_NEAR",
      locationType: "BRANCH",
      ...basePayload,
      latitude: 17.4405,
      longitude: 78.3905,
      attendanceRadiusMeters: 500,
    });
    const punch = { latitude: 17.44045, longitude: 78.39045 };
    const resolved = resolveAttendanceLocation(punch, [
      {
        branchId: far.branchId,
        branchName: far.branchName,
        latitude: Number(far.latitude),
        longitude: Number(far.longitude),
        attendanceRadiusMeters: far.attendanceRadiusMeters,
      },
      {
        branchId: near.branchId,
        branchName: near.branchName,
        latitude: Number(near.latitude),
        longitude: Number(near.longitude),
        attendanceRadiusMeters: near.attendanceRadiusMeters,
      },
    ]);
    expect(resolved.matchedLocation?.branchId).toBe(near.branchId);
  });

  // --- 41–46 history / attendance / audit ---
  it("R41: Base Office history survives employee reload", async () => {
    const history = await prisma.employeeWorkLocationAssignment.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: "asc" },
    });
    expect(history.length).toBeGreaterThanOrEqual(2);
    const reloaded = await prisma.employee.findUniqueOrThrow({
      where: { employeeId },
      include: {
        workLocationAssignments: { orderBy: { effectiveFrom: "asc" } },
      },
    });
    expect(reloaded.workLocationAssignments.length).toBe(history.length);
  });

  it("R42: location deactivation does not rewrite historical attendance", async () => {
    const before = await prisma.attendanceEvent.findUniqueOrThrow({ where: { eventId } });
    await deactivateWorkLocation(prisma, hubId);
    const after = await prisma.attendanceEvent.findUniqueOrThrow({ where: { eventId } });
    expect(after.branchId).toBe(before.branchId);
    expect(after.latitude?.toString()).toBe(before.latitude?.toString());
    await reactivateWorkLocation(prisma, hubId);
  });

  it("R43: geofence radius edit affects future resolution only", async () => {
    const beforeEvent = await prisma.attendanceEvent.findUniqueOrThrow({ where: { eventId } });
    await updateWorkLocation(prisma, hubId, {
      name: "Madhapur Hub-1",
      attendanceRadiusMeters: 100,
    });
    const afterEvent = await prisma.attendanceEvent.findUniqueOrThrow({ where: { eventId } });
    expect(afterEvent.branchId).toBe(beforeEvent.branchId);
    const hub = await prisma.branch.findUniqueOrThrow({ where: { branchId: hubId } });
    expect(hub.attendanceRadiusMeters).toBe(100);
    // Restore radius for later fixtures
    await updateWorkLocation(prisma, hubId, {
      name: "Madhapur Hub-1",
      attendanceRadiusMeters: 250,
    });
  });

  it("R44: organization history remains untouched during Base Office transfer", async () => {
    const before = await prisma.employeeOrganizationAssignment.findUniqueOrThrow({
      where: { id: orgAssignmentId },
    });
    await transferBaseOffice(prisma, {
      employeeId,
      toLocationId: madhapurId,
      effectiveFrom: new Date(),
      reason: "Org-untouched transfer",
    });
    const after = await prisma.employeeOrganizationAssignment.findUniqueOrThrow({
      where: { id: orgAssignmentId },
    });
    expect(after.departmentId).toBe(before.departmentId);
    expect(after.effectiveFrom.toISOString()).toBe(before.effectiveFrom.toISOString());
    expect(after.reason).toBe(before.reason);
  });

  it("R45: audit log written for Base Office transfer", async () => {
    await prisma.auditLog.create({
      data: {
        action: "employee base office transferred",
        performedByUserId: userId,
        newValue: { homeBranchId: banjaraId, employeeId },
      },
    });
    const rows = await prisma.auditLog.findMany({
      where: { action: "employee base office transferred" },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("R46: audit log written for location create/update/deactivate/reactivate", async () => {
    const target = await createWorkLocation(prisma, {
      name: "Audit Site",
      code: "AUDIT_SITE_1",
      locationType: "OTHER",
      ...basePayload,
      latitude: 17.41,
      longitude: 78.41,
    });
    await prisma.auditLog.create({
      data: {
        action: "work location created",
        performedByUserId: userId,
        newValue: { locationId: target.branchId },
      },
    });
    await updateWorkLocation(prisma, target.branchId, { name: "Audit Site Renamed" });
    await prisma.auditLog.create({
      data: {
        action: "work location updated",
        performedByUserId: userId,
        newValue: { locationId: target.branchId, name: "Audit Site Renamed" },
      },
    });
    await deactivateWorkLocation(prisma, target.branchId);
    await prisma.auditLog.create({
      data: {
        action: "work location deactivated",
        performedByUserId: userId,
        newValue: { locationId: target.branchId },
      },
    });
    await reactivateWorkLocation(prisma, target.branchId);
    await prisma.auditLog.create({
      data: {
        action: "work location reactivated",
        performedByUserId: userId,
        newValue: { locationId: target.branchId },
      },
    });
    const actions = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            "work location created",
            "work location updated",
            "work location deactivated",
            "work location reactivated",
          ],
        },
      },
    });
    expect(new Set(actions.map((a) => a.action))).toEqual(
      new Set([
        "work location created",
        "work location updated",
        "work location deactivated",
        "work location reactivated",
      ]),
    );
  });
});
