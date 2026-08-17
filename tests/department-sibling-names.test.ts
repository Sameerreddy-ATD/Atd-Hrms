import { describe, expect, it } from "vitest";

/**
 * Sibling-name uniqueness: same label under different parents is allowed;
 * two siblings under one parent must not share a name (case-insensitive).
 */
function hasSiblingNameClash(
  siblings: Array<{ name: string; departmentId: string }>,
  name: string,
  excludeDepartmentId?: string,
) {
  const trimmed = name.trim().toLowerCase();
  return siblings.some(
    (row) =>
      row.departmentId !== excludeDepartmentId &&
      row.name.trim().toLowerCase() === trimmed,
  );
}

describe("department sibling name uniqueness", () => {
  const underNorth = [
    { departmentId: "a", name: "Sales" },
    { departmentId: "b", name: "Ops" },
  ];

  it("blocks a second Sales under the same parent", () => {
    expect(hasSiblingNameClash(underNorth, "sales")).toBe(true);
  });

  it("allows Sales when renaming the existing Sales unit", () => {
    expect(hasSiblingNameClash(underNorth, "Sales", "a")).toBe(false);
  });

  it("allows Sales under a different parent that has no Sales yet", () => {
    expect(hasSiblingNameClash([{ departmentId: "c", name: "Ops" }], "Sales")).toBe(
      false,
    );
  });
});
