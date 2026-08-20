import { Prisma, type PrismaClient } from "@prisma/client";
import { HttpError } from "./errors.js";
import {
  descendantUnitIds,
  isAssignmentActive,
  startOfUtcDay,
  type OrganizationUnitRow,
} from "./organizationStructure.js";

type Tx = Prisma.TransactionClient | PrismaClient;

export type HeadAssignmentRow = {
  id: string;
  departmentId: string;
  employeeId: string;
  isPrimary: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  employee?: { employeeId: string; name: string; employeeCode: string; designation: string | null };
};

export type ViewerAssignmentRow = {
  id: string;
  departmentId: string;
  employeeId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  employee?: { employeeId: string; name: string; employeeCode: string; designation: string | null };
};

export type EmployeeOrgAssignmentRow = {
  id: string;
  employeeId: string;
  departmentId: string;
  organizationLevel: string;
  isPrimary: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  department?: { departmentId: string; name: string; unitCode: string };
};

function employeeIdentitySelect() {
  return {
    employeeId: true,
    name: true,
    employeeCode: true,
    designation: true,
  } as const;
}

export async function loadOrganizationUnits(tx: Tx): Promise<OrganizationUnitRow[]> {
  return tx.department.findMany({
    select: {
      departmentId: true,
      name: true,
      unitCode: true,
      parentDepartmentId: true,
      active: true,
      unitType: true,
      sortOrder: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getActiveHeadAssignmentsForUnit(
  tx: Tx,
  departmentId: string,
  asOf: Date = startOfUtcDay(new Date()),
) {
  const rows = await tx.departmentHeadAssignment.findMany({
    where: { departmentId },
    include: { employee: { select: employeeIdentitySelect() } },
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { effectiveFrom: "asc" }],
  });
  return rows.filter((row) => isAssignmentActive(row.effectiveFrom, row.effectiveTo, asOf));
}

export async function getActiveViewerAssignmentsForUnit(
  tx: Tx,
  departmentId: string,
  asOf: Date = startOfUtcDay(new Date()),
) {
  const rows = await tx.departmentViewerAssignment.findMany({
    where: { departmentId },
    include: { employee: { select: employeeIdentitySelect() } },
    orderBy: [{ sortOrder: "asc" }, { effectiveFrom: "asc" }],
  });
  return rows.filter((row) => isAssignmentActive(row.effectiveFrom, row.effectiveTo, asOf));
}

export async function getActivePrimaryOrgAssignment(
  tx: Tx,
  employeeId: string,
  asOf: Date = startOfUtcDay(new Date()),
) {
  const rows = await tx.employeeOrganizationAssignment.findMany({
    where: { employeeId, isPrimary: true },
    include: { department: { select: { departmentId: true, name: true, unitCode: true } } },
    orderBy: { effectiveFrom: "desc" },
  });
  return rows.find((row) => isAssignmentActive(row.effectiveFrom, row.effectiveTo, asOf)) ?? null;
}

export async function syncPrimaryHeadCache(tx: Tx, departmentId: string, asOf?: Date) {
  const asOfDate = asOf ?? startOfUtcDay(new Date());
  const active = await getActiveHeadAssignmentsForUnit(tx, departmentId, asOfDate);
  let primary = active.find((row) => row.isPrimary);
  if (!primary && active.length > 0) {
    const promoted = active[0]!;
    await tx.departmentHeadAssignment.update({
      where: { id: promoted.id },
      data: { isPrimary: true, sortOrder: 0 },
    });
    primary = { ...promoted, isPrimary: true };
  }
  const cacheEmployeeId = primary?.employeeId ?? null;
  await tx.department.update({
    where: { departmentId },
    data: { headEmployeeId: cacheEmployeeId },
  });
  return cacheEmployeeId;
}

async function assertNoOverlappingHead(
  tx: Tx,
  departmentId: string,
  employeeId: string,
  effectiveFrom: Date,
  excludeId?: string,
) {
  const rows = await tx.departmentHeadAssignment.findMany({
    where: {
      departmentId,
      employeeId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  const from = startOfUtcDay(effectiveFrom);
  const overlap = rows.some(
    (row) =>
      isAssignmentActive(row.effectiveFrom, row.effectiveTo, from) ||
      (!row.effectiveTo && row.effectiveFrom.getTime() <= from.getTime()),
  );
  if (overlap) {
    throw new HttpError(409, "This person already has an active head assignment for this unit");
  }
}

export async function addHeadAssignment(
  tx: Tx,
  input: {
    departmentId: string;
    employeeId: string;
    isPrimary?: boolean;
    effectiveFrom?: Date;
    assignedByUserId?: string;
    reason?: string;
  },
) {
  const effectiveFrom = startOfUtcDay(input.effectiveFrom ?? new Date());
  await assertNoOverlappingHead(tx, input.departmentId, input.employeeId, effectiveFrom);
  const employee = await tx.employee.findUniqueOrThrow({
    where: { employeeId: input.employeeId },
    select: { employeeId: true, status: true },
  });
  if (employee.status !== "ACTIVE") throw new HttpError(400, "Only active employees may head a unit");

  if (input.isPrimary) {
    await tx.departmentHeadAssignment.updateMany({
      where: {
        departmentId: input.departmentId,
        effectiveTo: null,
        isPrimary: true,
      },
      data: { isPrimary: false },
    });
  }

  const created = await tx.departmentHeadAssignment.create({
    data: {
      departmentId: input.departmentId,
      employeeId: input.employeeId,
      isPrimary: input.isPrimary ?? false,
      effectiveFrom,
      assignedByUserId: input.assignedByUserId,
      reason: input.reason,
      sortOrder: input.isPrimary ? 0 : 1,
    },
    include: { employee: { select: employeeIdentitySelect() } },
  });
  await syncPrimaryHeadCache(tx, input.departmentId, effectiveFrom);
  return created;
}

export async function endHeadAssignment(
  tx: Tx,
  assignmentId: string,
  effectiveTo: Date,
  input?: { assignedByUserId?: string; reason?: string },
) {
  const row = await tx.departmentHeadAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
  if (row.effectiveTo) throw new HttpError(400, "This head assignment is already ended");
  const end = startOfUtcDay(effectiveTo);
  if (end.getTime() <= startOfUtcDay(row.effectiveFrom).getTime()) {
    throw new HttpError(400, "End date must be after the assignment start date");
  }
  const updated = await tx.departmentHeadAssignment.update({
    where: { id: assignmentId },
    data: {
      effectiveTo: end,
      reason: input?.reason ?? row.reason,
      assignedByUserId: input?.assignedByUserId ?? row.assignedByUserId,
    },
    include: { employee: { select: employeeIdentitySelect() } },
  });
  await syncPrimaryHeadCache(tx, row.departmentId, end);
  return updated;
}

export async function addViewerAssignment(
  tx: Tx,
  input: {
    departmentId: string;
    employeeId: string;
    effectiveFrom?: Date;
    assignedByUserId?: string;
    reason?: string;
  },
) {
  const effectiveFrom = startOfUtcDay(input.effectiveFrom ?? new Date());
  const activeHeads = await getActiveHeadAssignmentsForUnit(tx, input.departmentId, effectiveFrom);
  if (activeHeads.some((row) => row.employeeId === input.employeeId)) {
    throw new HttpError(400, "Heads already have full access; viewer assignment is not needed");
  }
  const rows = await tx.departmentViewerAssignment.findMany({
    where: { departmentId: input.departmentId, employeeId: input.employeeId, effectiveTo: null },
  });
  if (rows.length > 0) throw new HttpError(409, "This person already has active viewer access");

  return tx.departmentViewerAssignment.create({
    data: {
      departmentId: input.departmentId,
      employeeId: input.employeeId,
      effectiveFrom,
      assignedByUserId: input.assignedByUserId,
      reason: input.reason,
    },
    include: { employee: { select: employeeIdentitySelect() } },
  });
}

export async function endViewerAssignment(
  tx: Tx,
  assignmentId: string,
  effectiveTo: Date,
  input?: { assignedByUserId?: string; reason?: string },
) {
  const row = await tx.departmentViewerAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
  if (row.effectiveTo) throw new HttpError(400, "This viewer assignment is already ended");
  const end = startOfUtcDay(effectiveTo);
  return tx.departmentViewerAssignment.update({
    where: { id: assignmentId },
    data: {
      effectiveTo: end,
      reason: input?.reason ?? row.reason,
      assignedByUserId: input?.assignedByUserId ?? row.assignedByUserId,
    },
    include: { employee: { select: employeeIdentitySelect() } },
  });
}

export async function syncEmployeeDepartmentSnapshot(
  tx: Tx,
  employeeId: string,
  asOf: Date = startOfUtcDay(new Date()),
) {
  const primary = await getActivePrimaryOrgAssignment(tx, employeeId, asOf);
  await tx.employee.update({
    where: { employeeId },
    data: {
      departmentId: primary?.departmentId ?? null,
      organizationLevel: primary?.organizationLevel ?? "MEMBER",
    },
  });
  return primary;
}

export async function transferEmployeeOrganization(
  tx: Tx,
  input: {
    employeeId: string;
    newOrganizationUnitId: string;
    newOrganizationLevel?: string;
    effectiveDate: Date;
    changedByUserId?: string;
    reason?: string;
  },
) {
  const effectiveFrom = startOfUtcDay(input.effectiveDate);
  const employee = await tx.employee.findUniqueOrThrow({
    where: { employeeId: input.employeeId },
    select: { employeeId: true, status: true, departmentId: true, organizationLevel: true },
  });
  const unit = await tx.department.findUniqueOrThrow({
    where: { departmentId: input.newOrganizationUnitId },
    select: { departmentId: true, active: true, name: true },
  });
  if (!unit.active) throw new HttpError(400, "Cannot transfer to an inactive organization unit");

  const today = startOfUtcDay(new Date());
  if (effectiveFrom.getTime() > today.getTime()) {
    throw new HttpError(
      400,
      "Future-effective organization transfers are not supported yet. Use today's date.",
    );
  }

  const activePrimary = await getActivePrimaryOrgAssignment(tx, input.employeeId, effectiveFrom);
  if (
    activePrimary &&
    activePrimary.departmentId === input.newOrganizationUnitId &&
    activePrimary.organizationLevel === (input.newOrganizationLevel ?? activePrimary.organizationLevel)
  ) {
    throw new HttpError(400, "Employee is already assigned to this organization unit");
  }

  if (activePrimary && isAssignmentActive(activePrimary.effectiveFrom, activePrimary.effectiveTo, effectiveFrom)) {
    await tx.employeeOrganizationAssignment.update({
      where: { id: activePrimary.id },
      data: { effectiveTo: effectiveFrom },
    });
  }

  const created = await tx.employeeOrganizationAssignment.create({
    data: {
      employeeId: input.employeeId,
      departmentId: input.newOrganizationUnitId,
      organizationLevel: input.newOrganizationLevel ?? employee.organizationLevel ?? "MEMBER",
      isPrimary: true,
      effectiveFrom,
      changedByUserId: input.changedByUserId,
      reason: input.reason,
    },
    include: { department: { select: { departmentId: true, name: true, unitCode: true } } },
  });

  if (effectiveFrom.getTime() <= today.getTime()) {
    await tx.employee.update({
      where: { employeeId: input.employeeId },
      data: {
        departmentId: input.newOrganizationUnitId,
        organizationLevel: created.organizationLevel,
      },
    });
  }

  return { previous: activePrimary, current: created };
}

/** Head + viewer owned unit ids for an employee at a date. */
export async function ownedUnitIdsForEmployee(
  tx: Tx,
  employeeId: string,
  mode: "head" | "view",
  asOf: Date = startOfUtcDay(new Date()),
) {
  const [headRows, viewerRows, legacyHeadUnits] = await Promise.all([
    tx.departmentHeadAssignment.findMany({ where: { employeeId }, select: { departmentId: true, effectiveFrom: true, effectiveTo: true } }),
    mode === "view"
      ? tx.departmentViewerAssignment.findMany({
          where: { employeeId },
          select: { departmentId: true, effectiveFrom: true, effectiveTo: true },
        })
      : Promise.resolve([]),
    tx.department.findMany({
      where: { headEmployeeId: employeeId },
      select: { departmentId: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const row of headRows) {
    if (isAssignmentActive(row.effectiveFrom, row.effectiveTo, asOf)) ids.add(row.departmentId);
  }
  if (mode === "view") {
    for (const row of viewerRows) {
      if (isAssignmentActive(row.effectiveFrom, row.effectiveTo, asOf)) ids.add(row.departmentId);
    }
  }
  for (const row of legacyHeadUnits) ids.add(row.departmentId);
  return [...ids];
}

export async function visibleEmployeeIdsForOrgScope(
  tx: Tx,
  employeeId: string,
  mode: "head" | "view",
  asOf: Date = startOfUtcDay(new Date()),
) {
  const units = await loadOrganizationUnits(tx);
  const owned = await ownedUnitIdsForEmployee(tx, employeeId, mode, asOf);
  if (owned.length === 0) return [] as string[];

  const visibleUnits = new Set<string>();
  for (const unitId of owned) {
    for (const id of descendantUnitIds(unitId, units)) visibleUnits.add(id);
  }

  const team = await tx.employee.findMany({
    where: {
      departmentId: { in: [...visibleUnits] },
      status: "ACTIVE",
      employeeId: { not: employeeId },
    },
    select: { employeeId: true },
  });
  return team.map((row) => row.employeeId);
}

export function resolvePrimaryOrgAssignmentAtDate(
  rows: EmployeeOrgAssignmentRow[],
  asOf: Date,
) {
  return rows.find(
    (row) => row.isPrimary && isAssignmentActive(row.effectiveFrom, row.effectiveTo, asOf),
  );
}

export function resolveHeadAssignmentsAtDate(rows: HeadAssignmentRow[], asOf: Date) {
  return rows.filter((row) => isAssignmentActive(row.effectiveFrom, row.effectiveTo, asOf));
}

export function resolveViewerAssignmentsAtDate(rows: ViewerAssignmentRow[], asOf: Date) {
  return rows.filter((row) => isAssignmentActive(row.effectiveFrom, row.effectiveTo, asOf));
}
