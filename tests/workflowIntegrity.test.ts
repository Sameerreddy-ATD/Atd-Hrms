import { describe, expect, it } from "vitest";
import { Role, TaskBoardAccessType } from "@prisma/client";
import { resolveAssetStatus } from "../server/src/assetRules.js";
import { reportingHierarchyCycle } from "../server/src/organizationRules.js";
import {
  certificateRequestReviewSchema,
  certificateRequestSchema,
  createUserSchema,
  updateEmployeeSchema,
} from "../server/src/schemas.js";
import { moduleForApiPath } from "../server/src/module-access.js";
import { issueCookies, verifyAccessToken, verifyRefreshToken } from "../server/src/security.js";
import { boardAccessWhereFor } from "../server/src/taskBoardAccess.js";

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

  it("embeds the revocable session version and device id in both browser tokens", () => {
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
      "device-session-1",
    );
    const tokens = [...cookies.values()];
    expect(verifyAccessToken(tokens[0]).sessionVersion).toBe(7);
    expect(verifyRefreshToken(tokens[1]).sessionVersion).toBe(7);
    // Both tokens must name the device so one device can be signed out alone.
    expect(verifyAccessToken(tokens[0]).sid).toBe("device-session-1");
    expect(verifyRefreshToken(tokens[1]).sid).toBe("device-session-1");
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
    expect(
      resolveAssetStatus({
        assignedEmployeeId: "employee-1",
        requestedStatus: "AVAILABLE",
      }),
    ).toBe("ASSIGNED");
    expect(
      resolveAssetStatus({
        assignedEmployeeId: "employee-1",
        requestedStatus: "RETIRED",
      }),
    ).toBe("ASSIGNED");
    expect(resolveAssetStatus({ assignedEmployeeId: null, previousStatus: "ASSIGNED" })).toBe(
      "AVAILABLE",
    );
    expect(
      resolveAssetStatus({
        assignedEmployeeId: null,
        requestedStatus: "UNDER_REPAIR",
        previousStatus: "AVAILABLE",
      }),
    ).toBe("UNDER_REPAIR");
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

  it("accepts blank optional required-by dates on HR document requests", () => {
    expect(
      certificateRequestSchema.parse({
        certificateType: "SALARY",
        purpose: "Bank account opening",
        deliveryMode: "DIGITAL",
        requiredBy: "",
      }).requiredBy,
    ).toBeNull();
    expect(
      certificateRequestSchema.parse({
        certificateType: "SALARY",
        purpose: "Bank account opening",
        deliveryMode: "DIGITAL",
        requiredBy: null,
      }).requiredBy,
    ).toBeNull();
  });

  it("accepts blank document URLs when HR reviews a request", () => {
    expect(
      certificateRequestReviewSchema.parse({
        status: "IN_PROGRESS",
        hrNotes: "",
        documentUrl: "",
      }),
    ).toMatchObject({ status: "IN_PROGRESS", hrNotes: null, documentUrl: null });
  });

  it("maps secondary workflow endpoints to Developer Admin module controls", () => {
    expect(moduleForApiPath("/weekly-offs")).toBe("LEAVE");
    expect(moduleForApiPath("/biometric/devices")).toBe("ATTENDANCE");
    expect(moduleForApiPath("/holidays")).toBe("LEAVE");
    expect(moduleForApiPath("/holidays", "POST")).toBe("COMPANY");
    expect(moduleForApiPath("/assets")).toBe("COMPANY");
    expect(moduleForApiPath("/assets/mine")).toBe("PROFILE");
    expect(moduleForApiPath("/branches", "PATCH")).toBe("COMPANY");
    expect(moduleForApiPath("/branches", "GET")).toBeNull();
    expect(moduleForApiPath("/employees/employee-1", "PATCH")).toBe("PEOPLE");
    expect(moduleForApiPath("/notifications")).toBe("COMMUNICATIONS");
    expect(moduleForApiPath("/module-access/me")).toBeNull();
    expect(moduleForApiPath("/lifecycle/jobs")).toBe("TALENT");
    expect(moduleForApiPath("/lifecycle/onboarding")).toBe("LIFECYCLE");
    expect(moduleForApiPath("/lifecycle/performance/reviews")).toBe("PERFORMANCE");
    expect(moduleForApiPath("/lifecycle/lms")).toBe("LMS");
  });
});

describe("task board ACL helpers", () => {
  it("scopes board access for non-developer roles and leaves developers unrestricted", () => {
    expect(boardAccessWhereFor({ id: "u1", role: Role.DEVELOPER_ADMIN } as never, null)).toEqual(
      {},
    );
    const employeeScope = boardAccessWhereFor(
      {
        id: "u2",
        employeeId: "e1",
        role: Role.EMPLOYEE,
      } as never,
      "dept-sales",
    );
    expect(employeeScope).toMatchObject({
      OR: expect.arrayContaining([
        { createdByUserId: "u2" },
        { accessType: TaskBoardAccessType.OPEN },
        {
          accessType: TaskBoardAccessType.DEPARTMENT_GATED,
          departmentAccess: { some: { departmentId: "dept-sales" } },
        },
        {
          accessType: TaskBoardAccessType.MEMBER_GATED,
          members: { some: { employeeId: "e1" } },
        },
      ]),
    });
  });
});
