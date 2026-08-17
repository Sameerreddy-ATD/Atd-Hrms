import { describe, expect, it } from "vitest";
import {
  departmentMemberCountInTree,
  formatDepartmentParentPath,
  formatDepartmentPath,
  formatDepartmentPathById,
} from "../src/lib/department-label";

const departments = [
  { id: "head", name: "Head", parentDepartmentId: undefined },
  { id: "a", name: "Sub-head A", parentDepartmentId: "head" },
  { id: "b", name: "Sub-head B", parentDepartmentId: "head" },
  { id: "sales-a", name: "Sales", parentDepartmentId: "a" },
  { id: "sales-b", name: "Sales", parentDepartmentId: "b" },
];

describe("formatDepartmentPath", () => {
  it("returns the bare name for top-level units", () => {
    expect(formatDepartmentPath(departments[0], departments)).toBe("Head");
  });

  it("includes parents so duplicate leaf names stay distinct", () => {
    expect(formatDepartmentPathById(departments, "sales-a")).toBe("Head / Sub-head A / Sales");
    expect(formatDepartmentPathById(departments, "sales-b")).toBe("Head / Sub-head B / Sales");
  });

  it("describes reports-under for a unit", () => {
    expect(formatDepartmentParentPath(departments[3], departments)).toBe("Head / Sub-head A");
    expect(formatDepartmentParentPath(departments[0], departments)).toBe("CEO");
  });
});

describe("departmentMemberCountInTree", () => {
  const withCounts = [
    { id: "head", parentDepartmentId: undefined, memberCount: 1 },
    { id: "a", parentDepartmentId: "head", memberCount: 2 },
    { id: "b", parentDepartmentId: "head", memberCount: 0 },
    { id: "sales-a", parentDepartmentId: "a", memberCount: 5 },
    { id: "sales-b", parentDepartmentId: "b", memberCount: 3 },
  ];

  it("sums active members across the subtree", () => {
    expect(departmentMemberCountInTree("a", withCounts)).toBe(7);
    expect(departmentMemberCountInTree("head", withCounts)).toBe(11);
    expect(departmentMemberCountInTree("sales-b", withCounts)).toBe(3);
  });
});
