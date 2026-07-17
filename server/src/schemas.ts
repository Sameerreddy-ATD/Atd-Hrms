import {
  AttendanceMode,
  EmployeeStatus,
  EmploymentType,
  EventType,
  Gender,
  Role,
  TaskPriority,
  TaskStatus,
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
  password: z
    .string()
    .min(10)
    .max(200)
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
  role: z.nativeEnum(Role).optional(),
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
  organizationLevel: z.enum(["HEAD", "SENIOR", "JUNIOR", "MEMBER"]).optional(),
  weeklyOffDays: z
    .array(z.enum(["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]))
    .max(7)
    .optional(),
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
  organizationLevel: z.enum(["HEAD", "SENIOR", "JUNIOR", "MEMBER"]).optional(),
  attendanceMode: z.nativeEnum(AttendanceMode).optional(),
  isFieldEmployee: z.boolean().optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
  weeklyOffDays: z
    .array(z.enum(["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]))
    .max(7)
    .optional(),
});

export const branchSchema = z.object({
  name: z.string().min(2).max(160),
  code: z.string().min(1).max(40),
  address: z.string().min(2).max(500),
  city: z.string().max(120).nullable().optional(),
  status: z.string().max(40).optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  attendanceRadiusMeters: z.coerce.number().int().min(25).max(5000).optional(),
});

export const branchUpdateSchema = branchSchema.partial();

export const departmentSchema = z.object({
  name: z.string().min(2).max(160),
  headEmployeeId: z.string().nullable().optional(),
  parentDepartmentId: z.string().nullable().optional(),
  unitType: z.enum(["TEAM", "SUBTEAM", "FUNCTION"]).optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
});

export const departmentUpdateSchema = departmentSchema.partial();

export const taskSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  assigneeEmployeeIds: z.array(z.string().min(1)).min(1).max(100),
  parentTaskId: z.string().nullable().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  assigneeEmployeeIds: z.array(z.string().min(1)).min(1).max(100).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

export const taskLogSchema = z.object({
  message: z.string().trim().min(2).max(5000),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  minutesWorked: z.coerce.number().int().min(0).max(1440).optional(),
});

export const holidaySchema = z.object({
  name: z.string().min(2).max(160),
  date: z.coerce.date(),
  branchId: z.string().nullable().optional(),
  type: z.enum(["Public", "Optional", "Restricted"]),
  status: z.string().max(40).optional(),
});

export const holidayUpdateSchema = holidaySchema.partial();

export const companyAssetSchema = z.object({
  catalogId: z.string().min(1).nullable().optional(),
  assetCode: z.string().min(2).max(60).optional(),
  name: z.string().min(2).max(160),
  category: z.string().min(2).max(80).optional(),
  serialNumber: z.string().max(120).nullable().optional(),
  purchaseValue: z.coerce.number().min(0).max(100_000_000),
  purchaseDate: z.coerce.date().nullable().optional(),
  assetType: z.enum(["PHYSICAL", "ONLINE"]).optional(),
  costFrequency: z.enum(["ONE_TIME", "MONTHLY", "YEARLY"]).optional(),
  renewalDate: z.coerce.date().nullable().optional(),
  status: z.enum(["AVAILABLE", "ASSIGNED", "UNDER_REPAIR", "RETIRED"]).optional(),
  assignedEmployeeId: z.string().nullable().optional(),
  branchId: z.string().min(1).nullable().optional(),
  location: z.string().max(160).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const companyAssetUpdateSchema = companyAssetSchema.partial();

export const assetReturnSchema = z
  .object({
    condition: z.enum(["GOOD", "FAIR", "DAMAGED", "NOT_WORKING"]),
    accessoriesReturned: z.boolean(),
    chargerReturned: z.boolean(),
    dataBackedUp: z.boolean(),
    dataWiped: z.boolean(),
    physicalDamage: z.boolean(),
    damageNotes: z.string().max(2000).nullable().optional(),
    remarks: z.string().max(2000).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.physicalDamage && !value.damageNotes?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["damageNotes"],
        message: "Describe the physical damage",
      });
    }
  });

export const expenseClaimSchema = z.object({
  category: z.enum(["TRAVEL", "FUEL", "MEALS", "LODGING", "MOBILE_INTERNET", "OFFICE", "OTHER"]),
  amount: z.coerce.number().positive().max(10_000_000),
  expenseDate: z.coerce.date(),
  description: z.string().trim().min(5).max(3000),
  receiptUrl: z.string().url().max(2000).nullable().optional(),
});

export const expenseClaimReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PAID"]),
  reviewNotes: z.string().trim().max(2000).nullable().optional(),
});

export const certificateRequestSchema = z.object({
  certificateType: z.enum([
    "EMPLOYMENT",
    "EXPERIENCE",
    "SALARY",
    "ADDRESS_PROOF",
    "RELIEVING",
    "OTHER",
  ]),
  purpose: z.string().trim().min(5).max(3000),
  deliveryMode: z.enum(["DIGITAL", "PRINTED"]).default("DIGITAL"),
  requiredBy: z.coerce.date().nullable().optional(),
});

export const certificateRequestReviewSchema = z.object({
  status: z.enum(["IN_PROGRESS", "READY", "REJECTED", "COLLECTED"]),
  hrNotes: z.string().trim().max(2000).nullable().optional(),
  documentUrl: z.string().url().max(2000).nullable().optional(),
});

export const assetCatalogItemSchema = z.object({
  name: z.string().min(2).max(160),
  category: z.string().min(2).max(80),
  defaultValue: z.coerce.number().min(0).max(100_000_000).nullable().optional(),
});

export const assetCatalogItemUpdateSchema = assetCatalogItemSchema.partial();

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
  confirmLeaveCancellation: z.boolean().optional(),
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
  reason: z.string().trim().min(3).max(1000),
  medicalDocumentUrl: z.string().url().max(2000).optional(),
});

export const medicalDocumentSchema = z.object({
  url: z.string().url().max(2000),
});

export const leaveBalanceAdjustmentSchema = z.object({
  adjustment: z.coerce.number().min(-365).max(365),
  reason: z.string().trim().min(3).max(500),
});

export const weeklyOffRequestSchema = z.object({
  date: z.coerce.date(),
  reason: z.string().trim().max(500).optional(),
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

const announcementFields = z.object({
  title: z.string().trim().min(3).max(120),
  message: z.string().trim().min(3).max(1000),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).default("NORMAL"),
  publishAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const announcementSchema = announcementFields.refine(
  (value) => !value.expiresAt || !value.publishAt || value.expiresAt > value.publishAt,
  {
    message: "Expiry must be after the publish date",
    path: ["expiresAt"],
  },
);

export const announcementUpdateSchema = announcementFields.partial();

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(5000),
  keys: z.object({
    p256dh: z.string().min(1).max(5000),
    auth: z.string().min(1).max(5000),
  }),
});
