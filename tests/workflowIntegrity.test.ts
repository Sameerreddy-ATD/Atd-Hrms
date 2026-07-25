import { describe, expect, it } from "vitest";
import { resolveAssetStatus } from "../server/src/assetRules.js";
import { reportingHierarchyCycle } from "../server/src/organizationRules.js";
import {
  certificateRequestSchema,
  createUserSchema,
  leaveDecisionSchema,
  medicalDocumentSchema,
  updateEmployeeSchema,
} from "../server/src/schemas.js";
import { moduleForApiPath } from "../server/src/module-access.js";
import { issueCookies, verifyAccessToken, verifyRefreshToken } from "../server/src/security.js";

describe("account and employee workflow integrity", () => {
  it("rejects future birth dates and impossible employment chronology", () => {
    const base = {
      name: "Audit Employee",
      email: "audit.employee@example.com",
      password: "Welcome123",
      departmentId: "unit-1",
    };
    expect(createUserSchema.safeParse({ ...base, dateOfBirth: "2999-01-01" }).success).toBe(false);
    expect(
      createUserSchema.safeParse({
        ...base,
        dateOfBirth: "2000-01-01",
        joiningDate: "1999-01-01",
      }).success,
    ).toBe(false);
    expect(updateEmployeeSchema.safeParse({ dateOfBirth: "2999-01-01" }).success).toBe(false);
  });

  it("embeds the revocable session version in both browser tokens", () => {
    const cookies = new Map<string, string>();
    issueCookies(
      {
        cookie: (name: string, value: string) => {
          cookies.set(name, value);
        },
      } as never,
      {
        id: "user-1",
        employeeId: "employee-1",
        role: "EMPLOYEE",
        name: "Audit Employee",
        email: "audit.employee@example.com",
        firstLoginPasswordChangeRequired: false,
        sessionVersion: 7,
      },
    );
    const tokens = [...cookies.values()];
    expect(verifyAccessToken(tokens[0]).sessionVersion).toBe(7);
    expect(verifyRefreshToken(tokens[1]).sessionVersion).toBe(7);
  });
});

describe("organization hierarchy integrity", () => {
  const hierarchy = [
    { employeeId: "ceo", managerId: null },
    { employeeId: "head", managerId: "ceo" },
    { employeeId: "member", managerId: "head" },
  ];

  it("accepts a normal manager chain", () => {
    expect(reportingHierarchyCycle(hierarchy, "member", "head")).toBeNull();
  });

  it("blocks indirect reporting cycles", () => {
    expect(reportingHierarchyCycle(hierarchy, "ceo", "member")).toBe("WOULD_CREATE_CYCLE");
  });
});

describe("asset and HR-document persistence integrity", () => {
  it("keeps assignment and asset status synchronized", () => {
    expect(resolveAssetStatus({ assignedEmployeeId: "employee-1" })).toBe("ASSIGNED");
    expect(resolveAssetStatus({ assignedEmployeeId: null, previousStatus: "ASSIGNED" })).toBe(
      "AVAILABLE",
    );
    expect(() =>
      resolveAssetStatus({ assignedEmployeeId: null, requestedStatus: "ASSIGNED" }),
    ).toThrow("without an employee");
  });

  it("uses the same printed-copy value accepted by MySQL", () => {
    expect(
      certificateRequestSchema.parse({
        certificateType: "EMPLOYMENT",
        purpose: "Housing verification",
        deliveryMode: "PRINTED",
      }).deliveryMode,
    ).toBe("PRINTED");
  });

  it("maps secondary workflow endpoints to Developer Admin module controls", () => {
    expect(moduleForApiPath("/weekly-offs")).toBe("LEAVE");
    expect(moduleForApiPath("/biometric/devices")).toBe("ATTENDANCE");
    expect(moduleForApiPath("/holidays")).toBe("COMPANY");
    expect(moduleForApiPath("/branches", "PATCH")).toBe("COMPANY");
    expect(moduleForApiPath("/branches", "GET")).toBeNull();
    expect(moduleForApiPath("/employees/employee-1", "PATCH")).toBe("PEOPLE");
    expect(moduleForApiPath("/notifications")).toBe("COMMUNICATIONS");
    expect(moduleForApiPath("/module-access/me")).toBeNull();
  });
});

describe("leave review integrity", () => {
  it("normalizes review notes and rejects oversized decisions", () => {
    expect(leaveDecisionSchema.parse({ note: "  Approved for the requested dates.  " }).note).toBe(
      "Approved for the requested dates.",
    );
    expect(leaveDecisionSchema.safeParse({ note: "x".repeat(1001) }).success).toBe(false);
  });

  it("accepts only Google document links for Sick Leave evidence", () => {
    expect(
      medicalDocumentSchema.safeParse({ url: "https://drive.google.com/file/d/example/view" })
        .success,
    ).toBe(true);
    expect(
      medicalDocumentSchema.safeParse({ url: "https://example.com/untrusted-document" }).success,
    ).toBe(false);
  });
});
