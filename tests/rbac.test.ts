import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  canCreateRole,
  formatOrgUnitPath,
  resolveTargetLoginRole,
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

describe("resolveTargetLoginRole", () => {
  it("maps no organization unit to CEO", () => {
    expect(resolveTargetLoginRole({})).toBe(Role.CEO);
    expect(resolveTargetLoginRole({ unitName: null, unitPath: null })).toBe(Role.CEO);
  });

  it("ignores a client-sent explicit role — unit wins", () => {
    expect(
      resolveTargetLoginRole({
        explicitRole: Role.MANAGER,
        unitName: "Fleet & Driver Team",
        unitPath: "Operations / Fleet & Driver Team",
      }),
    ).toBe(Role.DRIVER);
    expect(
      resolveTargetLoginRole({
        explicitRole: Role.CEO,
        unitName: "Operations",
        unitPath: "Operations",
      }),
    ).toBe(Role.EMPLOYEE);
  });

  it("does not promote HEAD organization level to manager", () => {
    expect(
      resolveTargetLoginRole({
        unitName: "Software",
        unitPath: "Software",
        organizationLevel: "HEAD",
      }),
    ).toBe(Role.EMPLOYEE);
  });

  it("maps Fleet, HR, and Sales units from name or path", () => {
    expect(
      resolveTargetLoginRole({
        unitName: "Fleet & Driver Team",
        unitPath: "Ops / Fleet & Driver Team",
      }),
    ).toBe(Role.DRIVER);
    expect(
      resolveTargetLoginRole({
        unitName: "Hr Department",
        unitPath: "Chief of Staff / Hr Department",
      }),
    ).toBe(Role.HR);
    expect(
      resolveTargetLoginRole({
        unitName: "Inside Sales",
        unitPath: "Sales Team / Inside Sales",
      }),
    ).toBe(Role.SALES);
    expect(
      resolveTargetLoginRole({
        unitName: "Drivers",
      }),
    ).toBe(Role.DRIVER);
  });

  it("keeps legacy Executive Leadership as CEO", () => {
    expect(
      resolveTargetLoginRole({
        unitName: "Executive Leadership",
        organizationLevel: "HEAD",
      }),
    ).toBe(Role.CEO);
  });
});

describe("formatOrgUnitPath", () => {
  const units = [
    { id: "ops", name: "Operations", parentDepartmentId: null },
    { id: "fleet", name: "Fleet & Driver Team", parentDepartmentId: "ops" },
  ];

  it("joins ancestors", () => {
    expect(formatOrgUnitPath(units[1], units)).toBe("Operations / Fleet & Driver Team");
    expect(formatOrgUnitPath(units[0], units)).toBe("Operations");
  });
});
