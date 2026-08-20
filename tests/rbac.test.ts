import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  canCreateRole,
  resolveLoginRoleForNewAccount,
} from "../server/src/rbac.js";

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

describe("resolveLoginRoleForNewAccount", () => {
  it("never defaults to CEO when role is omitted", () => {
    expect(resolveLoginRoleForNewAccount({})).toBe(Role.EMPLOYEE);
  });

  it("honours explicit role only", () => {
    expect(
      resolveLoginRoleForNewAccount({
        explicitRole: Role.CEO,
      }),
    ).toBe(Role.CEO);
    expect(
      resolveLoginRoleForNewAccount({
        explicitRole: Role.HR,
      }),
    ).toBe(Role.HR);
    expect(
      resolveLoginRoleForNewAccount({
        explicitRole: Role.DRIVER,
      }),
    ).toBe(Role.DRIVER);
  });

  it("does not infer privileged roles from organization context (removed from API)", () => {
    expect(resolveLoginRoleForNewAccount({ explicitRole: null })).toBe(Role.EMPLOYEE);
  });
});

describe("privileged role assignment authorization", () => {
  it("allows developer admin to assign privileged roles", () => {
    expect(canCreateRole(Role.DEVELOPER_ADMIN, Role.CEO)).toBe(true);
    expect(canCreateRole(Role.DEVELOPER_ADMIN, Role.CHIEF_OF_STAFF)).toBe(true);
    expect(canCreateRole(Role.DEVELOPER_ADMIN, Role.HR)).toBe(true);
    expect(canCreateRole(Role.DEVELOPER_ADMIN, Role.DRIVER)).toBe(true);
    expect(canCreateRole(Role.DEVELOPER_ADMIN, Role.SALES)).toBe(true);
  });

  it("blocks non-admin actors from assigning privileged roles", () => {
    expect(canCreateRole(Role.HR, Role.CEO)).toBe(false);
    expect(canCreateRole(Role.MANAGER, Role.HR)).toBe(false);
    expect(canCreateRole(Role.EMPLOYEE, Role.DRIVER)).toBe(false);
  });
});
