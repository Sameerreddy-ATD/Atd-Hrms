import { describe, expect, it } from "vitest";
import { encryptEmployeeField } from "../server/src/employeePrivateData.js";
import { employeeDto } from "../server/src/mapper.js";

const employee = {
  employeeId: "employee-1",
  employeeCode: "EMP-0001",
  externalReference: null,
  version: 1,
  name: "Profile Test",
  email: "profile@example.com",
  phone: "9000000000",
  companyPhone: "9111111111",
  companyEntity: "FUELISTIC_INNOVATIONS_PRIVATE_LIMITED",
  departmentId: null,
  designation: "Engineer",
  homeBranchId: null,
  managerId: null,
  joiningDate: new Date("2026-01-01"),
  dateOfBirth: new Date("1995-01-01"),
  gender: "PREFER_NOT_TO_SAY",
  bloodGroup: "O+",
  employmentType: "FULL_TIME",
  organizationLevel: "MEMBER",
  bankAccountType: "SALARY",
  bankAccountHolderName: "Profile Test",
  bankIfscCode: "ABCD0123456",
  bankAccountNumberEncrypted: encryptEmployeeField("123456789012"),
  bankAccountNumberLast4: "9012",
  panNumberEncrypted: encryptEmployeeField("ABCDE1234F"),
  panNumberLast4: "234F",
  aadhaarNumberEncrypted: encryptEmployeeField("234567890123"),
  aadhaarNumberLast4: "0123",
  uanNumberEncrypted: encryptEmployeeField("100200300400"),
  uanNumberLast4: "0400",
  attendanceMode: "BOTH",
  attendanceRequired: true,
  shiftType: "DAY",
  shiftStartMinutes: 540,
  shiftEndMinutes: 1080,
  isFieldEmployee: false,
  status: "ACTIVE",
  terminatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: {
    id: "user-1",
    role: "EMPLOYEE",
    status: "ACTIVE",
    failedLoginAttempts: 0,
    suspensionStartsAt: null,
    suspendedUntil: null,
  },
  department: null,
  homeBranch: null,
  manager: null,
};

describe("employee profile response privacy", () => {
  it("omits private identifiers from directory responses", () => {
    const dto = employeeDto(employee as never, {
      id: "admin",
      role: "DEVELOPER_ADMIN",
      employeeId: "admin-employee",
    });
    expect(dto.companyEntity).toBe("FUELISTIC_INNOVATIONS_PRIVATE_LIMITED");
    expect(dto.bankAccountNumber).toBeUndefined();
    expect(dto.panNumber).toBeUndefined();
  });

  it("returns private identifiers only for an authorized detail response", () => {
    const dto = employeeDto(
      employee as never,
      { id: "user-1", role: "EMPLOYEE", employeeId: "employee-1" },
      true,
    );
    expect(dto.bankAccountNumber).toBe("123456789012");
    expect(dto.panNumber).toBe("ABCDE1234F");
    expect(dto.aadhaarNumber).toBe("234567890123");
  });
});
