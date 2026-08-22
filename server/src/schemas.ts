import {
  AttendanceMode,
  BankAccountType,
  CompanyEntity,
  EmployeeStatus,
  EmploymentType,
  EventType,
  Gender,
  MaritalStatus,
  Role,
  ShiftType,
  TaskPriority,
  TaskBoardAccessType,
  TaskIssueType,
  TaskProjectRole,
  TaskStatus,
  TaskStatusCategory,
  UserStatus,
  WeeklyOffPolicy,
  WorkType,
} from "@prisma/client";
import { z } from "zod";

/** Treat blank strings as null so HTML date/url inputs do not fail coerce/url checks. */
function emptyToNull(value: unknown) {
  if (value === "" || value === undefined) return null;
  return value;
}

const optionalNullableDate = z.preprocess(emptyToNull, z.coerce.date().nullable());
const optionalNullableUrl = z.preprocess(
  emptyToNull,
  z.union([z.string().trim().url().max(2000), z.null()]),
);

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

function validateEmploymentDates(
  value: { dateOfBirth?: Date | null; joiningDate?: Date | null },
  context: z.RefinementCtx,
) {
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  if (value.dateOfBirth && value.dateOfBirth > today) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dateOfBirth"],
      message: "Date of birth cannot be in the future",
    });
  }
  if (
    value.dateOfBirth &&
    value.joiningDate &&
    value.joiningDate.getTime() <= value.dateOfBirth.getTime()
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["joiningDate"],
      message: "Joining date must be after date of birth",
    });
  }
}

export const loginSchema = z.object({
  /** Work email or mobile number — field name kept for older clients. */
  email: z.string().trim().min(3).max(255),
  password: z.string().min(1).max(200),
  /** Employee portal = email; Driver portal = mobile. Optional for older clients. */
  portal: z.enum(["employee", "driver"]).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(255),
});

const optionalNullableString = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

const employeeIdentityFields = {
  personalEmail: z.preprocess(emptyToNull, z.string().email().max(255).nullable().optional()),
  maritalStatus: z.nativeEnum(MaritalStatus).nullable().optional(),
  fatherName: optionalNullableString(120),
  husbandName: optionalNullableString(120),
  presentDoorNo: optionalNullableString(80),
  presentFlatName: optionalNullableString(120),
  presentStreetName: optionalNullableString(200),
  presentCity: optionalNullableString(80),
  presentState: optionalNullableString(80),
  presentPincode: optionalNullableString(12),
  permanentSameAsPresent: z.boolean().optional(),
  permanentDoorNo: optionalNullableString(80),
  permanentFlatName: optionalNullableString(120),
  permanentStreetName: optionalNullableString(200),
  permanentCity: optionalNullableString(80),
  permanentState: optionalNullableString(80),
  permanentPincode: optionalNullableString(12),
};

export const createUserSchema = z
  .object({
    name: z.string().min(2).max(120),
    email: z.union([z.string().email().max(255), z.literal("")]).optional(),
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
    employeeCode: z.string().trim().min(1).max(40).optional(),
    departmentId: z.string().nullable().optional(),
    designation: z.string().max(120).nullable().optional(),
    homeBranchId: z.string().nullable().optional(),
    managerId: z.string().nullable().optional(),
    attendanceMode: z.nativeEnum(AttendanceMode).optional(),
    attendanceRequired: z.boolean().optional(),
    isFieldEmployee: z.boolean().optional(),
    weeklyOffPolicy: z.nativeEnum(WeeklyOffPolicy).optional(),
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
    ...employeeIdentityFields,
  })
  .superRefine((value, context) => {
    validateEmploymentDates(value, context);
    const email = value.email?.trim() ?? "";
    const phone = value.phone?.trim() ?? "";
    if (!email && !phone) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email or mobile number is required",
        path: ["email"],
      });
    }
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
  /** When false, this person skips attendance and leave (menu, punch, apply leave). */
  attendanceRequired: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().max(200).optional(),
  nextPassword: z
    .string()
    .min(10)
    .max(200)
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

