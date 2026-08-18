import {
  COMPANY_LABELS,
  type Branch,
  type CompanyEntity,
  type Department,
  type Role,
  type User,
} from "../types/domain";
import { departmentIdsInSubtree, formatDepartmentPath } from "./department-label";

export const EMPLOYMENT_TYPE_ORDER = ["FULL_TIME", "PART_TIME", "INTERN"] as const;
export type EmploymentTypeFilter = (typeof EMPLOYMENT_TYPE_ORDER)[number];

export type DirectoryFilters = {
  company: string;
  branch: string;
  unit: string;
  designation: string;
  employmentType: string;
};

export function personUnitId(person: Pick<User, "departmentId" | "department">): string | undefined {
  return person.departmentId || person.department || undefined;
}

export function uniqueSortedStrings(values: Array<string | undefined | null>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) set.add(trimmed);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function buildUnitSubtree(
  departments: Array<Pick<Department, "id" | "parentDepartmentId">>,
  unit: string,
): Set<string> | null {
  if (unit === "all" || unit === "none") return null;
  return departmentIdsInSubtree(departments, unit);
}

export function matchesUnitFilter(
  person: User,
  unit: string,
  subtreeIds: Set<string> | null,
): boolean {
  const unitId = personUnitId(person);
  if (unit === "all") return true;
  if (unit === "none") return !unitId;
  if (!unitId) return false;
  if (subtreeIds) return subtreeIds.has(unitId);
  return unitId === unit;
}

export function matchesDirectoryPerson(
  person: User,
  filters: DirectoryFilters,
  subtreeIds: Set<string> | null,
  skip?: keyof DirectoryFilters,
): boolean {
  if (skip !== "company" && filters.company !== "all" && person.companyEntity !== filters.company) {
    return false;
  }
  if (skip !== "branch") {
    if (filters.branch === "none") {
      if (person.homeBranchId) return false;
    } else if (filters.branch !== "all" && person.homeBranchId !== filters.branch) {
      return false;
    }
  }
  if (skip !== "unit" && !matchesUnitFilter(person, filters.unit, subtreeIds)) {
    return false;
  }
  if (skip !== "designation") {
    const designation = person.designation?.trim() || "";
    if (filters.designation === "none") {
      if (designation) return false;
    } else if (filters.designation !== "all" && designation !== filters.designation) {
      return false;
    }
  }
  if (skip !== "employmentType" && filters.employmentType !== "all") {
    if ((person.employmentType || "FULL_TIME") !== filters.employmentType) return false;
  }
  return true;
}

export function occupiedCompanyOptions(people: User[]): CompanyEntity[] {
  const present = new Set<CompanyEntity>();
  for (const person of people) {
    if (person.companyEntity) present.add(person.companyEntity);
  }
  return (Object.keys(COMPANY_LABELS) as CompanyEntity[]).filter((key) => present.has(key));
}

export function occupiedBranchOptions(people: User[], branches: Branch[]): Branch[] {
  const ids = new Set(people.map((row) => row.homeBranchId).filter(Boolean) as string[]);
  return branches.filter((branch) => ids.has(branch.id));
}

export function occupiedUnitOptions(people: User[], departments: Department[]): Department[] {
  const occupied = uniqueSortedStrings(people.map(personUnitId));
  const byId = new Map(departments.map((row) => [row.id, row]));
  const include = new Set<string>();
  for (const id of occupied) {
    let cursor = byId.get(id);
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      include.add(cursor.id);
      cursor = cursor.parentDepartmentId ? byId.get(cursor.parentDepartmentId) : undefined;
    }
  }
  return departments
    .filter((row) => include.has(row.id))
    .sort((a, b) =>
      formatDepartmentPath(a, departments).localeCompare(
        formatDepartmentPath(b, departments),
        undefined,
        { sensitivity: "base" },
      ),
    );
}

export function occupiedDesignations(people: User[]): string[] {
  return uniqueSortedStrings(people.map((row) => row.designation));
}

export function occupiedEmploymentTypes(people: User[]): EmploymentTypeFilter[] {
  const present = new Set(people.map((row) => row.employmentType || "FULL_TIME"));
  return EMPLOYMENT_TYPE_ORDER.filter((type) => present.has(type));
}

export function occupiedRoles(people: User[], roleOrder: Role[]): Role[] {
  const present = new Set(people.map((row) => row.role));
  return roleOrder.filter((role) => present.has(role));
}

export function hasUnassignedLocation(people: User[]): boolean {
  return people.some((person) => !person.homeBranchId);
}

export function hasUnassignedUnit(people: User[]): boolean {
  return people.some((person) => !personUnitId(person));
}

export function hasUnassignedDesignation(people: User[]): boolean {
  return people.some((person) => !person.designation?.trim());
}
