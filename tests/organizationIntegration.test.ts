/**
 * DB-backed organization structure integration tests.
 * Requires disposable MySQL: scripts/org-migration-rehearsal.sh
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, Role, EmployeeStatus } from "@prisma/client";
import {
  addHeadAssignment,
  addViewerAssignment,
  endHeadAssignment,
  getActivePrimaryOrgAssignment,
  transferEmployeeOrganization,
  syncPrimaryHeadCache,
} from "../server/src/organizationAssignments.js";
import { startOfUtcDay } from "../server/src/organizationStructure.js";
import { resolveOrganizationApproversFromGraph } from "../server/src/organizationApprovers.js";
import type { OrganizationUnitRow } from "../server/src/organizationStructure.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient();

describe("organization integration (MySQL)", () => {
  let analyticsId: string;
  let operationsId: string;
  let insideSalesId: string;
  let cosId: string;
  let empA: string;
  let empB: string;
  let headOps: string;
  let headSales1: string;
  let headSales2: string;
  let viewerId: string;
  let ceoEmployeeId: string;
  let empAUserId: string;

  beforeAll(async () => {
    if (!DATABASE_URL.includes("3308") && process.env.RUN_ORG_INTEGRATION !== "1") {
      throw new Error("Set DATABASE_URL to the disposable MySQL 8 test database before running this suite");
    }
    await prisma.employeeOrganizationAssignment.deleteMany();
    await prisma.departmentHeadAssignment.deleteMany();
    await prisma.departmentViewerAssignment.deleteMany();
    await prisma.user.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.department.deleteMany();

    cosId = (
      await prisma.department.create({
        data: { name: "Chief of Staff", unitCode: "CHIEF_OF_STAFF", unitType: "TEAM", sortOrder: 0 },
      })
    ).departmentId;
    operationsId = (
      await prisma.department.create({
        data: {
          name: "Operations Department",
          unitCode: "OPERATIONS",
          parentDepartmentId: cosId,
          unitType: "TEAM",
          sortOrder: 1,
        },
      })
    ).departmentId;
    analyticsId = (
      await prisma.department.create({
        data: {
          name: "Analytics",
          unitCode: "ANALYTICS",
          parentDepartmentId: operationsId,
          unitType: "SUBTEAM",
          sortOrder: 2,
        },
      })
    ).departmentId;
    insideSalesId = (
      await prisma.department.create({
        data: {
          name: "Inside Sales",
          unitCode: "INSIDE_SALES",
          parentDepartmentId: cosId,
          unitType: "TEAM",
          sortOrder: 3,
        },
      })
    ).departmentId;

    const ceo = await prisma.employee.create({
      data: {
        employeeCode: "CEO-1",
        name: "CEO Person",
        email: "ceo@test.local",
        status: EmployeeStatus.ACTIVE,
        organizationLevel: "HEAD",
        joiningDate: new Date("2020-01-01"),
      },
    });
    ceoEmployeeId = ceo.employeeId;
    await prisma.user.create({
      data: {
        employeeId: ceo.employeeId,
        name: ceo.name,
        email: ceo.email!,
        role: Role.CEO,
        passwordHash: "x",
      },
    });

    headOps = (
      await prisma.employee.create({
        data: {
          employeeCode: "OPS-H",
          name: "Ops Head",
          email: "ops@test.local",
          status: EmployeeStatus.ACTIVE,
          departmentId: operationsId,
          organizationLevel: "HEAD",
        },
      })
    ).employeeId;

    headSales1 = (
      await prisma.employee.create({
        data: {
          employeeCode: "IS-1",
          name: "Sales Head 1",
          email: "is1@test.local",
          status: EmployeeStatus.ACTIVE,
          departmentId: insideSalesId,
          organizationLevel: "HEAD",
        },
      })
    ).employeeId;
    headSales2 = (
      await prisma.employee.create({
        data: {
          employeeCode: "IS-2",
          name: "Sales Head 2",
          email: "is2@test.local",
          status: EmployeeStatus.ACTIVE,
          departmentId: insideSalesId,
          organizationLevel: "HEAD",
        },
      })
    ).employeeId;

    empA = (
      await prisma.employee.create({
        data: {
          employeeCode: "AN-1",
          name: "Analyst",
          email: "an@test.local",
          status: EmployeeStatus.ACTIVE,
          departmentId: analyticsId,
          organizationLevel: "MEMBER",
          joiningDate: new Date("2024-06-01"),
        },
      })
    ).employeeId;
    empAUserId = (
      await prisma.user.create({
        data: {
          employeeId: empA,
          name: "Analyst Login",
          email: "analyst-login@test.local",
          role: Role.EMPLOYEE,
          passwordHash: "x",
        },
      })
    ).id;

    empB = (
      await prisma.employee.create({
        data: {
          employeeCode: "HR-1",
          name: "Member B",
          email: "b@test.local",
          status: EmployeeStatus.ACTIVE,
          departmentId: operationsId,
          organizationLevel: "MEMBER",
        },
      })
    ).employeeId;

    viewerId = (
      await prisma.employee.create({
        data: {
          employeeCode: "V-1",
          name: "Viewer Only",
          email: "view@test.local",
          status: EmployeeStatus.ACTIVE,
          departmentId: cosId,
          organizationLevel: "MEMBER",
        },
      })
    ).employeeId;

    await prisma.$transaction(async (tx) => {
      await addHeadAssignment(tx, {
        departmentId: operationsId,
        employeeId: headOps,
        isPrimary: true,
        effectiveFrom: startOfUtcDay(new Date("2024-01-01")),
      });
      await addHeadAssignment(tx, {
        departmentId: insideSalesId,
        employeeId: headSales1,
        isPrimary: true,
        effectiveFrom: startOfUtcDay(new Date("2024-01-01")),
      });
      await addHeadAssignment(tx, {
        departmentId: insideSalesId,
        employeeId: headSales2,
        isPrimary: false,
        effectiveFrom: startOfUtcDay(new Date("2024-01-01")),
      });
      await addViewerAssignment(tx, {
        departmentId: analyticsId,
        employeeId: viewerId,
        effectiveFrom: startOfUtcDay(new Date("2024-01-01")),
      });
      for (const [employeeId, departmentId] of [
        [empA, analyticsId],
        [empB, operationsId],
      ] as const) {
        await tx.employeeOrganizationAssignment.create({
          data: {
            employeeId,
            departmentId,
            organizationLevel: "MEMBER",
            isPrimary: true,
            effectiveFrom: startOfUtcDay(new Date("2024-01-01")),
          },
        });
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("preserves existing user roles", async () => {
    const user = await prisma.user.findFirst({ where: { role: Role.CEO } });
    expect(user?.role).toBe(Role.CEO);
    const ceoEmployee = await prisma.employee.findUniqueOrThrow({ where: { employeeId: ceoEmployeeId } });
    expect(ceoEmployee.departmentId).toBeNull();
  });

  it("transfers employee transactionally", async () => {
    const beforeRole = await prisma.user.findUniqueOrThrow({ where: { id: empAUserId } });
    await prisma.$transaction((tx) =>
      transferEmployeeOrganization(tx, {
        employeeId: empA,
        newOrganizationUnitId: operationsId,
        effectiveDate: startOfUtcDay(new Date()),
        reason: "Test transfer",
      }),
    );
    const employee = await prisma.employee.findUniqueOrThrow({ where: { employeeId: empA } });
    expect(employee.departmentId).toBe(operationsId);
    const active = await getActivePrimaryOrgAssignment(prisma, empA);
    expect(active?.departmentId).toBe(operationsId);
    const history = await prisma.employeeOrganizationAssignment.findMany({
      where: { employeeId: empA, isPrimary: true },
      orderBy: { effectiveFrom: "asc" },
    });
    expect(history).toHaveLength(2);
    expect(history[0]?.effectiveTo).not.toBeNull();
    const afterRole = await prisma.user.findUniqueOrThrow({ where: { id: empAUserId } });
    expect(afterRole?.role).toBe(beforeRole?.role);
  });

  it("rolls back on invalid transfer target", async () => {
    const employeeBefore = await prisma.employee.findUniqueOrThrow({ where: { employeeId: empB } });
    await expect(
      prisma.$transaction((tx) =>
        transferEmployeeOrganization(tx, {
          employeeId: empB,
          newOrganizationUnitId: "missing-unit",
          effectiveDate: startOfUtcDay(new Date()),
        }),
      ),
    ).rejects.toThrow();
    const employeeAfter = await prisma.employee.findUniqueOrThrow({ where: { employeeId: empB } });
    expect(employeeAfter.departmentId).toBe(employeeBefore.departmentId);
  });

  it("rejects future-effective transfer", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await expect(
      prisma.$transaction((tx) =>
        transferEmployeeOrganization(tx, {
          employeeId: empB,
          newOrganizationUnitId: analyticsId,
          effectiveDate: startOfUtcDay(tomorrow),
        }),
      ),
    ).rejects.toThrow(/Future-effective/);
  });

  it("syncs primary head cache after primary ends", async () => {
    const heads = await prisma.departmentHeadAssignment.findMany({
      where: { departmentId: insideSalesId, effectiveTo: null },
    });
    const primary = heads.find((row) => row.isPrimary)!;
    await prisma.$transaction((tx) =>
      endHeadAssignment(tx, primary.id, startOfUtcDay(new Date()), { reason: "Test end" }),
    );
    const dept = await prisma.department.findUniqueOrThrow({ where: { departmentId: insideSalesId } });
    expect(dept.headEmployeeId).toBeTruthy();
    expect(dept.headEmployeeId).toBe(headSales2);
    await syncPrimaryHeadCache(prisma, insideSalesId);
  });

  it("supports head re-assignment for the same employee later", async () => {
    const later = new Date();
    later.setDate(later.getDate() + 2);
    const recreated = await prisma.$transaction((tx) =>
      addHeadAssignment(tx, {
        departmentId: insideSalesId,
        employeeId: headSales1,
        isPrimary: false,
        effectiveFrom: startOfUtcDay(later),
      }),
    );
    expect(recreated.employeeId).toBe(headSales1);
    const rows = await prisma.departmentHeadAssignment.findMany({
      where: { departmentId: insideSalesId, employeeId: headSales1 },
    });
    expect(rows.length).toBe(2);
  });

  it("keeps only one active primary head when a new primary is added", async () => {
    await prisma.$transaction((tx) =>
      addHeadAssignment(tx, {
        departmentId: operationsId,
        employeeId: empB,
        isPrimary: true,
        effectiveFrom: startOfUtcDay(new Date()),
      }),
    );
    const activePrimaries = await prisma.departmentHeadAssignment.findMany({
      where: { departmentId: operationsId, effectiveTo: null, isPrimary: true },
    });
    expect(activePrimaries).toHaveLength(1);
    const dept = await prisma.department.findUniqueOrThrow({ where: { departmentId: operationsId } });
    expect(dept.headEmployeeId).toBe(empB);
  });

  it("supports multiple active heads on the same unit", async () => {
    const activeHeads = await prisma.departmentHeadAssignment.findMany({
      where: { departmentId: insideSalesId, effectiveTo: null },
    });
    expect(activeHeads.length).toBeGreaterThanOrEqual(2);
  });

  it("resolves approver fallback upward", async () => {
    const units: OrganizationUnitRow[] = (
      await prisma.department.findMany({
        select: {
          departmentId: true,
          name: true,
          unitCode: true,
          parentDepartmentId: true,
          active: true,
        },
      })
    ).map((row) => ({ ...row, sortOrder: 0 }));
    const headRows = await prisma.departmentHeadAssignment.findMany({
      where: { effectiveTo: null },
      include: { employee: true },
    });
    const approvers = resolveOrganizationApproversFromGraph({
      employeeId: empA,
      primaryUnitId: analyticsId,
      units,
      headAssignments: headRows.map((row) => ({
        departmentId: row.departmentId,
        employeeId: row.employeeId,
        isPrimary: row.isPrimary,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        employeeName: row.employee.name,
        employeeCode: row.employee.employeeCode,
      })),
    });
    expect(approvers.some((row) => row.departmentId === operationsId)).toBe(true);
  });

  it("rejects inactive unit transfer", async () => {
    await prisma.department.update({
      where: { departmentId: analyticsId },
      data: { active: false },
    });
    await expect(
      prisma.$transaction((tx) =>
        transferEmployeeOrganization(tx, {
          employeeId: empB,
          newOrganizationUnitId: analyticsId,
          effectiveDate: startOfUtcDay(new Date()),
        }),
      ),
    ).rejects.toThrow(/inactive/);
  });

  it("retains and ends viewer history correctly", async () => {
    const current = await prisma.departmentViewerAssignment.findFirstOrThrow({
      where: { departmentId: analyticsId, employeeId: viewerId, effectiveTo: null },
    });
    await prisma.departmentViewerAssignment.update({
      where: { id: current.id },
      data: { effectiveTo: startOfUtcDay(new Date()) },
    });
    const active = await prisma.departmentViewerAssignment.findMany({
      where: { departmentId: analyticsId, employeeId: viewerId, effectiveTo: null },
    });
    expect(active).toHaveLength(0);
    const history = await prisma.departmentViewerAssignment.findMany({
      where: { departmentId: analyticsId, employeeId: viewerId },
    });
    expect(history.length).toBeGreaterThanOrEqual(1);
  });

  it("maintains exactly one active primary org assignment per assigned employee", async () => {
    const rows = await prisma.employeeOrganizationAssignment.findMany({
      where: { isPrimary: true, effectiveTo: null },
    });
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.employeeId, (counts.get(row.employeeId) ?? 0) + 1);
    expect([...counts.values()].every((count) => count === 1)).toBe(true);
  });
});