/** Set or clear the temporary company support password (Developer Admin only). */
export const supportPasswordSchema = z.object({
  password: z
    .union([
      z
        .string()
        .min(10)
        .max(200)
        .regex(/[A-Z]/, "Password must contain an uppercase letter")
        .regex(/[0-9]/, "Password must contain a number"),
      z.literal(""),
      z.null(),
    ])
    .optional(),
  /** Hours until the support password expires (1–24). Required when setting. */
  ttlHours: z.number().int().min(1).max(24).optional(),
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
    employeeCode: z.string().trim().min(1).max(40).optional(),
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
    attendanceRequired: z.boolean().optional(),
    isFieldEmployee: z.boolean().optional(),
    weeklyOffPolicy: z.nativeEnum(WeeklyOffPolicy).optional(),
    status: z.nativeEnum(EmployeeStatus).optional(),
    shiftType: z.nativeEnum(ShiftType).optional(),
    shiftStartMinutes: z.number().int().min(0).max(1439).optional(),
    shiftEndMinutes: z.number().int().min(0).max(1439).optional(),
    ...employeeIdentityFields,
  })
  .superRefine(validateEmploymentDates)
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const emergencyContactSchema = z.object({
  contactName: z.string().trim().min(2).max(120),
  relationship: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(30),
  alternatePhone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  bloodGroup: bloodGroupSchema.nullable().optional(),
  medicalNotes: z.string().trim().max(1000).nullable().optional(),
});

export const branchSchema = z.object({
  name: z.string().min(2).max(160),
  code: z.string().min(1).max(40),
  address: z.string().min(2).max(500).optional(),
  addressLine1: z.string().trim().min(2).max(191).optional(),
  addressLine2: z.string().trim().max(191).nullable().optional(),
  locality: z.string().trim().max(120).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  state: z.string().trim().max(40).optional(),
  postalCode: z.string().trim().max(12).optional(),
  country: z.string().trim().max(80).optional(),
  locationType: z
    .enum(["OFFICE", "BRANCH", "PARKING_HUB", "DEPOT", "WAREHOUSE", "OTHER"])
    .optional(),
  status: z.string().max(40).optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  attendanceRadiusMeters: z.coerce.number().int().min(25).max(5000).optional(),
  timezone: z.string().trim().max(64).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
  isHub: z.boolean().optional(),
});

export const branchUpdateSchema = branchSchema.partial();

export const baseOfficeTransferSchema = z.object({
  toLocationId: z.string().min(1),
  effectiveFrom: z.coerce.date().optional(),
  reason: z.string().trim().max(2000).nullable().optional(),
});

export const departmentSchema = z.object({
  name: z.string().min(2).max(160),
  unitCode: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[A-Z0-9_]+$/, "unitCode must be uppercase letters, numbers, and underscores")
    .optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  active: z.boolean().optional(),
  /** @deprecated Prefer headEmployeeIds — kept for older clients. */
  headEmployeeId: z.string().nullable().optional(),
  headEmployeeIds: z.array(z.string().min(1)).max(40).optional(),
  viewerEmployeeIds: z.array(z.string().min(1)).max(40).optional(),
  parentDepartmentId: z.string().nullable().optional(),
  unitType: z.enum(["TEAM", "SUBTEAM", "FUNCTION"]).optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
  faceVerificationEnabled: z.boolean().optional(),
});

export const organizationTransferSchema = z.object({
  employeeId: z.string().min(1),
  newOrganizationUnitId: z.string().min(1),
  newOrganizationLevel: z.enum(["HEAD", "SENIOR", "JUNIOR", "MEMBER"]).optional(),
  effectiveDate: z.coerce.date(),
  reason: z.string().trim().max(500).optional(),
});

