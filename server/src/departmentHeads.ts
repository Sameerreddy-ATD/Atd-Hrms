import { Prisma, type PrismaClient } from "@prisma/client";
import {
  addHeadAssignment,
  endHeadAssignment,
  getActiveHeadAssignmentsForUnit,
  syncPrimaryHeadCache,
} from "./organizationAssignments.js";
import { startOfUtcDay } from "./organizationStructure.js";

type Tx = Prisma.TransactionClient | PrismaClient;

async function isStillOrganizationHead(tx: Tx, employeeId: string) {
  const today = startOfUtcDay(new Date());
  const [assignmentCount, legacyCount] = await Promise.all([
    tx.departmentHeadAssignment.count({
      where: {
        employeeId,
        effectiveTo: null,
        effectiveFrom: { lte: today },
      },
    }),
    tx.department.count({ where: { headEmployeeId: employeeId } }),
  ]);
  return assignmentCount > 0 || legacyCount > 0;
}

/** Mark an employee as an org head; login role is NOT changed here. */
export async function syncAssignedOrganizationHead(tx: Tx, headEmployeeId: string | null | undefined) {
  if (!headEmployeeId) return;
  const head = await tx.employee.findUnique({
    where: { employeeId: headEmployeeId },
    include: { user: true },
  });
  if (!head?.user) return;
  if (head.organizationLevel !== "HEAD") {
    await tx.employee.update({
      where: { employeeId: headEmployeeId },
      data: { organizationLevel: "HEAD" },
    });
  }
}

export async function syncClearedOrganizationHead(tx: Tx, employeeId: string) {
  if (await isStillOrganizationHead(tx, employeeId)) return;
  const employee = await tx.employee.findUnique({
    where: { employeeId },
    select: { organizationLevel: true },
  });
  if (employee?.organizationLevel === "HEAD") {
    await tx.employee.update({
      where: { employeeId },
      data: { organizationLevel: "MEMBER" },
    });
  }
}

async function currentHeadIdsForDepartment(tx: Tx, departmentId: string) {
  const active = await getActiveHeadAssignmentsForUnit(tx, departmentId);
  if (active.length > 0) return active.map((row) => row.employeeId);
  const department = await tx.department.findUnique({
    where: { departmentId },
    select: { headEmployeeId: true },
  });
  return department?.headEmployeeId ? [department.headEmployeeId] : [];
}

/**
 * Replace active heads for a unit (compat API used by department create/update).
 * Historical rows are ended; new active assignments are created.
 */
export async function replaceDepartmentHeads(
  tx: Tx,
  departmentId: string,
  headEmployeeIds: string[],
  input?: { assignedByUserId?: string; reason?: string },
) {
  const previousIds = await currentHeadIdsForDepartment(tx, departmentId);
  const nextIds = [...new Set(headEmployeeIds.filter(Boolean))];
  const today = startOfUtcDay(new Date());

  const active = await getActiveHeadAssignmentsForUnit(tx, departmentId, today);
  for (const row of active) {
    if (!nextIds.includes(row.employeeId)) {
      await endHeadAssignment(tx, row.id, today, {
        assignedByUserId: input?.assignedByUserId,
        reason: input?.reason ?? "Head assignment replaced",
      });
    }
  }

  for (let index = 0; index < nextIds.length; index += 1) {
    const employeeId = nextIds[index]!;
    const stillActive = active.find((row) => row.employeeId === employeeId);
    if (stillActive) {
      if (index === 0 && !stillActive.isPrimary) {
        await tx.departmentHeadAssignment.update({
          where: { id: stillActive.id },
          data: { isPrimary: true, sortOrder: 0 },
        });
      }
      await syncAssignedOrganizationHead(tx, employeeId);
      continue;
    }
    await addHeadAssignment(tx, {
      departmentId,
      employeeId,
      isPrimary: index === 0,
      effectiveFrom: today,
      assignedByUserId: input?.assignedByUserId,
      reason: input?.reason ?? "Head assignment updated",
    });
  }

  await syncPrimaryHeadCache(tx, departmentId, today);

  for (const removedId of previousIds) {
    if (!nextIds.includes(removedId)) {
      await syncClearedOrganizationHead(tx, removedId);
    }
  }
}

export async function ensureEmployeeHeadsDepartment(
  tx: Tx,
  employeeId: string,
  departmentId: string,
  input?: { assignedByUserId?: string },
) {
  const current = await currentHeadIdsForDepartment(tx, departmentId);
  if (current.includes(employeeId)) {
    await syncAssignedOrganizationHead(tx, employeeId);
    return;
  }
  await replaceDepartmentHeads(tx, departmentId, [...current, employeeId], input);
}

