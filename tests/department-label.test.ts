import { describe, expect, it } from "vitest";
import {
  departmentMemberCountInTree,
  findDepartmentByName,
  FLEET_DRIVER_TEAM_NAME,
  formatDepartmentParentPath,
  formatDepartmentPath,
  formatDepartmentPathById,
  inferLoginRoleFromDepartment,
} from "../src/lib/department-label";

const departments = [
  { id: "head", name: "Head", parentDepartmentId: undefined },
  { id: "a", name: "Sub-head A", parentDepartmentId: "head" },
  { id: "b", name: "Sub-head B", parentDepartmentId: "head" },
  { id: "sales-a", name: "Sales", parentDepartmentId: "a" },
  { id: "sales-b", name: "Sales", parentDepartmentId: "b" },
  { id: "fleet", name: "Fleet & Driver Team", parentDepartmentId: "a" },
  { id: "ops", name: "Operations Department", parentDepartmentId: "a" },
  { id: "hr", name: "Hr Department", parentDepartmentId: "b" },
  { id: "inside", name: "Inside Sales", parentDepartmentId: "head" },
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

describe("findDepartmentByName", () => {
  it("finds Fleet & Driver Team for Bowser Pilot placement", () => {
    expect(findDepartmentByName(departments, FLEET_DRIVER_TEAM_NAME)?.id).toBe("fleet");
    expect(findDepartmentByName(departments, "fleet & driver team")?.id).toBe("fleet");
  });
});

describe("inferLoginRoleFromDepartment", () => {
  it("maps no unit to CEO", () => {
    expect(inferLoginRoleFromDepartment(null, departments)).toBe("ceo");
  });

  it("maps Chief of Staff unit to CoS", () => {
    const cos = { id: "cos", name: "Chief of Staff", parentDepartmentId: undefined as undefined };
    const salesUnderCos = {
      id: "sales-under-cos",
      name: "Sales Team",
      parentDepartmentId: "cos",
    };
    const tree = [cos, salesUnderCos];
    expect(inferLoginRoleFromDepartment(cos, tree)).toBe("chief_of_staff");
    expect(inferLoginRoleFromDepartment(salesUnderCos, tree)).toBe("sales");
  });

  it("maps Fleet & Driver Team to Bowser Pilot", () => {
    expect(inferLoginRoleFromDepartment(departments[5], departments)).toBe("driver");
  });

  it("maps HR and sales units", () => {
    expect(inferLoginRoleFromDepartment(departments[7], departments)).toBe("hr");
    expect(inferLoginRoleFromDepartment(departments[8], departments)).toBe("sales");
    expect(inferLoginRoleFromDepartment(departments[3], departments)).toBe("sales");
  });

  it("defaults other units to team member", () => {
    expect(inferLoginRoleFromDepartment(departments[6], departments)).toBe("employee");
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