export const organizationHeadAssignSchema = z.object({
  employeeId: z.string().min(1),
  isPrimary: z.boolean().optional(),
  effectiveFrom: z.coerce.date().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const organizationEndAssignmentSchema = z.object({
  effectiveTo: z.coerce.date(),
  reason: z.string().trim().max(500).optional(),
});

export const organizationViewerAssignSchema = z.object({
  employeeId: z.string().min(1),
  effectiveFrom: z.coerce.date().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const departmentUpdateSchema = departmentSchema.partial();

export const departmentReorderSchema = z.object({
  parentDepartmentId: z.string().nullable(),
  orderedIds: z.array(z.string().min(1)).min(1).max(200),
});

export const taskSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(5000).nullable().optional(),
    assigneeEmployeeIds: z.array(z.string().min(1)).min(1).max(100),
    parentTaskId: z.string().nullable().optional(),
    boardId: z.string().nullable().optional(),
    stageId: z.string().nullable().optional(),
    issueType: z.nativeEnum(TaskIssueType).optional(),
    reporterUserId: z.string().min(1).optional(),
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
  issueType: z.nativeEnum(TaskIssueType).optional(),
  reporterUserId: z.string().min(1).nullable().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  stageId: z.string().nullable().optional(),
  boardId: z.string().nullable().optional(),
  rank: z.number().finite().optional(),
  rankBeforeTaskId: z.string().min(1).optional(),
  rankAfterTaskId: z.string().min(1).optional(),
  customFields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  parentTaskId: z.string().nullable().optional(),
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
    allowedDepartmentIds: string[];
    memberEmployeeIds: string[];
    stages: Array<z.infer<typeof taskBoardStageSchema>>;
  },
  context: z.RefinementCtx,
) {
  if (value.stages.filter((stage) => stage.status === TaskStatus.COMPLETED).length < 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stages"],
      message: "Select at least one completed stage",
    });
  }
  if (value.stages.filter((stage) => stage.status === TaskStatus.TODO).length < 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stages"],
      message: "Keep at least one to-do stage",
    });
  }
  if (value.stages.some((stage) => stage.status === TaskStatus.CANCELLED)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stages"],
      message: "Cancelled is not a valid board stage status",
    });
  }
  if (value.stages[0] && value.stages[0].status !== TaskStatus.TODO) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stages", 0, "status"],
      message: "The first stage must be the starting To do stage",
    });
  }
  if (new Set(value.stages.map((stage) => stage.name.toLowerCase())).size !== value.stages.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stages"],
      message: "Stage names must be unique",
    });
  }
  if (
    value.accessType === TaskBoardAccessType.DEPARTMENT_GATED &&
    value.allowedDepartmentIds.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["allowedDepartmentIds"],
      message: "Select at least one organization unit",
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

const customFieldDefSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/i, "Use a short key like project_code"),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "number", "select"]),
});

const taskBoardMemberRoleSchema = z.object({
  employeeId: z.string().min(1),
  role: z.nativeEnum(TaskProjectRole),
});

const taskBoardConfigurationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  keyPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,7}$/, "Project key must be 2–8 letters/numbers")
    .optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  leadEmployeeId: z.string().min(1).nullable().optional(),
  accessType: z.nativeEnum(TaskBoardAccessType).default(TaskBoardAccessType.OPEN),
  allowedDepartmentIds: z.array(z.string().min(1)).max(200).default([]),
  memberEmployeeIds: z.array(z.string().min(1)).max(500).default([]),
  /** Optional role map for MEMBER_GATED members; omitted roles default to MEMBER / previous. */
  members: z.array(taskBoardMemberRoleSchema).max(500).optional(),
  stages: z.array(taskBoardStageSchema).min(2).max(12),
  customFieldDefs: z.array(customFieldDefSchema).max(20).optional(),
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

export const taskTransitionSchema = z.object({
  version: z.coerce.number().int().positive(),
  transitionId: z.string().min(1),
  comment: z.string().trim().max(5000).optional(),
  rankBeforeTaskId: z.string().min(1).optional(),
  rankAfterTaskId: z.string().min(1).optional(),
  fieldValues: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

const projectRoleSchema = z.nativeEnum(TaskProjectRole);

export const workflowStatusCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.nativeEnum(TaskStatusCategory),
  color: z.enum(["SLATE", "BLUE", "AMBER", "VIOLET", "EMERALD", "RED"]).optional(),
  sortOrder: z.coerce.number().int().min(0).max(200).optional(),
  isInitial: z.boolean().optional(),
  isTerminal: z.boolean().optional(),
  stageId: z.string().min(1).nullable().optional(),
});

export const workflowStatusUpdateSchema = workflowStatusCreateSchema.partial().extend({
  active: z.boolean().optional(),
});

export const workflowTransitionCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    fromStatusId: z.string().min(1),
    toStatusId: z.string().min(1),
    allowedProjectRoles: z.array(projectRoleSchema).max(8).optional(),
    requiredFields: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    commentRequired: z.boolean().optional(),
    resolutionRequired: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.fromStatusId === value.toStatusId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toStatusId"],
        message: "A transition cannot start and end on the same status",
      });
    }
  });

