import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { canCreateRole } from "../server/src/rbac.js";

describe("login creation rules", () => {
  it("allows Developer Admin to create all logins", () => {
    expect(canCreateRole(Role.DEVELOPER_ADMIN, Role.DEVELOPER_ADMIN)).toBe(true);
    expect(canCreateRole(Role.DEVELOPER_ADMIN, Role.HR)).toBe(true);
    expect(canCreateRole(Role.DEVELOPER_ADMIN, Role.FIELD_STAFF)).toBe(true);
  });

  it("prevents HR from creating Developer Admin, CEO, or Main Admin", () => {
    expect(canCreateRole(Role.HR, Role.DEVELOPER_ADMIN)).toBe(false);
    expect(canCreateRole(Role.HR, Role.CEO)).toBe(false);
    expect(canCreateRole(Role.HR, Role.MAIN_ADMIN)).toBe(false);
  });

  it("prevents employees and managers from creating logins", () => {
    expect(canCreateRole(Role.EMPLOYEE, Role.EMPLOYEE)).toBe(false);
    expect(canCreateRole(Role.MANAGER, Role.EMPLOYEE)).toBe(false);
  });
});
