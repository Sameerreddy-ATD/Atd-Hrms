import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { emergencyContactSchema, updateEmployeeSchema } from "../server/src/schemas.js";
import { encryptEmployeeField } from "../server/src/employeePrivateData.js";
import { employeeDto } from "../server/src/mapper.js";

/** Mirrors HR PATCH restriction in server/src/app.ts (managerId only). */
function hrEmployeePatchForbidden(body: Record<string, unknown>) {
  return body.managerId === undefined || Object.keys(body).some((key) => key !== "managerId");
}

const ATTENDANCE_OPS_ROLES = ["manager", "hr", "main_admin", "ceo", "developer_admin"] as const;

function sampleEmployee(overrides: Record<string, unknown> = {}) {
  return {
    employeeId: "employee-1",
    employeeCode: "EMP-0001",
    externalReference: null,
    version: 1,
    name: "Profile Test",
    email: "profile@example.com",
    phone: "9000000000",
    companyPhone: null,
    companyEntity: "ANYTIME_DIESEL",
    departmentId: null,
    designation: null,
    homeBranchId: null,
    managerId: null,
    joiningDate: null,
    dateOfBirth: null,
    gender: null,
    bloodGroup: null,
    employmentType: null,
    organizationLevel: "MEMBER",
    bankAccountType: null,
    bankAccountHolderName: null,
    bankIfscCode: null,
    bankAccountNumberEncrypted: encryptEmployeeField("123456789012"),
    bankAccountNumberLast4: "9012",
    panNumberEncrypted: null,
    panNumberLast4: null,
    aadhaarNumberEncrypted: null,
    aadhaarNumberLast4: null,
    uanNumberEncrypted: null,
    uanNumberLast4: null,
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
    emergencyContact: {
      contactName: "Priya Reddy",
      relationship: "Spouse",
      phone: "9876543210",
      alternatePhone: null,
      address: null,
      bloodGroup: "O+",
      medicalNotes: null,
    },
    user: null,
    department: null,
    homeBranch: null,
    manager: null,
    ...overrides,
  } as never;
}

describe("P0 emergency contact and HR employee edit contracts", () => {
  it("accepts a complete emergency contact payload", () => {
    const result = emergencyContactSchema.safeParse({
      contactName: "Priya Reddy",
      relationship: "Spouse",
      phone: "9876543210",
      alternatePhone: "9123456780",
      address: "Hyderabad",
      bloodGroup: "O+",
      medicalNotes: "Penicillin allergy",
    });
    expect(result.success).toBe(true);
  });

  it("rejects emergency contact without a phone number", () => {
    const result = emergencyContactSchema.safeParse({
      contactName: "Priya Reddy",
      relationship: "Spouse",
      phone: "",
    });
    expect(result.success).toBe(false);
  });

  it("includes emergency contact in private employee DTO views for HR and self", () => {
    const employee = sampleEmployee();
    const hrDto = employeeDto(employee, { id: "hr-1", role: "HR", employeeId: "hr-emp" }, true);
    expect(hrDto.emergencyContact).toMatchObject({
      contactName: "Priya Reddy",
      relationship: "Spouse",
      phone: "9876543210",
      bloodGroup: "O+",
    });

    const selfDto = employeeDto(
      employee,
      { id: "u-1", role: "EMPLOYEE", employeeId: "employee-1" },
      true,
    );
    expect(selfDto.emergencyContact?.contactName).toBe("Priya Reddy");
  });

  it("omits emergency contact from non-private list-style DTO views", () => {
    const dto = employeeDto(
      sampleEmployee(),
      { id: "hr-1", role: "HR", employeeId: "hr-emp" },
      false,
    );
    expect(dto.emergencyContact).toBeUndefined();
  });

  it("allows HR-shaped updates that contain only managerId", () => {
    const result = updateEmployeeSchema.safeParse({ managerId: "manager-1" });
    expect(result.success).toBe(true);
  });

  it("enforces the HR PATCH managerId-only authorization rule", () => {
    expect(hrEmployeePatchForbidden({ managerId: "manager-1" })).toBe(false);
    expect(hrEmployeePatchForbidden({ managerId: null })).toBe(false);
    expect(hrEmployeePatchForbidden({ managerId: "manager-1", name: "Other" })).toBe(true);
    expect(hrEmployeePatchForbidden({ name: "Other" })).toBe(true);
    expect(hrEmployeePatchForbidden({})).toBe(true);
  });

  it("documents that updateEmployeeSchema still accepts broader fields for Developer Admin", () => {
    const result = updateEmployeeSchema.safeParse({
      managerId: "manager-1",
      designation: "Engineer",
      panNumber: "ABCDE1234F",
    });
    expect(result.success).toBe(true);
  });
});

describe("P0 attendance navigation roles", () => {
  const menuSource = readFileSync("src/lib/menu.ts", "utf8");

  it("exposes Field and Branch attendance to the same ops roles as the backend APIs", () => {
    const rolesLiteral = ATTENDANCE_OPS_ROLES.map((role) => `"${role}"`).join(", ");
    expect(menuSource).toContain('label: "Field Attendance"');
    expect(menuSource).toContain('to: "/attendance/field"');
    expect(menuSource).toContain(`roles: [${rolesLiteral}]`);
    expect(menuSource).toContain('label: "Branch Attendance"');
    expect(menuSource).toContain('to: "/attendance/branch"');
  });

  it("does not list a retired mismatch attendance route in the menu", () => {
    expect(menuSource).not.toContain("/attendance/mismatch");
  });

  it("removes the mismatch route file while keeping the emergency-contact redirect", () => {
    expect(existsSync("src/routes/_app.attendance.mismatch.tsx")).toBe(false);
    expect(existsSync("src/routes/_app.emergency-contact.tsx")).toBe(true);
    expect(existsSync("src/routes/_app.attendance.field.tsx")).toBe(true);
    expect(existsSync("src/routes/_app.attendance.branch.tsx")).toBe(true);
    expect(readFileSync("src/routes/_app.emergency-contact.tsx", "utf8")).toContain(
      'to="/profile"',
    );
  });

  it("aligns menu ops roles with backend Role enum values used by attendance HR APIs", () => {
    const backendRoles = [
      Role.MANAGER,
      Role.HR,
      Role.MAIN_ADMIN,
      Role.CEO,
      Role.DEVELOPER_ADMIN,
    ].map((role) => role.toLowerCase());
    expect(backendRoles).toEqual([...ATTENDANCE_OPS_ROLES]);
  });
});
