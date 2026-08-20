import type { Express } from "express";
import { Role, EmployeeStatus } from "@prisma/client";
import { audit } from "./audit.js";
import { asyncHandler, HttpError } from "./errors.js";
import { prisma } from "./prisma.js";
import {
  organizationEndAssignmentSchema,
  organizationHeadAssignSchema,
  organizationTransferSchema,
  organizationViewerAssignSchema,
} from "./schemas.js";
import {
  addHeadAssignment,
  addViewerAssignment,
  endHeadAssignment,
  endViewerAssignment,
  getActiveHeadAssignmentsForUnit,
  getActiveViewerAssignmentsForUnit,
  loadOrganizationUnits,
  setPrimaryHeadAssignment,
  transferEmployeeOrganization,
} from "./organizationAssignments.js";
import {
  descendantUnitIds,
  startOfUtcDay,
} from "./organizationStructure.js";
import { resolveOrganizationApprovers } from "./organizationApprovers.js";
import { canAccessPeopleDirectory, requireAuth, requireRoles } from "./rbac.js";

function employeeIdentitySelect() {
  return { employeeId: true, name: true, employeeCode: true, designation: true } as const;
}

function assignmentDto(row: {
  id: string;
  employeeId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isPrimary?: boolean;
  reason?: string | null;
  employee?: { employeeId: string; name: string; employeeCode: string; designation: string | null };
}) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee?.name,
    employeeCode: row.employee?.employeeCode,
    designation: row.employee?.designation,
    isPrimary: row.isPrimary ?? false,
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo?.toISOString().slice(0, 10) ?? null,
    reason: row.reason ?? undefined,
  };
}

