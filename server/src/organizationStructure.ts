import { HttpError } from "./errors.js";

/** TEAM | SUBTEAM | FUNCTION — validated at API layer when not stored as enum. */
export const ORGANIZATION_UNIT_TYPES = ["TEAM", "SUBTEAM", "FUNCTION"] as const;
export type OrganizationUnitType = (typeof ORGANIZATION_UNIT_TYPES)[number];

export type OrganizationUnitRow = {
  departmentId: string;
  name: string;
  unitCode: string;
  parentDepartmentId: string | null;
  active?: boolean;
  unitType?: string;
  sortOrder?: number;
};

/**
 * Assignment active when asOf >= effectiveFrom AND (effectiveTo is null OR asOf < effectiveTo).
 * effectiveTo is exclusive — ending on 2026-09-01 means inactive from that date onward.
 */
export function isAssignmentActive(
  effectiveFrom: Date,
  effectiveTo: Date | null | undefined,
  asOf: Date = startOfUtcDay(new Date()),
): boolean {
  const day = startOfUtcDay(asOf);
  const from = startOfUtcDay(effectiveFrom);
  if (day.getTime() < from.getTime()) return false;
  if (!effectiveTo) return true;
  return day.getTime() < startOfUtcDay(effectiveTo).getTime();
}

export function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** Suggested stable code from a display name (admin may override on create). */
export function suggestUnitCode(name: string): string {
  const base = name
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return base.slice(0, 60) || "UNIT";
}

export function normalizeUnitCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "_").slice(0, 60);
}

export function assertValidUnitType(unitType: string) {
  if (!ORGANIZATION_UNIT_TYPES.includes(unitType as OrganizationUnitType)) {
    throw new HttpError(400, `unitType must be one of: ${ORGANIZATION_UNIT_TYPES.join(", ")}`);
  }
}

export function buildChildrenMap(units: OrganizationUnitRow[]) {
  const children = new Map<string, string[]>();
  for (const unit of units) {
    if (!unit.parentDepartmentId) continue;
    children.set(unit.parentDepartmentId, [
      ...(children.get(unit.parentDepartmentId) ?? []),
      unit.departmentId,
    ]);
  }
  return children;
}

/** All descendant unit ids including the root. */
export function descendantUnitIds(rootId: string, units: OrganizationUnitRow[]): Set<string> {
  const children = buildChildrenMap(units);
  const out = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const childId of children.get(current) ?? []) {
      if (!out.has(childId)) {
        out.add(childId);
        queue.push(childId);
      }
    }
  }
  return out;
}

export function ancestorChain(unitId: string, units: OrganizationUnitRow[]): OrganizationUnitRow[] {
  const byId = new Map(units.map((row) => [row.departmentId, row]));
  const chain: OrganizationUnitRow[] = [];
  const seen = new Set<string>();
  let cursor: OrganizationUnitRow | undefined = byId.get(unitId);
  while (cursor) {
    if (seen.has(cursor.departmentId)) break;
    seen.add(cursor.departmentId);
    chain.unshift(cursor);
    cursor = cursor.parentDepartmentId ? byId.get(cursor.parentDepartmentId) : undefined;
  }
  return chain;
}

export function assertNoHierarchyCycle(input: {
  unitId: string | null;
  parentDepartmentId: string | null;
  units: OrganizationUnitRow[];
}) {
  if (!input.parentDepartmentId) return;
  if (input.unitId && input.parentDepartmentId === input.unitId) {
    throw new HttpError(400, "An organization unit cannot be its own parent");
  }
  if (!input.unitId) return;
  const descendants = descendantUnitIds(input.unitId, input.units);
  if (descendants.has(input.parentDepartmentId)) {
    throw new HttpError(400, "This parent would create a hierarchy cycle");
  }
}

export function assertActiveParent(
  parentDepartmentId: string | null | undefined,
  units: OrganizationUnitRow[],
) {
  if (!parentDepartmentId) return;
  const parent = units.find((row) => row.departmentId === parentDepartmentId);
  if (!parent) throw new HttpError(404, "Parent organization unit not found");
  if (parent.active === false) {
    throw new HttpError(400, "Cannot attach to an inactive parent organization unit");
  }
}

