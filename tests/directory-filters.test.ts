import { describe, expect, it } from "vitest";
import {
  matchesDirectoryPerson,
  occupiedUnitOptions,
  type DirectoryFilters,
} from "../src/lib/directory-filters";
import type { Department, User } from "../src/types/domain";

const departments: Department[] = [
  {
    id: "cos",
    name: "Chief of Staff",
    parentDepartmentId: undefined,
    memberCount: 1,
  },
  {
    id: "ops",
    name: "Operations",
    parentDepartmentId: "cos",
    memberCount: 0,
  },
  {
    id: "sales",
    name: "Sales",
    parentDepartmentId: "ops",
    memberCount: 1,
  },
];

const allFilters: DirectoryFilters = {
  company: "all",
  branch: "all",
  unit: "all",
  designation: "all",
  employmentType: "all",
};

function person(partial: Partial<User>): User {
  return {
    id: partial.id ?? "u1",
    name: partial.name ?? "Alex",
    email: partial.email ?? "alex@example.com",
    role: partial.role ?? "employee",
    active: true,
    ...partial,
  };
}

describe("directory filters", () => {
  it("treats a parent unit filter as including people in child teams", () => {
    const sales = person({ id: "s1", departmentId: "sales" });
    const subtree = new Set(["cos", "ops", "sales"]);
    expect(
      matchesDirectoryPerson(sales, { ...allFilters, unit: "cos" }, subtree),
    ).toBe(true);
  });

  it("lists occupied units plus their ancestors for the dropdown", () => {
    const people = [person({ id: "s1", departmentId: "sales" })];
    const options = occupiedUnitOptions(people, departments);
    expect(options.map((row) => row.id)).toEqual(["cos", "ops", "sales"]);
  });

  it("keeps designation and company filters independent of unit subtree", () => {
    const intern = person({
      id: "i1",
      departmentId: "sales",
      companyEntity: "ANYTIME_DIESEL",
      designation: "Intern",
      employmentType: "INTERN",
    });
    expect(
      matchesDirectoryPerson(
        intern,
        {
          ...allFilters,
          company: "ROYAL_PETRO_PARK_PRIVATE_LIMITED",
        },
        null,
      ),
    ).toBe(false);
    expect(
      matchesDirectoryPerson(intern, { ...allFilters, designation: "Intern" }, null),
    ).toBe(true);
  });
});