export const workflowTransitionUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    fromStatusId: z.string().min(1).optional(),
    toStatusId: z.string().min(1).optional(),
    allowedProjectRoles: z.array(projectRoleSchema).max(8).nullable().optional(),
    requiredFields: z.array(z.string().trim().min(1).max(40)).max(20).nullable().optional(),
    commentRequired: z.boolean().optional(),
    resolutionRequired: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.fromStatusId && value.toStatusId && value.fromStatusId === value.toStatusId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toStatusId"],
        message: "A transition cannot start and end on the same status",
      });
    }
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
  description: z.string().trim().max(1000).optional(),
  type: z.enum(["Public", "Optional", "Restricted"]),
  status: z.string().max(40).optional(),
});

export const holidayUpdateSchema = holidaySchema.partial();

export const shiftDefinitionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, "Use uppercase letters, numbers, and underscores"),
  shiftType: z.nativeEnum(ShiftType).default(ShiftType.DAY),
  startMinutes: z.coerce.number().int().min(0).max(1439),
  endMinutes: z.coerce.number().int().min(0).max(1439),
  active: z.boolean().optional(),
});

const shiftSegmentSchema = z.object({
  sequence: z.coerce.number().int().min(1).max(20).optional(),
  startMinute: z.coerce.number().int().min(0).max(1439),
  endMinute: z.coerce.number().int().min(0).max(1439),
  endDayOffset: z.union([z.literal(0), z.literal(1), z.coerce.number().pipe(z.union([z.literal(0), z.literal(1)]))]),
});

export const shiftTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, "Use uppercase letters, numbers, and underscores"),
  description: z.string().trim().max(2000).nullable().optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
  graceInMinutes: z.coerce.number().int().min(0).max(240).optional(),
  graceOutMinutes: z.coerce.number().int().min(0).max(240).optional(),
  colorToken: z.string().trim().max(40).nullable().optional(),
  active: z.boolean().optional(),
  segments: z.array(shiftSegmentSchema).min(1).max(20),
});

export const shiftTemplateUpdateSchema = shiftTemplateSchema
  .omit({ code: true })
  .partial()
  .extend({
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Z0-9_]+$/)
      .optional(),
    segments: z.array(shiftSegmentSchema).min(1).max(20).optional(),
  });

