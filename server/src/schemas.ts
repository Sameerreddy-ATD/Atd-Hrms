import {
  AttendanceMode,
  BankAccountType,
  CompanyEntity,
  EmployeeStatus,
  EmploymentType,
  EventType,
  Gender,
  Role,
  ShiftType,
  TaskPriority,
  TaskBoardAccessType,
  TaskStatus,
  UserStatus,
  WorkType,
} from "@prisma/client";
import { z } from "zod";

const bloodGroupSchema = z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
const bankAccountNumberSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{6,34}$/, "Enter a valid bank account number");
const ifscCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid 11-character IFSC code");
const panNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Enter a valid PAN");
const aadhaarNumberSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ""))
  .refine((value) => /^[2-9][0-9]{11}$/.test(value), "Enter a valid 12-digit Aadhaar number");
const uanNumberSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ""))
  .refine((value) => /^[0-9]{12}$/.test(value), "Enter a valid 12-digit UAN");

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

export const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(255),
  phone: z.string().max(30).optional(),
  companyPhone: z.string().max(30).optional(),
  companyEntity: z.nativeEnum(CompanyEntity).default(CompanyEntity.ANYTIME_DIESEL),
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
  bloodGroup: bloodGroupSchema.nullable().optional(),
  employmentType: z.nativeEnum(EmploymentType).nullable().optional(),
  organizationLevel: z.enum(["HEAD", "SENIOR", "JUNIOR", "MEMBER"]).optional(),
  bankAccountType: z.nativeEnum(BankAccountType).nullable().optional(),
  bankAccountHolderName: z.string().trim().max(160).nullable().optional(),
  bankIfscCode: ifscCodeSchema.nullable().optional(),
  bankAccountNumber: bankAccountNumberSchema.nullable().optional(),
  panNumber: panNumberSchema.nullable().optional(),
  aadhaarNumber: aadhaarNumberSchema.nullable().optional(),
  uanNumber: uanNumberSchema.nullable().optional(),
  shiftType: z.nativeEnum(ShiftType).optional(),
  shiftStartMinutes: z.number().int().min(0).max(1439).optional(),
  shiftEndMinutes: z.number().int().min(0).max(1439).optional(),
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
  oldPassword: z.string().max(200).optional(),
  nextPassword: z
    .string()
    .min(8)
    .max(200)
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const resetTestDataSchema = z.object({
  confirmation: z.literal("DELETE ALL TEST DATA"),
  password: z.string().min(1).max(200),
});

export const updateEmployeeSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    email: z.string().email().max(255).nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
    companyPhone: z.string().max(30).nullable().optional(),
    companyEntity: z.nativeEnum(CompanyEntity).optional(),
    departmentId: z.string().nullable().optional(),
    designation: z.string().max(120).nullable().optional(),
    homeBranchId: z.string().nullable().optional(),
    managerId: z.string().nullable().optional(),
    joiningDate: z.coerce.date().nullable().optional(),
    dateOfBirth: z.coerce.date().nullable().optional(),
    gender: z.nativeEnum(Gender).nullable().optional(),
    bloodGroup: bloodGroupSchema.nullable().optional(),
    employmentType: z.nativeEnum(EmploymentType).nullable().optional(),
    organizationLevel: z.enum(["HEAD", "SENIOR", "JUNIOR", "MEMBER"]).optional(),
    bankAccountType: z.nativeEnum(BankAccountType).nullable().optional(),
    bankAccountHolderName: z.string().trim().max(160).nullable().optional(),
    bankIfscCode: ifscCodeSchema.nullable().optional(),
    bankAccountNumber: bankAccountNumberSchema.nullable().optional(),
    panNumber: panNumberSchema.nullable().optional(),
    aadhaarNumber: aadhaarNumberSchema.nullable().optional(),
    uanNumber: uanNumberSchema.nullable().optional(),
    attendanceMode: z.nativeEnum(AttendanceMode).optional(),
    isFieldEmployee: z.boolean().optional(),
    status: z.nativeEnum(EmployeeStatus).optional(),
    shiftType: z.nativeEnum(ShiftType).optional(),
    shiftStartMinutes: z.number().int().min(0).max(1439).optional(),
    shiftEndMinutes: z.number().int().min(0).max(1439).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

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

export const taskSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(5000).nullable().optional(),
    assigneeEmployeeIds: z.array(z.string().min(1)).min(1).max(100),
    parentTaskId: z.string().nullable().optional(),
    boardId: z.string().nullable().optional(),
    stageId: z.string().nullable().optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    startDate: z.coerce.date().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.startDate && value.dueDate && value.dueDate < value.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueDate"],
        message: "Due date cannot be before the start date",
      });
    }
  });

export const taskUpdateSchema = z.object({
  version: z.coerce.number().int().positive(),
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  assigneeEmployeeIds: z.array(z.string().min(1)).min(1).max(100).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  stageId: z.string().nullable().optional(),
});

const taskBoardStageSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(2).max(80),
  color: z.enum(["SLATE", "BLUE", "AMBER", "VIOLET", "EMERALD", "RED"]),
  status: z.nativeEnum(TaskStatus),
});

