import { prisma } from "./prisma.js";
import {
  ancestorChain,
  isAssignmentActive,
  startOfUtcDay,
  type OrganizationUnitRow,
} from "./organizationStructure.js";
import {
  getActiveHeadAssignmentsForUnit,
  getActivePrimaryOrgAssignment,
  loadOrganizationUnits,
} from "./organizationAssignments.js";

export type OrganizationApprover = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  designation: string | null;
  departmentId: string;
  departmentName: string;
  unitCode: string;
  isPrimary: boolean;
  ancestorDepth: number;
};

/**
 * Walk from the employee's primary unit upward until active Head(s) are found.
 * Does not route to HR unless the caller adds that separately.
 */
export async function resolveOrganizationApprovers(
  employeeId: string,
  asOf: Date = startOfUtcDay(new Date()),
): Promise<OrganizationApprover[]> {
  const primary = await getActivePrimaryOrgAssignment(prisma, employeeId, asOf);
  if (!primary) return [];

  const units = await loadOrganizationUnits(prisma);
  const chain = ancestorChain(primary.departmentId, units);
  if (chain.length === 0) return [];

  for (let depth = chain.length - 1; depth >= 0; depth -= 1) {
    const unit = chain[depth]!;
    const heads = await getActiveHeadAssignmentsForUnit(prisma, unit.departmentId, asOf);
    const eligible = heads.filter((row) => row.employeeId !== employeeId);
    if (eligible.length > 0) {
      return eligible.map((row) => ({
        employeeId: row.employeeId,
        employeeName: row.employee?.name ?? "",
        employeeCode: row.employee?.employeeCode ?? "",
        designation: row.employee?.designation ?? null,
        departmentId: unit.departmentId,
        departmentName: unit.name,
        unitCode: unit.unitCode,
        isPrimary: row.isPrimary,
        ancestorDepth: chain.length - 1 - depth,
      }));
    }
  }
  return [];
}

/** Pure helper for tests — same algorithm without DB. */
export function resolveOrganizationApproversFromGraph(input: {
  employeeId: string;
  primaryUnitId: string | null;
  units: OrganizationUnitRow[];
  headAssignments: Array<{
    departmentId: string;
    employeeId: string;
    isPrimary: boolean;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    employeeName?: string;
    employeeCode?: string;
    designation?: string | null;
  }>;
  asOf?: Date;
}): OrganizationApprover[] {
  if (!input.primaryUnitId) return [];
  const asOf = input.asOf ?? startOfUtcDay(new Date());
  const chain = ancestorChain(input.primaryUnitId, input.units);
  for (let depth = chain.length - 1; depth >= 0; depth -= 1) {
    const unit = chain[depth]!;
    const heads = input.headAssignments.filter(
      (row) =>
        row.departmentId === unit.departmentId &&
        row.employeeId !== input.employeeId &&
        isAssignmentActive(row.effectiveFrom, row.effectiveTo, asOf),
    );
    if (heads.length > 0) {
      return heads.map((row) => ({
        employeeId: row.employeeId,
        employeeName: row.employeeName ?? "",
        employeeCode: row.employeeCode ?? "",
        designation: row.designation ?? null,
        departmentId: unit.departmentId,
        departmentName: unit.name,
        unitCode: unit.unitCode,
        isPrimary: row.isPrimary,
        ancestorDepth: chain.length - 1 - depth,
      }));
    }
  }
  return [];
}

export async function resolveEmployeeOrganizationAtDate(
  employeeId: string,
  asOf: Date = startOfUtcDay(new Date()),
) {
  const rows = await prisma.employeeOrganizationAssignment.findMany({
    where: { employeeId, isPrimary: true },
    include: { department: { select: { departmentId: true, name: true, unitCode: true } } },
    orderBy: { effectiveFrom: "desc" },
  });
  return rows.find((row) => isAssignmentActive(row.effectiveFrom, row.effectiveTo, asOf)) ?? null;
}
