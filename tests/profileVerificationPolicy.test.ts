import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Role } from "@prisma/client";
import {
  defaultProfileVerificationPolicy,
  isProfileVerificationRequiredForRole,
} from "../server/src/profile-verification-policy.ts";

describe("profile verification policy", () => {
  it("defaults to disabled for everyone", () => {
    const policy = defaultProfileVerificationPolicy();
    assert.equal(policy.enabled, false);
    assert.equal(
      isProfileVerificationRequiredForRole(Role.EMPLOYEE, false, policy),
      false,
    );
  });

  it("only targets selected roles when enabled", () => {
    const policy = {
      enabled: true,
      targetRoles: [Role.EMPLOYEE, Role.SALES],
    };
    assert.equal(isProfileVerificationRequiredForRole(Role.EMPLOYEE, false, policy), true);
    assert.equal(isProfileVerificationRequiredForRole(Role.MANAGER, false, policy), false);
    assert.equal(isProfileVerificationRequiredForRole(Role.EMPLOYEE, true, policy), false);
  });

  it("always skips CEO, COS, driver, and developer admin", () => {
    const policy = {
      enabled: true,
      targetRoles: [Role.EMPLOYEE, Role.CEO, Role.DRIVER],
    };
    assert.equal(isProfileVerificationRequiredForRole(Role.CEO, false, policy), false);
    assert.equal(isProfileVerificationRequiredForRole(Role.CHIEF_OF_STAFF, false, policy), false);
    assert.equal(isProfileVerificationRequiredForRole(Role.DRIVER, false, policy), false);
    assert.equal(isProfileVerificationRequiredForRole(Role.DEVELOPER_ADMIN, false, policy), false);
  });
});
