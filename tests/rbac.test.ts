import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { canCreateRole, resolveTargetLoginRole } from "../server/src/rbac.js";

describe("login creation rules", () => {
  it("allows Developer Admin to create all logins including CEO", () => {
    expect(canCreateRole(Role.DEVELOPER_ADMIN, Role.DEVELOPER_ADMIN)).toBe(true);
    expect(canCreateRole(Role.DEVELOPER_ADMIN, Role.CEO)).toBe(true);
    expect(canCreateRole(Role.DEVELOPER_ADMIN, Role.HR)).toBe(true);
    expect(canCreateRole(Role.DEVELOPER_ADMIN, Role.MANAGER)).toBe(true);
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

describe("resolveTargetLoginRole", () => {
  it("uses an explicit CEO role without requiring Executive Leadership", () => {
    expect(
      resolveTargetLoginRole({
        explicitRole: Role.CEO,
        unitName: null,
        organizationLevel: "HEAD",
      }),
    ).toBe(Role.CEO);
  });

  it("uses explicit department head role even when unit is not a special name", () => {
    expect(
      resolveTargetLoginRole({
        explicitRole: Role.MANAGER,
        unitName: "Software",
        organizationLevel: "MEMBER",
      }),
    ).toBe(Role.MANAGER);
  });

  it("falls back to unit-name inference when no explicit role is provided", () => {
    expect(
      resolveTargetLoginRole({
        unitName: "Executive Leadership",
        organizationLevel: "HEAD",
      }),
    ).toBe(Role.CEO);
    expect(
      resolveTargetLoginRole({
        unitName: "Human Resources",
        organizationLevel: "SENIOR",
      }),
    ).toBe(Role.HR);
    expect(
      resolveTargetLoginRole({
        unitName: "Administration",
        organizationLevel: "HEAD",
      }),
    ).toBe(Role.MAIN_ADMIN);
    expect(
      resolveTargetLoginRole({
        unitName: "Software",
        organizationLevel: "HEAD",
      }),
    ).toBe(Role.MANAGER);
    expect(
      resolveTargetLoginRole({
        unitName: "Field Sales",
        organizationLevel: "MEMBER",
      }),
    ).toBe(Role.SALES);
  });
});
