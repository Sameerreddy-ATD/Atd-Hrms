import {
  AttendanceMode,
  EmployeeStatus,
  EmploymentType,
  EventType,
  Gender,
  Role,
  UserStatus,
  WorkType,
} from "@prisma/client";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

export const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(255),
  phone: z.string().max(30).optional(),
  password: z.string().min(10).max(200).optional(),
  role: z.nativeEnum(Role),
  employeeId: z.string().optional(),
  employeeCode: z.string().max(40).optional(),
  departmentId: z.string().nullable().optional(),
  designation: z.string().max(120).nullable().optional(),
  homeBranchId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  attendanceMode: z.nativeEnum(AttendanceMode).optional(),
  isFieldEmployee: z.boolean().optional(),
  joiningDate: z.coerce.date().nullable().optional(),
  dateOfBirth: z.coerce.date().nullable().optional(),
  gender: z.nativeEnum(Gender).nullable().optional(),
  employmentType: z.nativeEnum(EmploymentType).nullable().optional(),
});

export const predefinedPasswordSchema = z.object({
  password: z
    .string()
    .min(10)
    .max(200)
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(30).nullable().optional(),
  role: z.nativeEnum(Role).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  firstLoginPasswordChangeRequired: z.boolean().optional(),
  suspendedUntil: z.coerce.date().nullable().optional(),
  suspensionStartsAt: z.coerce.date().nullable().optional(),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1).max(200),
  nextPassword: z
    .string()
    .min(8)
    .max(200)
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const updateEmployeeSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  departmentId: z.string().nullable().optional(),
  designation: z.string().max(120).nullable().optional(),
  homeBranchId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  joiningDate: z.coerce.date().nullable().optional(),
  dateOfBirth: z.coerce.date().nullable().optional(),
  gender: z.nativeEnum(Gender).nullable().optional(),
  employmentType: z.nativeEnum(EmploymentType).nullable().optional(),
  attendanceMode: z.nativeEnum(AttendanceMode).optional(),
  isFieldEmployee: z.boolean().optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
});

export const branchSchema = z.object({
  name: z.string().min(2).max(160),
  code: z.string().min(1).max(40),
  address: z.string().min(2).max(500),
  city: z.string().max(120).nullable().optional(),
  status: z.string().max(40).optional(),
});

export const branchUpdateSchema = branchSchema.partial();

export const departmentSchema = z.object({
  name: z.string().min(2).max(160),
  headEmployeeId: z.string().nullable().optional(),
});

export const departmentUpdateSchema = departmentSchema.partial();

export const holidaySchema = z.object({
  name: z.string().min(2).max(160),
  date: z.coerce.date(),
  branchId: z.string().nullable().optional(),
  type: z.enum(["Public", "Optional", "Restricted"]),
  status: z.string().max(40).optional(),
});

export const holidayUpdateSchema = holidaySchema.partial();

export const biometricMappingSchema = z.object({
  employeeId: z.string().min(1),
  biometricUserId: z.string().min(1).max(120),
  deviceId: z.string().nullable().optional(),
  status: z.string().max(40).optional(),
});

export const biometricMappingUpdateSchema = biometricMappingSchema.partial();

export const biometricDeviceSchema = z.object({
  name: z.string().min(2).max(160),
  code: z.string().min(1).max(80),
  branchId: z.string().min(1),
  deviceIp: z.string().max(120).nullable().optional(),
  port: z.number().int().positive().max(65535).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  status: z.string().max(40).optional(),
});

export const biometricDeviceUpdateSchema = biometricDeviceSchema.partial();

export const thumbEventSchema = z.object({
  employeeId: z.string(),
  branchId: z.string(),
  deviceId: z.string().optional(),
  eventTime: z.coerce.date().optional(),
  eventType: z.nativeEnum(EventType).optional(),
  biometricUserId: z.string().optional(),
  rawPayload: z.unknown().optional(),
});

export const mobileEventSchema = z.object({
  employeeId: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().max(500).optional(),
  mobileDeviceId: z.string().min(3).max(200),
  remarks: z.string().max(1000).optional(),
  eventTime: z.coerce.date().optional(),
});

export const clientEventSchema = mobileEventSchema.extend({
  clientName: z.string().min(1).max(200),
  clientLocationName: z.string().max(200).optional(),
  photoUrl: z.string().url().optional(),
});

export const leaveRequestSchema = z.object({
  leaveTypeId: z.string(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  days: z.number().positive().max(365),
  reason: z.string().min(3).max(1000),
});

export const leaveTypeSchema = z.object({
  name: z.string().min(2).max(120),
  paid: z.boolean().optional(),
});

export const leaveTypeUpdateSchema = leaveTypeSchema.partial();

export const profileEditSchema = z.object({
  requestedData: z.object({
    phone: z.string().max(30).optional(),
    address: z.string().max(500).optional(),
    emergencyContact: z.unknown().optional(),
    profilePhoto: z.string().url().optional(),
    personalEmail: z.string().email().optional(),
    bloodGroup: z.string().max(10).optional(),
  }),
});

export const correctionSchema = z.object({
  employeeId: z.string(),
  date: z.coerce.date(),
  punchTime: z.coerce.date(),
  eventType: z.enum([
    EventType.OFFICE_IN,
    EventType.OFFICE_OUT,
    EventType.FIELD_CHECK_IN,
    EventType.FIELD_CHECK_OUT,
  ]),
  remarks: z.string().min(3).max(1000),
});

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8)
    .max(200)
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});