export function registerOrganizationRoutes(app: Express) {
  const structureGate = requireRoles(Role.DEVELOPER_ADMIN);
  const readGate = asyncHandler(async (req, res, next) => {
    if (!(await canAccessPeopleDirectory(req.user))) {
      throw new HttpError(403, "Insufficient permissions");
    }
    next();
  });

  app.get(
    "/organization/tree",
    requireAuth,
    readGate,
    asyncHandler(async (_req, res) => {
      const units = await loadOrganizationUnits(prisma);
      const memberCounts = await prisma.employee.groupBy({
        by: ["departmentId"],
        where: { status: EmployeeStatus.ACTIVE, departmentId: { not: null } },
        _count: { _all: true },
      });
      const direct = new Map(
        memberCounts
          .filter((row): row is typeof row & { departmentId: string } => Boolean(row.departmentId))
          .map((row) => [row.departmentId, row._count._all]),
      );
      res.json(
        units.map((unit) => {
          const descendants = descendantUnitIds(unit.departmentId, units);
          let totalDescendant = 0;
          for (const id of descendants) totalDescendant += direct.get(id) ?? 0;
          return {
            id: unit.departmentId,
            name: unit.name,
            unitCode: unit.unitCode,
            unitType: unit.unitType,
            parentDepartmentId: unit.parentDepartmentId,
            active: unit.active,
            sortOrder: unit.sortOrder,
            directEmployeeCount: direct.get(unit.departmentId) ?? 0,
            totalDescendantEmployeeCount: totalDescendant,
          };
        }),
      );
    }),
  );

  app.get(
    "/organization/units/:id/heads",
    requireAuth,
    readGate,
    asyncHandler(async (req, res) => {
      const active = await getActiveHeadAssignmentsForUnit(prisma, String(req.params.id));
      res.json(active.map(assignmentDto));
    }),
  );

  app.get(
    "/organization/units/:id/heads/history",
    requireAuth,
    structureGate,
    asyncHandler(async (req, res) => {
      const rows = await prisma.departmentHeadAssignment.findMany({
        where: { departmentId: String(req.params.id) },
        include: { employee: { select: employeeIdentitySelect() } },
        orderBy: [{ effectiveFrom: "desc" }],
      });
      res.json(rows.map(assignmentDto));
    }),
  );

  app.post(
    "/organization/units/:id/heads",
    requireAuth,
    structureGate,
    asyncHandler(async (req, res) => {
      const body = organizationHeadAssignSchema.parse(req.body);
      const created = await prisma.$transaction((tx) =>
        addHeadAssignment(tx, {
          departmentId: String(req.params.id),
          employeeId: body.employeeId,
          isPrimary: body.isPrimary,
          effectiveFrom: body.effectiveFrom,
          assignedByUserId: req.user!.id,
          reason: body.reason,
        }),
      );
      await audit({
        action: "organization head assigned",
        performedByUserId: req.user!.id,
        newValue: { departmentId: String(req.params.id), ...assignmentDto(created) },
        ipAddress: req.ip,
      });
      res.status(201).json(assignmentDto(created));
    }),
  );

  app.post(
    "/organization/units/:id/heads/:assignmentId/end",
    requireAuth,
    structureGate,
    asyncHandler(async (req, res) => {
      const body = organizationEndAssignmentSchema.parse(req.body);
      const updated = await prisma.$transaction((tx) =>
        endHeadAssignment(tx, String(req.params.assignmentId), body.effectiveTo, {
          assignedByUserId: req.user!.id,
          reason: body.reason,
        }),
      );
      await audit({
        action: "organization head ended",
        performedByUserId: req.user!.id,
        newValue: assignmentDto(updated),
        ipAddress: req.ip,
      });
      res.json(assignmentDto(updated));
    }),
  );

  app.post(
    "/organization/units/:id/heads/:assignmentId/primary",
    requireAuth,
    structureGate,
    asyncHandler(async (req, res) => {
      const reason =
        typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : undefined;
      const updated = await prisma.$transaction((tx) =>
        setPrimaryHeadAssignment(tx, String(req.params.assignmentId), {
          assignedByUserId: req.user!.id,
          reason,
        }),
      );
      await audit({
        action: "organization head primary changed",
        performedByUserId: req.user!.id,
        newValue: assignmentDto(updated),
        ipAddress: req.ip,
      });
      res.json(assignmentDto(updated));
    }),
  );

  app.get(
    "/organization/units/:id/viewers",
    requireAuth,
    readGate,
    asyncHandler(async (req, res) => {
      const active = await getActiveViewerAssignmentsForUnit(prisma, String(req.params.id));
      res.json(active.map(assignmentDto));
    }),
  );

  app.get(
    "/organization/units/:id/viewers/history",
    requireAuth,
    structureGate,
    asyncHandler(async (req, res) => {
      const rows = await prisma.departmentViewerAssignment.findMany({
        where: { departmentId: String(req.params.id) },
        include: { employee: { select: employeeIdentitySelect() } },
        orderBy: [{ effectiveFrom: "desc" }],
      });
      res.json(rows.map(assignmentDto));
    }),
  );

  app.post(
    "/organization/units/:id/viewers",
    requireAuth,
    structureGate,
    asyncHandler(async (req, res) => {
      const body = organizationViewerAssignSchema.parse(req.body);
      const created = await prisma.$transaction((tx) =>
        addViewerAssignment(tx, {
          departmentId: String(req.params.id),
          employeeId: body.employeeId,
          effectiveFrom: body.effectiveFrom,
          assignedByUserId: req.user!.id,
          reason: body.reason,
        }),
      );
      await audit({
        action: "organization viewer assigned",
        performedByUserId: req.user!.id,
        newValue: { departmentId: String(req.params.id), ...assignmentDto(created) },
        ipAddress: req.ip,
      });
      res.status(201).json(assignmentDto(created));
    }),
  );

  app.post(
    "/organization/units/:id/viewers/:assignmentId/end",
    requireAuth,
    structureGate,
    asyncHandler(async (req, res) => {
      const body = organizationEndAssignmentSchema.parse(req.body);
      const updated = await prisma.$transaction((tx) =>
        endViewerAssignment(tx, String(req.params.assignmentId), body.effectiveTo, {
          assignedByUserId: req.user!.id,
          reason: body.reason,
        }),
      );
      await audit({
        action: "organization viewer ended",
        performedByUserId: req.user!.id,
        newValue: assignmentDto(updated),
        ipAddress: req.ip,
      });
      res.json(assignmentDto(updated));
    }),
  );

  app.get(
    "/organization/employees/:id/assignments",
    requireAuth,
    readGate,
    asyncHandler(async (req, res) => {
      const rows = await prisma.employeeOrganizationAssignment.findMany({
        where: { employeeId: String(req.params.id) },
        include: { department: { select: { departmentId: true, name: true, unitCode: true } } },
        orderBy: [{ effectiveFrom: "desc" }],
      });
      res.json(
        rows.map((row) => ({
          id: row.id,
          employeeId: row.employeeId,
          organizationUnitId: row.departmentId,
          organizationUnitName: row.department.name,
          unitCode: row.department.unitCode,
          organizationLevel: row.organizationLevel,
          isPrimary: row.isPrimary,
          effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
          effectiveTo: row.effectiveTo?.toISOString().slice(0, 10) ?? null,
          reason: row.reason ?? undefined,
        })),
      );
    }),
  );

  app.post(
    "/organization/employees/transfer",
    requireAuth,
    structureGate,
    asyncHandler(async (req, res) => {
      const body = organizationTransferSchema.parse(req.body);
      const result = await prisma.$transaction((tx) =>
        transferEmployeeOrganization(tx, {
          employeeId: body.employeeId,
          newOrganizationUnitId: body.newOrganizationUnitId,
          newOrganizationLevel: body.newOrganizationLevel,
          effectiveDate: body.effectiveDate,
          changedByUserId: req.user!.id,
          reason: body.reason,
        }),
      );
      await audit({
        action: "employee organization transfer",
        performedByUserId: req.user!.id,
        oldValue: result.previous
          ? {
              departmentId: result.previous.departmentId,
              organizationLevel: result.previous.organizationLevel,
            }
          : undefined,
        newValue: {
          departmentId: result.current.departmentId,
          organizationLevel: result.current.organizationLevel,
          effectiveFrom: result.current.effectiveFrom.toISOString().slice(0, 10),
        },
        ipAddress: req.ip,
      });
      res.json({
        previous: result.previous
          ? {
              id: result.previous.id,
              organizationUnitId: result.previous.departmentId,
              effectiveTo: startOfUtcDay(body.effectiveDate).toISOString().slice(0, 10),
            }
          : null,
        current: {
          id: result.current.id,
          organizationUnitId: result.current.departmentId,
          organizationUnitName: result.current.department?.name,
          unitCode: result.current.department?.unitCode,
          organizationLevel: result.current.organizationLevel,
          effectiveFrom: result.current.effectiveFrom.toISOString().slice(0, 10),
        },
      });
    }),
  );

  app.get(
    "/organization/approvers/preview",
    requireAuth,
    readGate,
    asyncHandler(async (req, res) => {
      const employeeId = String(req.query.employeeId ?? "");
      if (!employeeId) throw new HttpError(400, "employeeId is required");
      const asOfRaw = typeof req.query.asOf === "string" ? req.query.asOf : undefined;
      const asOf = asOfRaw ? startOfUtcDay(new Date(asOfRaw)) : startOfUtcDay(new Date());
      const approvers = await resolveOrganizationApprovers(employeeId, asOf);
      res.json({ employeeId, asOf: asOf.toISOString().slice(0, 10), approvers });
    }),
  );
}
