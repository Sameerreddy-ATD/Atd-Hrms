import { describe, expect, it } from "vitest";
import {
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
