import type { Department } from "@/types/domain";

type DepartmentRef = Pick<Department, "id" | "name" | "parentDepartmentId">;

/** Org unit for Bowser Pilot (driver) logins — mobile-number portal. */
export const FLEET_DRIVER_TEAM_NAME = "Fleet & Driver Team";

export function findDepartmentByName(
  departments: DepartmentRef[],
  name: string,
): DepartmentRef | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return departments.find((row) => row.name.trim().toLowerCase() === needle);
}

/**
 * Full ancestry path for an org unit, e.g. "Operations / Sales".
 * Top-level units stay a single name. Same labels under different parents
 * are distinguishable by the path prefix.
 */
export function formatDepartmentPath(
  department: DepartmentRef | null | undefined,
  departments: DepartmentRef[],
  fallback = "-",
): string {
  if (!department) return fallback;
  const byId = new Map(departments.map((row) => [row.id, row]));
  const names: string[] = [];
  const seen = new Set<string>();
  let cursor: DepartmentRef | undefined = department;
  while (cursor) {
    if (seen.has(cursor.id)) break;
    seen.add(cursor.id);
    const label = cursor.name.trim();
    if (label) names.unshift(label);
    const parentId: string | undefined = cursor.parentDepartmentId;
    cursor = parentId ? byId.get(parentId) : undefined;
  }
  return names.length > 0 ? names.join(" / ") : fallback;
}

export function formatDepartmentPathById(
  departments: DepartmentRef[],
  id?: string | null,
  fallback = "-",
): string {
  if (!id) return fallback;
  return formatDepartmentPath(
    departments.find((row) => row.id === id),
    departments,
    fallback,
  );
}

/** Parent chain only (no leaf), for “reports under” hints. */
export function formatDepartmentParentPath(
  department: DepartmentRef | null | undefined,
  departments: DepartmentRef[],
  topLevelLabel = "CEO",
): string {
  if (!department?.parentDepartmentId) return topLevelLabel;
  return formatDepartmentPathById(departments, department.parentDepartmentId, topLevelLabel);
}

/**
 * Active members in this unit plus every descendant unit.
 * Direct `memberCount` values must already exclude left/terminated people.
 */
export function departmentMemberCountInTree(
  departmentId: string,
  departments: Array<{ id: string; parentDepartmentId?: string; memberCount?: number }>,
): number {
  const childrenByParent = new Map<string | undefined, string[]>();
  for (const row of departments) {
    const parentKey = row.parentDepartmentId;
    const list = childrenByParent.get(parentKey) ?? [];
    list.push(row.id);
    childrenByParent.set(parentKey, list);
  }
  const directById = new Map(
    departments.map((row) => [row.id, Math.max(0, row.memberCount ?? 0)]),
  );
  const walk = (id: string): number => {
    let total = directById.get(id) ?? 0;
    for (const childId of childrenByParent.get(id) ?? []) {
      total += walk(childId);
    }
    return total;
  };
  return walk(departmentId);
}
