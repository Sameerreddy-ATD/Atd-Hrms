import { describe, expect, it } from "vitest";
import { menuForRole } from "../src/lib/menu";

function pathsFor(role: "ceo" | "chief_of_staff") {
  return menuForRole(role, { hasEmployeeId: true, attendanceRequired: true }).flatMap((g) =>
    g.items.map((i) => ({ to: i.to, label: i.label })),
  );
}

describe("CEO and Chief of Staff menus", () => {
  it("gives CEO company-wide workforce, leave overview, and daily logs", () => {
    const items = pathsFor("ceo");
    const paths = items.map((i) => i.to);
    expect(paths).toContain("/employees");
    expect(paths).toContain("/leave/reports");
    expect(paths).toContain("/leave/approvals");
    expect(paths).toContain("/attendance/locations");
    expect(paths).not.toContain("/attendance/mine");
    expect(items.find((i) => i.to === "/employees")?.label).toBe("Workforce");
    expect(items.find((i) => i.to === "/leave/reports")?.label).toBe("Leave Overview");
  });

  it("gives Chief of Staff the same operating screens as CEO, without personal punch items", () => {
    const items = pathsFor("chief_of_staff");
    const paths = items.map((i) => i.to);
    expect(paths).toContain("/employees");
    expect(paths).toContain("/leave/reports");
    expect(paths).toContain("/leave/approvals");
    expect(paths).toContain("/attendance/locations");
    expect(paths).toContain("/attendance/mine");
    expect(items.find((i) => i.to === "/employees")?.label).toBe("Workforce");
    expect(items.find((i) => i.to === "/leave/reports")?.label).toBe("Leave Overview");
  });
});