function validateTaskBoardConfiguration(
  value: {
    accessType: TaskBoardAccessType;
    allowedRoles: Role[];
    memberEmployeeIds: string[];
    stages: Array<z.infer<typeof taskBoardStageSchema>>;
  },
  context: z.RefinementCtx,
) {
  if (value.stages.filter((stage) => stage.status === TaskStatus.COMPLETED).length !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stages"],
      message: "Select exactly one completed stage",
    });
  }
  if (!value.stages.some((stage) => stage.status === TaskStatus.TODO)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stages"],
      message: "Add a to-do stage",
    });
  }
  if (new Set(value.stages.map((stage) => stage.name.toLowerCase())).size !== value.stages.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stages"],
      message: "Stage names must be unique",
    });
  }
  if (value.accessType === TaskBoardAccessType.ROLE_GATED && value.allowedRoles.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["allowedRoles"],
      message: "Select at least one role",
    });
  }
  if (
    value.accessType === TaskBoardAccessType.MEMBER_GATED &&
    value.memberEmployeeIds.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["memberEmployeeIds"],
      message: "Select at least one member",
    });
  }
}

const taskBoardConfigurationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  accessType: z.nativeEnum(TaskBoardAccessType).default(TaskBoardAccessType.OPEN),
  allowedRoles: z.array(z.nativeEnum(Role)).max(20).default([]),
  memberEmployeeIds: z.array(z.string().min(1)).max(500).default([]),
  stages: z.array(taskBoardStageSchema).min(2).max(12),
});

export const taskBoardSchema = taskBoardConfigurationSchema.superRefine(
  validateTaskBoardConfiguration,
);

export const taskBoardUpdateSchema = taskBoardConfigurationSchema
  .extend({ version: z.coerce.number().int().positive() })
  .superRefine(validateTaskBoardConfiguration);

export const taskBoardArchiveSchema = z.object({
  version: z.coerce.number().int().positive(),
  archived: z.boolean(),
});

export const taskLogSchema = z.object({
  version: z.coerce.number().int().positive(),
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
  assignmentScope: z.enum(["EMPLOYEE", "COMPANY"]).optional(),
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

export const expenseClaimSchema = z
  .object({
    claimType: z.enum(["ADVANCE", "EXPENSE"]).default("EXPENSE"),
    employeeId: z.string().min(1).optional(),
    title: z.string().trim().min(2).max(160).nullable().optional(),
    category: z
      .enum(["TRAVEL", "FUEL", "MEALS", "LODGING", "MOBILE_INTERNET", "OFFICE", "OTHER"])
      .nullable()
      .optional(),
    amount: z.coerce.number().positive().max(10_000_000),
    expenseDate: z.coerce.date().nullable().optional(),
    description: z.string().trim().min(5).max(3000).nullable().optional(),
    remark: z.string().trim().min(2).max(2000).nullable().optional(),
    receiptUrl: z.string().url().max(2000).nullable().optional(),
    receiptAccessConfirmed: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.claimType === "ADVANCE" && !value.remark) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["remark"],
        message: "Remark is required",
      });
    }
    if (value.claimType === "EXPENSE") {
      for (const field of ["title", "expenseDate", "description"] as const) {
        if (!value[field] && !(field === "title" && value.category)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required`,
          });
        }
      }
      if (!value.receiptUrl) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["receiptUrl"],
          message: "Google Drive attachment is required",
        });
      }
    }
    if (value.receiptUrl) {
      const host = new URL(value.receiptUrl).hostname.toLowerCase();
      if (host !== "drive.google.com" && host !== "docs.google.com") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["receiptUrl"],
          message: "Attachment must be a Google Drive link",
        });
      }
      if (!value.receiptAccessConfirmed) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["receiptAccessConfirmed"],
          message: "Confirm that anyone with the link can view the attachment",
        });
      }
    }
  });

export const expenseClaimReviewSchema = z.object({
  status: z.enum(["UNPAID", "REJECTED", "PAID"]),
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
  locationAccuracy: z.number().min(0).max(10_000),
  address: z.string().max(500).optional(),
  mobileDeviceId: z.string().min(3).max(200),
  remarks: z.string().max(1000).optional(),
  eventTime: z.coerce.date().optional(),
  confirmLeaveCancellation: z.boolean().optional(),
  faceVerification: z
    .object({
      sessionId: z.string().min(10).max(191),
      nonce: z.string().min(32).max(200),
      descriptor: z.array(z.number().finite().min(-10).max(10)).min(128).max(2048),
      descriptorSamples: z
        .array(z.array(z.number().finite().min(-10).max(10)).min(128).max(2048))
        .min(3)
        .max(5)
        .optional(),
      imageData: z
        .string()
        .max(950_000)
        .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
      faceConfidence: z.number().min(0).max(1),
      livenessScore: z.number().min(0).max(1),
      antiSpoofScore: z.number().min(0).max(1),
      challengeCompleted: z.literal(true),
    })
    .optional(),
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