export const defaultShiftAssignSchema = z.object({
  shiftId: z.string().min(1),
  effectiveFrom: z.coerce.date(),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const rosterAssignSchema = z.object({
  employeeId: z.string().min(1),
  workDate: z.coerce.date(),
  /** null = explicit NO_SHIFT */
  shiftId: z.string().min(1).nullable(),
  source: z.enum(["MANUAL", "BULK", "IMPORT"]).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const dayOverrideSchema = z.object({
  employeeId: z.string().min(1),
  workDate: z.coerce.date(),
  /** null = explicit NO_SHIFT */
  shiftId: z.string().min(1).nullable(),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const dayOverrideDeleteSchema = z.object({
  employeeId: z.string().min(1),
  workDate: z.coerce.date(),
});

export const shiftTemplateDuplicateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, "Use uppercase letters, numbers, and underscores"),
  description: z.string().trim().max(2000).nullable().optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
  graceInMinutes: z.coerce.number().int().min(0).max(240).optional(),
  graceOutMinutes: z.coerce.number().int().min(0).max(240).optional(),
  segments: z
    .array(
      z.object({
        sequence: z.coerce.number().int().min(1).max(20).optional(),
        startMinute: z.coerce.number().int().min(0).max(1439),
        endMinute: z.coerce.number().int().min(0).max(1439),
        endDayOffset: z.union([
          z.literal(0),
          z.literal(1),
          z.coerce.number().pipe(z.union([z.literal(0), z.literal(1)])),
        ]),
      }),
    )
    .min(1)
    .max(20)
    .optional(),
});

export const employeeShiftAssignmentSchema = z.object({
  shiftId: z.string().min(1),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable().optional(),
});

export const companyAssetBaseSchema = z.object({
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
  visibleToEmployee: z.boolean().optional(),
  branchId: z.string().min(1).nullable().optional(),
  location: z.string().max(160).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  laptopName: z.string().trim().min(1).max(160).nullable().optional(),
  deviceId: z.string().trim().min(1).max(160).nullable().optional(),
  productId: z.string().trim().min(1).max(160).nullable().optional(),
  processor: z.string().trim().min(1).max(160).nullable().optional(),
  ram: z.string().trim().min(1).max(80).nullable().optional(),
  ssd: z.string().trim().min(1).max(80).nullable().optional(),
  windowsVersion: z.string().trim().min(1).max(120).nullable().optional(),
  macAddress: z.string().trim().min(1).max(80).nullable().optional(),
  userPassword: z.string().max(200).nullable().optional(),
  adminPassword: z.string().max(200).nullable().optional(),
  warrantyUntil: z.coerce.date().nullable().optional(),
});

function refineLaptopAssetFields(
  value: z.infer<typeof companyAssetBaseSchema>,
  context: z.RefinementCtx,
  options?: { requirePasswords?: boolean },
) {
  if (!/\blaptops?\b/i.test((value.name ?? "").trim())) return;
  const required: Array<keyof typeof value> = [
    "laptopName",
    "deviceId",
    "productId",
    "processor",
    "ram",
    "ssd",
    "windowsVersion",
    "macAddress",
    "purchaseDate",
  ];
  if (options?.requirePasswords !== false) {
    required.push("userPassword", "adminPassword");
  }
  for (const field of required) {
    const raw = value[field];
    if (raw === undefined || raw === null || (typeof raw === "string" && !String(raw).trim())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: "Required for laptop assets",
      });
    }
  }
}

export const companyAssetSchema = companyAssetBaseSchema.superRefine((value, context) =>
  refineLaptopAssetFields(value, context, { requirePasswords: true }),
);

export const companyAssetUpdateSchema = companyAssetBaseSchema.partial();

export const assetAssignSchema = z.object({
  employeeId: z.string().min(1),
  visibleToEmployee: z.boolean().default(true),
});

export const assetAssignManySchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1).max(500),
  visibleToEmployee: z.boolean().default(true),
});

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
    claimType: z.enum(["ADVANCE", "EXPENSE", "FIELD"]).default("EXPENSE"),
    employeeId: z.string().min(1).optional(),
    title: z.string().trim().min(2).max(160).nullable().optional(),
    category: z
      .enum(["MEALS", "LODGING", "MOBILE_INTERNET", "OFFICE", "OTHER"])
      .nullable()
      .optional(),
    amount: z.coerce.number().positive().max(10_000_000),
    expenseDate: optionalNullableDate.optional(),
    description: z.string().trim().min(5).max(3000).nullable().optional(),
    remark: z.string().trim().min(2).max(2000).nullable().optional(),
    claimMeta: z
      .object({
        fromLocation: z.string().max(200).optional(),
        toLocation: z.string().max(200).optional(),
      })
      .nullable()
      .optional(),
    receiptUrl: z.preprocess(emptyToNull, z.string().trim().min(1).max(2000).nullable()).optional(),
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
    if (value.claimType === "EXPENSE" || value.claimType === "FIELD") {
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
          message: "Receipt attachment is required",
        });
      }
    }
    if (value.receiptUrl) {
      const privateReceipt = value.receiptUrl.startsWith("/expense-claims/receipts/");
      if (!privateReceipt) {
        try {
          const host = new URL(value.receiptUrl).hostname.toLowerCase();
          if (host !== "drive.google.com" && host !== "docs.google.com") {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["receiptUrl"],
              message: "Use a private upload or a Google Drive link",
            });
          } else if (!value.receiptAccessConfirmed) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["receiptAccessConfirmed"],
              message: "Confirm that anyone with the link can view the attachment",
            });
          }
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["receiptUrl"],
            message: "Invalid receipt URL",
          });
        }
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
  employeeId: z.string().min(1).optional(),
  purpose: z
    .string()
    .trim()
    .min(5, "Purpose must be at least 5 characters")
    .max(3000, "Purpose is too long"),
  deliveryMode: z.enum(["DIGITAL", "PRINTED"]).default("DIGITAL"),
  requiredBy: optionalNullableDate.optional(),
});