export async function removeEmployeeFromAllHeadships(tx: Tx, employeeId: string) {
  const today = startOfUtcDay(new Date());
  const active = await tx.departmentHeadAssignment.findMany({
    where: { employeeId, effectiveTo: null },
    select: { id: true, departmentId: true },
  });
  for (const row of active) {
    await endHeadAssignment(tx, row.id, today, { reason: "Removed from all head assignments" });
  }
  const legacy = await tx.department.findMany({
    where: { headEmployeeId: employeeId },
    select: { departmentId: true },
  });
  for (const row of legacy) {
    const heads = await currentHeadIdsForDepartment(tx, row.departmentId);
    await replaceDepartmentHeads(
      tx,
      row.departmentId,
      heads.filter((id) => id !== employeeId),
    );
  }
  await syncClearedOrganizationHead(tx, employeeId);
}

export async function syncEmployeeHeadshipFromProfile(
  tx: Tx,
  input: {
    employeeId: string;
    organizationLevel: string;
    departmentId: string | null | undefined;
    previousOrganizationLevel?: string | null;
    previousDepartmentId?: string | null;
  },
) {
  const level = input.organizationLevel;
  const wasHead = (input.previousOrganizationLevel ?? level) === "HEAD";
  const isHead = level === "HEAD";

  if (!isHead) {
    if (wasHead || (await isStillOrganizationHead(tx, input.employeeId))) {
      await removeEmployeeFromAllHeadships(tx, input.employeeId);
    }
    return;
  }

  if (input.departmentId) {
    await ensureEmployeeHeadsDepartment(tx, input.employeeId, input.departmentId);
  } else {
    await syncAssignedOrganizationHead(tx, input.employeeId);
  }

  const previousDepartmentId = input.previousDepartmentId ?? null;
  if (
    previousDepartmentId &&
    previousDepartmentId !== (input.departmentId ?? null) &&
    wasHead
  ) {
    const heads = await currentHeadIdsForDepartment(tx, previousDepartmentId);
    if (heads.includes(input.employeeId)) {
      await replaceDepartmentHeads(
        tx,
        previousDepartmentId,
        heads.filter((id) => id !== input.employeeId),
      );
    }
  }
}

export async function headedDepartmentsForEmployee(tx: Tx, employeeId: string) {
  const today = startOfUtcDay(new Date());
  const [assignments, legacy] = await Promise.all([
    tx.departmentHeadAssignment.findMany({
      where: { employeeId, effectiveTo: null },
      include: { department: { select: { departmentId: true, name: true, unitCode: true } } },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    }),
    tx.department.findMany({
      where: { headEmployeeId: employeeId },
      select: { departmentId: true, name: true, unitCode: true },
    }),
  ]);
  const activeAssignments = assignments.filter((row) =>
    row.effectiveFrom.getTime() <= today.getTime(),
  );
  const byId = new Map<string, { id: string; name: string; unitCode?: string }>();
  for (const row of activeAssignments) {
    byId.set(row.department.departmentId, {
      id: row.department.departmentId,
      name: row.department.name,
      unitCode: row.department.unitCode,
    });
  }
  for (const row of legacy) {
    if (!byId.has(row.departmentId)) {
      byId.set(row.departmentId, {
        id: row.departmentId,
        name: row.name,
        unitCode: row.unitCode,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function currentViewerIdsForDepartment(tx: Tx, departmentId: string) {
  const active = await tx.departmentViewerAssignment.findMany({
    where: { departmentId, effectiveTo: null },
    orderBy: { sortOrder: "asc" },
    select: { employeeId: true, effectiveFrom: true },
  });
  const today = startOfUtcDay(new Date());
  return active
    .filter((row) => row.effectiveFrom.getTime() <= today.getTime())
    .map((row) => row.employeeId);
}

export async function replaceDepartmentViewers(
  tx: Tx,
  departmentId: string,
  viewerEmployeeIds: string[],
  input?: { assignedByUserId?: string; reason?: string },
) {
  const headIds = await currentHeadIdsForDepartment(tx, departmentId);
  const nextIds = [...new Set(viewerEmployeeIds.filter(Boolean))].filter(
    (employeeId) => !headIds.includes(employeeId),
  );
  const today = startOfUtcDay(new Date());

  const active = await tx.departmentViewerAssignment.findMany({
    where: { departmentId, effectiveTo: null },
  });
  for (const row of active) {
    if (!nextIds.includes(row.employeeId)) {
      await tx.departmentViewerAssignment.update({
        where: { id: row.id },
        data: { effectiveTo: today, reason: input?.reason ?? "Viewer assignment replaced" },
      });
    }
  }

  for (const employeeId of nextIds) {
    const exists = active.some((row) => row.employeeId === employeeId);
    if (exists) continue;
    await tx.departmentViewerAssignment.create({
      data: {
        departmentId,
        employeeId,
        effectiveFrom: today,
        assignedByUserId: input?.assignedByUserId,
        reason: input?.reason ?? "Viewer assignment updated",
      },
    });
  }
}
