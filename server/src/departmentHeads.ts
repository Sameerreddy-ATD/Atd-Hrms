import { Prisma, type PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

async function isStillOrganizationHead(tx: Tx, employeeId: string) {
  const [assignmentCount, legacyCount] = await Promise.all([
    tx.departmentHeadAssignment.count({ where: { employeeId } }),
    tx.department.count({ where: { headEmployeeId: employeeId } }),
  ]);
  return assignmentCount > 0 || legacyCount > 0;
}

/** Mark an employee as an org head; the same person may head multiple departments.
 * Login role stays tied to organization unit (Sales/HR/etc.) — headship is chart-only.
 */
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

/**
 * If this person no longer heads any unit, clear organizationLevel HEAD
 * so profile stays aligned with the Departments chart.
 */
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
  const [assignments, department] = await Promise.all([
    tx.departmentHeadAssignment.findMany({
      where: { departmentId },
      orderBy: { sortOrder: "asc" },
      select: { employeeId: true },
    }),
    tx.department.findUnique({
      where: { departmentId },
      select: { headEmployeeId: true },
    }),
  ]);
  if (assignments.length > 0) return assignments.map((row) => row.employeeId);
  return department?.headEmployeeId ? [department.headEmployeeId] : [];
}

export async function replaceDepartmentHeads(
  tx: Tx,
  departmentId: string,
  headEmployeeIds: string[],
) {
  const previousIds = await currentHeadIdsForDepartment(tx, departmentId);
  const nextIds = [...new Set(headEmployeeIds.filter(Boolean))];

  await tx.departmentHeadAssignment.deleteMany({ where: { departmentId } });
  if (nextIds.length > 0) {
    await tx.departmentHeadAssignment.createMany({
      data: nextIds.map((employeeId, index) => ({
        departmentId,
        employeeId,
        sortOrder: index,
      })),
    });
  }
  await tx.department.update({
    where: { departmentId },
    data: { headEmployeeId: nextIds[0] ?? null },
  });

  for (const headEmployeeId of nextIds) {
    await syncAssignedOrganizationHead(tx, headEmployeeId);
  }
  for (const removedId of previousIds) {
    if (!nextIds.includes(removedId)) {
      await syncClearedOrganizationHead(tx, removedId);
    }
  }
}

/** Ensure this employee is listed as a head of the given unit. */
export async function ensureEmployeeHeadsDepartment(
  tx: Tx,
  employeeId: string,
  departmentId: string,
) {
  const current = await currentHeadIdsForDepartment(tx, departmentId);
  if (current.includes(employeeId)) {
    await syncAssignedOrganizationHead(tx, employeeId);
    return;
  }
  await replaceDepartmentHeads(tx, departmentId, [...current, employeeId]);
}

/** Remove this employee from every unit they currently head. */
export async function removeEmployeeFromAllHeadships(tx: Tx, employeeId: string) {
  const [assignments, legacy] = await Promise.all([
    tx.departmentHeadAssignment.findMany({
      where: { employeeId },
      select: { departmentId: true },
    }),
    tx.department.findMany({
      where: { headEmployeeId: employeeId },
      select: { departmentId: true },
    }),
  ]);
  const departmentIds = [
    ...new Set([
      ...assignments.map((row) => row.departmentId),
      ...legacy.map((row) => row.departmentId),
    ]),
  ];
  for (const departmentId of departmentIds) {
    const heads = await currentHeadIdsForDepartment(tx, departmentId);
    await replaceDepartmentHeads(
      tx,
      departmentId,
      heads.filter((id) => id !== employeeId),
    );
  }
  await syncClearedOrganizationHead(tx, employeeId);
}

/**
 * Keep Departments chart and employee profile organizationLevel in sync.
 * - HEAD + department → ensure they head that department (and set level HEAD)
 * - leaving HEAD → remove from all head assignments
 * - department change while HEAD → head the new unit; drop headship on the old home unit only
 */
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
  const [assignments, legacy] = await Promise.all([
    tx.departmentHeadAssignment.findMany({
      where: { employeeId },
      include: { department: { select: { departmentId: true, name: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    tx.department.findMany({
      where: { headEmployeeId: employeeId },
      select: { departmentId: true, name: true },
    }),
  ]);
  const byId = new Map<string, { id: string; name: string }>();
  for (const row of assignments) {
    byId.set(row.department.departmentId, {
      id: row.department.departmentId,
      name: row.department.name,
    });
  }
  for (const row of legacy) {
    if (!byId.has(row.departmentId)) {
      byId.set(row.departmentId, { id: row.departmentId, name: row.name });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
