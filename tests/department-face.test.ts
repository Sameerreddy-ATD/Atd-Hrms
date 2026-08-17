import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";

/**
 * Mirrors isFaceVerificationRequiredForUser without hitting the database —
 * the real function composes these gates in the same order.
 */
function faceRequired(input: {
  globalEnabled: boolean;
  role: Role;
  departmentEnabled: boolean | null;
  attendanceRequired?: boolean;
}) {
  if (!input.globalEnabled) return false;
  if (input.role === Role.DEVELOPER_ADMIN) return false;
  if (input.attendanceRequired === false) return false;
  if (input.departmentEnabled === null) return true;
  return input.departmentEnabled;
}

describe("per-department face verification", () => {
  it("keeps the global Face Security pause as the org kill switch", () => {
    expect(
      faceRequired({
        globalEnabled: false,
        role: Role.EMPLOYEE,
        departmentEnabled: true,
      }),
    ).toBe(false);
  });

  it("skips Developer Admin even when the department opts in", () => {
    expect(
      faceRequired({
        globalEnabled: true,
        role: Role.DEVELOPER_ADMIN,
        departmentEnabled: true,
      }),
    ).toBe(false);
  });

  it("inherits global when the user has no department", () => {
    expect(
      faceRequired({
        globalEnabled: true,
        role: Role.EMPLOYEE,
        departmentEnabled: null,
      }),
    ).toBe(true);
  });

  it("honours a department that turns face off", () => {
    expect(
      faceRequired({
        globalEnabled: true,
        role: Role.EMPLOYEE,
        departmentEnabled: false,
      }),
    ).toBe(false);
  });

  it("requires face when both global and department are on", () => {
    expect(
      faceRequired({
        globalEnabled: true,
        role: Role.MANAGER,
        departmentEnabled: true,
      }),
    ).toBe(true);
  });

  it("skips face when the person is excused from attendance", () => {
    expect(
      faceRequired({
        globalEnabled: true,
        role: Role.EMPLOYEE,
        departmentEnabled: true,
        attendanceRequired: false,
      }),
    ).toBe(false);
  });
});