export const certificateRequestReviewSchema = z.object({
  status: z.enum(["IN_PROGRESS", "READY", "REJECTED", "COLLECTED"]),
  hrNotes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()).optional(),
  documentUrl: optionalNullableUrl.optional(),
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
  punchTicket: z.string().min(20).max(800).optional(),
  captureNonce: z.string().min(16).max(80).optional(),
  /** Additive idempotency key; Android 1.0.15 may omit. */
  clientEventId: z.string().min(8).max(120).optional(),
  deferred: z.boolean().optional(),
  confirmLeaveCancellation: z.boolean().optional(),
  faceVerification: z
    .object({
      sessionId: z.string().min(10).max(191),
      nonce: z.string().min(32).max(200),
      descriptor: z.array(z.number().finite().min(-10).max(10)).min(128).max(2048),
      descriptorSamples: z
        .array(z.array(z.number().finite().min(-10).max(10)).min(128).max(2048))
        .min(2)
        .max(9)
        .optional(),
      // The frame is analysed server-side to derive the descriptor and the
      // liveness and anti-spoof scores; it is not stored for attendance.
      imageData: z
        .string()
        .max(950_000)
        .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
        .optional(),
      faceConfidence: z.number().min(0).max(1),
      livenessScore: z.number().min(0).max(1),
      antiSpoofScore: z.number().min(0).max(1),
      challengeCompleted: z.boolean(),
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
  session: z.enum(["FULL", "FIRST_HALF", "SECOND_HALF"]).optional(),
  reason: z.string().trim().min(3).max(1000),
  medicalDocumentUrl: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .refine(
      (value) => !value || value.startsWith("/leave/medical-files/"),
      "Medical documents must be uploaded through the secure private vault",
    ),
});

export const splitLeaveRequestSchema = z.object({
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  session: z.enum(["FULL", "FIRST_HALF", "SECOND_HALF"]).optional(),
  reason: z.string().trim().min(3).max(1000),
  medicalDocumentUrl: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .refine(
      (value) => !value || value.startsWith("/leave/medical-files/"),
      "Medical documents must be uploaded through the secure private vault",
    ),
  allocations: z
    .array(
      z.object({
        leaveTypeId: z.string(),
        days: z.number().min(0).max(365),
      }),
    )
    .min(1)
    .max(10),
});

export const medicalDocumentSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine(
      (value) => value.startsWith("/leave/medical-files/"),
      "Medical documents must be uploaded through the secure private vault",
    ),
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
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Code must be uppercase letters, numbers, or underscores")
    .optional(),
  active: z.boolean().optional(),
  description: z.string().max(2000).nullable().optional(),
  annualAllowance: z.number().finite().nonnegative().nullable().optional(),
  monthlyCredit: z.number().finite().nonnegative().nullable().optional(),
  maxPerMonth: z.number().finite().nonnegative().nullable().optional(),
  carryForward: z.boolean().optional(),
  maxCarryForward: z.number().finite().nonnegative().nullable().optional(),
  maxBalance: z.number().finite().nonnegative().nullable().optional(),
  negativeBalanceAllowed: z.boolean().optional(),
  halfDayAllowed: z.boolean().optional(),
  minNoticeDays: z.number().int().min(0).max(365).nullable().optional(),
  backdatedAllowed: z.boolean().optional(),
  requiresMedicalDocument: z.boolean().optional(),
  approvalRequired: z.boolean().optional(),
  colorToken: z.string().max(40).nullable().optional(),
});

export const leaveTypeUpdateSchema = leaveTypeSchema.partial();

export const leavePreviewDaysSchema = z.object({
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  session: z.enum(["FULL", "FIRST_HALF", "SECOND_HALF"]).optional(),
});

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
  workdayId: z.string().optional(),
  sessionId: z.string().optional(),
  correctionType: z
    .enum([
      "MISSING_CHECK_IN",
      "MISSING_CHECK_OUT",
      "INCORRECT_CHECK_IN",
      "INCORRECT_CHECK_OUT",
    ])
    .optional(),
});

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(10)
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

/** Web Push (PWA) or native FCM/APNs device token registration. */
export const pushSubscriptionBodySchema = z.union([
  z.object({
    channel: z.enum(["fcm", "apns"]),
    token: z.string().min(8).max(4096),
  }),
  z.object({
    channel: z.literal("web").optional(),
    endpoint: z.string().url().max(5000),
    keys: z.object({
      p256dh: z.string().min(1).max(5000),
      auth: z.string().min(1).max(5000),
    }),
  }),
]);

export const pushUnsubscribeSchema = z.union([
  z.object({ endpoint: z.string().url().max(5000) }),
  z.object({ channel: z.enum(["fcm", "apns"]), token: z.string().min(8).max(4096) }),
]);

export const profileVerificationSchema = z.object({
  fields: z
    .array(
      z.object({
        field: z.string().min(1).max(60),
        section: z.enum(["identity", "employment", "banking", "statutory", "emergency"]),
        status: z.enum(["CORRECT", "WRONG"]),
        currentValue: z.string().max(2000).optional(),
        suggestedValue: z.string().max(2000).optional(),
      }),
    )
    .min(1),
  emergencyContact: emergencyContactSchema.optional(),
});

export const profileCorrectionReviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
});
