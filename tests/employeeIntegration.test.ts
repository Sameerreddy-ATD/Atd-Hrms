import { describe, expect, it } from "vitest";
import { externalEmployeeDto, INTEGRATION_SCOPES } from "../server/src/integration-api.js";
import { employeeDto } from "../server/src/mapper.js";
import { expenseClaimSchema } from "../server/src/schemas.js";

describe("employee integration contract", () => {
  it("uses employeeId as the stable DTO id and exposes userId separately", () => {
    const employee = {
      employeeId: "employee-1",
      employeeCode: "EMP-0001",
      externalReference: "PAYROLL-1",
      version: 4,
      name: "Employee One",
      email: "employee@example.com",
      phone: "+91 9000000000",
      status: "ACTIVE",
      user: { id: "user-99", status: "ACTIVE" },
      departmentId: "department-1",
      department: { departmentId: "department-1", name: "Operations" },
      designation: "Executive",
      organizationLevel: "MEMBER",
      homeBranchId: "branch-1",
      homeBranch: { branchId: "branch-1", branchName: "Hyderabad" },
      managerId: "employee-2",
      manager: { employeeId: "employee-2", employeeCode: "EMP-0002", name: "Manager" },
      joiningDate: new Date("2026-01-02T00:00:00.000Z"),
      dateOfBirth: new Date("1995-03-04T00:00:00.000Z"),
      gender: "PREFER_NOT_TO_SAY",
      employmentType: "FULL_TIME",
      terminatedAt: null,
      attendanceMode: "BOTH",
      attendanceRequired: true,
      isFieldEmployee: false,
      shiftType: "DAY",
      shiftStartMinutes: 540,
      shiftEndMinutes: 1080,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-22T00:00:00.000Z"),
    } as unknown as Parameters<typeof externalEmployeeDto>[0];

    const dto = externalEmployeeDto(employee);
    expect(dto.employeeId).toBe("employee-1");
    expect(dto.account).toEqual({ userId: "user-99", status: "ACTIVE" });
    expect(dto.version).toBe(4);
    expect(dto).not.toHaveProperty("passwordHash");
    expect(dto).not.toHaveProperty("failedLoginAttempts");

    const browserDto = employeeDto({
      ...employee,
      user: {
        id: "user-99",
        role: "EMPLOYEE",
        status: "ACTIVE",
        failedLoginAttempts: 0,
        suspensionStartsAt: null,
        suspendedUntil: null,
      },
      homeBranch: null,
      department: { name: "Operations" },
      manager: { employeeId: "employee-2", name: "Manager" },
    } as unknown as Parameters<typeof employeeDto>[0]);
    expect(browserDto.id).toBe("employee-1");
    expect(browserDto.userId).toBe("user-99");
  });

  it("defines independent least-privilege integration scopes", () => {
    expect(INTEGRATION_SCOPES).toEqual([
      "employees:read",
      "employees:write",
      "employee-events:read",
    ]);
  });
});

describe("expense attachment integrity", () => {
  const validExpense = {
    claimType: "EXPENSE" as const,
    title: "Client travel",
    amount: 1500,
    expenseDate: "2026-07-20",
    description: "Travel to the customer office",
    receiptUrl: "https://drive.google.com/file/d/example/view",
  };

  it("rejects a Drive attachment without sharing acknowledgement", () => {
    const result = expenseClaimSchema.safeParse({
      ...validExpense,
      receiptAccessConfirmed: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-Google attachment URLs", () => {
    const result = expenseClaimSchema.safeParse({
      ...validExpense,
      receiptUrl: "https://example.com/receipt.pdf",
      receiptAccessConfirmed: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a Google Drive URL after sharing acknowledgement", () => {
    const result = expenseClaimSchema.safeParse({
      ...validExpense,
      receiptAccessConfirmed: true,
    });
    expect(result.success).toBe(true);
  });
});
