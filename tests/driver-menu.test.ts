import { describe, expect, it } from "vitest";
import { menuForRole } from "../src/lib/menu";
describe("driver menu", () => {
  it("only attendance and profile routes", () => {
    const paths = menuForRole("driver", { hasEmployeeId: true, attendanceRequired: true })
      .flatMap((g) => g.items.map((i) => i.to))
      .sort();
    expect(paths).toEqual(["/attendance/mine", "/dashboard", "/preferences", "/profile"]);
  });
});

describe("employee menu", () => {
  it("includes the company holiday calendar", () => {
    const paths = menuForRole("employee", { hasEmployeeId: true, attendanceRequired: true }).flatMap(
      (g) => g.items.map((i) => i.to),
    );
    expect(paths).toContain("/holidays");
  });
});
