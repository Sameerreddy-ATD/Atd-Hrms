import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  defaultProfileVerificationPolicy,
  isProfileVerificationRequiredForRole,
} from "../server/src/profile-verification-policy.js";

describe("profile verification policy", () => {
  it("defaults to disabled for everyone", () => {
    const policy = defaultProfileVerificationPolicy();
    expect(policy.enabled).toBe(false);
    expect(isProfileVerificationRequiredForRole(Role.EMPLOYEE, false, policy)).toBe(false);
  });

  it("only targets selected roles when enabled", () => {
    const policy = {
      enabled: true,
      targetRoles: [Role.EMPLOYEE, Role.SALES],
    };
    expect(isProfileVerificationRequiredForRole(Role.EMPLOYEE, false, policy)).toBe(true);
    expect(isProfileVerificationRequiredForRole(Role.MANAGER, false, policy)).toBe(false);
    expect(isProfileVerificationRequiredForRole(Role.EMPLOYEE, true, policy)).toBe(false);
  });

  it("always skips CEO, COS, driver, and developer admin", () => {
    const policy = {
      enabled: true,
      targetRoles: [Role.EMPLOYEE, Role.CEO, Role.CHIEF_OF_STAFF, Role.DRIVER, Role.DEVELOPER_ADMIN],
    };
    expect(isProfileVerificationRequiredForRole(Role.CEO, false, policy)).toBe(false);
    expect(isProfileVerificationRequiredForRole(Role.CHIEF_OF_STAFF, false, policy)).toBe(false);
    expect(isProfileVerificationRequiredForRole(Role.DRIVER, false, policy)).toBe(false);
    expect(isProfileVerificationRequiredForRole(Role.DEVELOPER_ADMIN, false, policy)).toBe(false);
  });
});
