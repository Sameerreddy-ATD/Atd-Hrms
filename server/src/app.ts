import { z } from "zod";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { createHash, randomUUID } from "node:crypto";
import { freemem, loadavg, totalmem } from "node:os";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import {
  EventSource,
  EventType,
  FaceEnrollmentStatus,
  FaceVerificationPurpose,
  Prisma,
  Role,
  TaskActivityType,
  TaskBoardAccessType,
  TaskPriority,
  TaskStatus,
  UserStatus,
  WorkType,
} from "@prisma/client";
import { parse } from "csv-parse/sync";
import { audit } from "./audit.js";
import { resolveAssetStatus } from "./assetRules.js";
import { birthdayMessage } from "./birthdayMessages.js";
import { isUpcomingBirthday } from "./birthdays.js";
import {
  cancelApprovedLeaveForDay,
  cancelLeaveDates,
  eachDateInRange,
  ensureDailySummariesForRange,
  findApprovedLeaveForDay,
  recalculateLeaveDateRange,
  startOfDayUtc,
  todayIstDate,
} from "./attendanceDayRules.js";
import {
  attendanceDateForEmployee,
  attendancePunchEventTypes,
  attendanceTransitionIssue,
  createAttendanceEvent,
  recalculateDailySummary,
} from "./attendanceEngine.js";
import { settleExpiredOpenPunches } from "./attendanceSettlement.js";
import { openAttendanceStream } from "./attendanceLive.js";
import { config } from "./config.js";
import { encryptEmployeeField, lastFour } from "./employeePrivateData.js";
import { asyncHandler, errorHandler, HttpError } from "./errors.js";
import { nearestBranch } from "./geofence.js";
import {
  FACE_CONSENT,
  createFaceVerificationSession,
  faceCaptureSchema,
  faceSessionSchema,
  invalidateFaceStatusCache,
  readDecryptedEvidence,
  readFaceSettings,
  removeFaceEvidenceFiles,
  saveFaceSettings,
  submitFaceEnrollment,
  userHasApprovedFace,
  verifyFaceCapture,
} from "./faceAttendance.js";
import { registerIntegrationRoutes } from "./integration-api.js";
import {
  assetCatalogItemDto,
  attendanceRecordDto,
  biometricMappingDto,
  branchDto,
  companyAssetDto,
  deviceDto,
  employeeDto,
  eventDto,
  holidayDto,
  userDto,
} from "./mapper.js";
import { prisma } from "./prisma.js";
import { getModuleAccessMatrix, MODULE_KEYS, saveModuleAccessMatrix } from "./module-access.js";
import { reportingHierarchyCycle } from "./organizationRules.js";
import { isWebPushConfigured, sendPushToAll } from "./push.js";
import { openNotificationStream, publishNotificationChange } from "./notificationLive.js";
import {
  assertEmployeeAccess,
  canCreateRole,
  getOrganizationTeamEmployeeIds,
  requireAuth,
  requireRoles,
} from "./rbac.js";
import {
  clearCookies,
  hashPassword,
  issueCookies,
  verifyPassword,
  verifyRefreshToken,
} from "./security.js";
import {
  announcementSchema,
  announcementUpdateSchema,
  assetCatalogItemSchema,
  assetCatalogItemUpdateSchema,
  assetReturnSchema,
  biometricMappingSchema,
  biometricMappingUpdateSchema,
  biometricDeviceSchema,
  biometricDeviceUpdateSchema,
  branchSchema,
  branchUpdateSchema,
  changePasswordSchema,
  clientEventSchema,
  companyAssetSchema,
  companyAssetUpdateSchema,
  certificateRequestReviewSchema,
  certificateRequestSchema,
  correctionSchema,
  createUserSchema,
  expenseClaimReviewSchema,
  expenseClaimSchema,
  departmentSchema,
  departmentUpdateSchema,
  holidaySchema,
  holidayUpdateSchema,
  leaveRequestSchema,
  leaveBalanceAdjustmentSchema,
  leaveTypeSchema,
  leaveTypeUpdateSchema,
  medicalDocumentSchema,
  loginSchema,
  mobileEventSchema,
  profileEditSchema,
  pushSubscriptionSchema,
  resetPasswordSchema,
  resetTestDataSchema,
  taskBoardArchiveSchema,
  taskLogSchema,
  taskBoardSchema,
  taskBoardUpdateSchema,
  taskSchema,
  taskUpdateSchema,
  thumbEventSchema,
  updateEmployeeSchema,
  updateUserSchema,
  weeklyOffRequestSchema,
} from "./schemas.js";
import {
  consumeCompOffCredits,
  leavePolicyDescription,
  LEAVE_CODES,
  medicalDocumentDueAt,
  releaseCompOffCredits,
  syncEmployeeLeaveBalances,
  validateLeaveApplication,
} from "./leavePolicy.js";

function announcementDto(
  announcement: Prisma.AnnouncementGetPayload<{ include: { createdBy: true } }>,
) {
  return {
    id: announcement.announcementId,
    title: announcement.title,
    message: announcement.message,
    priority: announcement.priority,
    publishAt: announcement.publishAt.toISOString(),
    expiresAt: announcement.expiresAt?.toISOString(),
    isActive: announcement.isActive,
    authorName: announcement.createdBy.name,
    createdAt: announcement.createdAt.toISOString(),
    updatedAt: announcement.updatedAt.toISOString(),
  };
}

export function createApp() {
  const backendStartedAt = new Date();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(helmet());
  app.use(compression());
  app.use((req, res, next) => {
    req.setTimeout(config.requestTimeoutMs);
    res.setTimeout(config.requestTimeoutMs);
    next();
  });
  app.use(
    rateLimit({
      windowMs: config.generalRateLimitWindowMs,
      limit: config.generalRateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many requests. Please try again shortly." },
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.text({ type: "text/csv", limit: "5mb" }));
  app.use(cookieParser());
  app.use(cors({ origin: config.frontendOrigin, credentials: true }));
  app.use((req, res, next) => {
    const stateChangingMethods = ["POST", "PUT", "DELETE", "PATCH"];
    const usesIntegrationAuthentication =
      req.path.startsWith("/api/v1/") &&
      (req.headers.authorization?.startsWith("Bearer atd_live_") ||
        typeof req.headers["x-api-key"] === "string");
    if (stateChangingMethods.includes(req.method) && !usesIntegrationAuthentication) {
      const allowedOrigin = config.frontendOrigin;
      if (allowedOrigin && allowedOrigin !== "*") {
        try {
          let allowedHost = "";
          try {
            allowedHost = new URL(allowedOrigin).host;
          } catch {
            allowedHost = allowedOrigin.replace(/^https?:\/\//, "").split("/")[0];
          }
          const origin = req.headers.origin;
          const referer = req.headers.referer;

          if (origin) {
            const originHost = new URL(origin).host;
            if (originHost !== allowedHost) {
              return next(new HttpError(403, "CSRF validation failed: Origin mismatch"));
            }
          } else if (referer) {
            const refererHost = new URL(referer).host;
            if (refererHost !== allowedHost) {
              return next(new HttpError(403, "CSRF validation failed: Referer mismatch"));
            }
          } else if (config.isProduction) {
            return next(
              new HttpError(403, "CSRF validation failed: Missing Origin and Referer headers"),
            );
          }
        } catch (err) {
          return next(
            new HttpError(400, "CSRF validation failed: Invalid Origin/Referer header format"),
          );
        }
      }
    }
    next();
  });
  app.use(
    morgan(config.isProduction ? "combined" : "dev", {
      skip: (req) => req.path.startsWith("/health"),
    }),
  );

  const authLimiter = rateLimit({
    windowMs: config.authRateLimitWindowMs,
    limit: config.authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Please wait and try again." },
  });

  function listLimit(req: express.Request, fallback = 500, max = 1000) {
    const requested = Number(req.query.limit);
    if (!Number.isFinite(requested) || requested <= 0) return fallback;
    return Math.min(Math.floor(requested), max);
  }

  function listOffset(req: express.Request) {
    const requested = Number(req.query.offset);
    return Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 0;
  }

  function dateFromQuery(value: unknown) {
    if (!value || Array.isArray(value)) return undefined;
    return new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  }

  function employeeAttendanceVisibilityFilter(
    extra: Prisma.EmployeeWhereInput = {},
  ): Prisma.EmployeeWhereInput {
    const hasExtra = Object.keys(extra).length > 0;
    const attendanceEligible: Prisma.EmployeeWhereInput = {
      attendanceRequired: true,
      OR: [{ user: null }, { user: { role: { not: Role.DEVELOPER_ADMIN } } }],
    };
    return hasExtra ? { AND: [extra, attendanceEligible] } : attendanceEligible;
  }

  function attendanceWhereFromQuery(req: express.Request): Prisma.AttendanceDailySummaryWhereInput {
    const from = dateFromQuery(req.query.from ?? req.query.dateFrom);
    const to = dateFromQuery(req.query.to ?? req.query.dateTo);
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
    const departmentId =
      typeof req.query.departmentId === "string" ? req.query.departmentId : undefined;
    const source = typeof req.query.source === "string" ? req.query.source : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const where: Prisma.AttendanceDailySummaryWhereInput = {};
    const employeeFilter: Prisma.EmployeeWhereInput = {};
    if (employeeId) where.employeeId = employeeId;
    if (from || to) where.date = { gte: from, lte: to };
    if (branchId) {
      where.OR = [
        { homeBranchId: branchId },
        { scheduledBranchId: branchId },
        { primaryAttendedBranchId: branchId },
      ];
    }
    if (departmentId) employeeFilter.departmentId = departmentId;
    where.employee = employeeAttendanceVisibilityFilter(employeeFilter);
    if (source) where.attendanceSourceSummary = source;
    if (status) where.status = { contains: status };
    return where;
  }

  function attendanceEventWhereFromQuery(req: express.Request): Prisma.AttendanceEventWhereInput {
    const from = dateFromQuery(req.query.from ?? req.query.dateFrom);
    const to = dateFromQuery(req.query.to ?? req.query.dateTo);
    const where: Prisma.AttendanceEventWhereInput = {};
    if (from || to) where.eventDate = { gte: from, lte: to };
    if (typeof req.query.employeeId === "string") where.employeeId = req.query.employeeId;
    if (typeof req.query.branchId === "string") where.branchId = req.query.branchId;
    const employeeFilter: Prisma.EmployeeWhereInput = {};
    if (typeof req.query.departmentId === "string") {
      employeeFilter.departmentId = req.query.departmentId;
    }
    where.employee = employeeAttendanceVisibilityFilter(employeeFilter);
    if (typeof req.query.clientName === "string") {
      where.clientName = { contains: req.query.clientName };
    }
    if (typeof req.query.workType === "string") where.workType = req.query.workType as WorkType;
    return where;
  }

  async function assertValidManager(employeeId: string, managerId?: string | null) {
    if (!managerId) return;
    if (employeeId === managerId) throw new HttpError(400, "Employee cannot be their own manager");
    const [manager, hierarchy] = await Promise.all([
      prisma.employee.findUnique({
        where: { employeeId: managerId },
        include: { user: true },
      }),
      prisma.employee.findMany({ select: { employeeId: true, managerId: true } }),
    ]);
    if (!manager || manager.status !== "ACTIVE" || manager.user?.status !== "ACTIVE") {
      throw new HttpError(400, "Reporting manager must be active");
    }
    if (
      !manager.user ||
      (!([Role.CEO, Role.MANAGER, Role.HR, Role.MAIN_ADMIN] as Role[]).includes(
        manager.user.role,
      ) &&
        !["HEAD", "SENIOR"].includes(manager.organizationLevel))
    ) {
      throw new HttpError(
        400,
        "Reporting manager must be a CEO, Head, Senior, Manager, HR, or Admin",
      );
    }
    const cycle = reportingHierarchyCycle(hierarchy, employeeId, managerId);
    if (cycle === "WOULD_CREATE_CYCLE") {
      throw new HttpError(400, "This reporting manager would create a hierarchy cycle");
    }
    if (cycle === "EXISTING_CYCLE") {
      throw new HttpError(409, "The existing reporting hierarchy contains a cycle");
    }
  }

  async function assertValidDepartmentHead(headEmployeeId?: string | null) {
    if (!headEmployeeId) return;
    const head = await prisma.employee.findUnique({
      where: { employeeId: headEmployeeId },
      include: { user: true },
    });
    if (!head || head.status !== "ACTIVE" || head.user?.status !== "ACTIVE") {
      throw new HttpError(400, "Department head must be an active employee");
    }
    if (!head.user || head.user.role === Role.DEVELOPER_ADMIN) {
      throw new HttpError(
        400,
        "Developer Admin is a system owner and cannot be an organizational head",
      );
    }
  }

  function departmentDto(department: {
    departmentId: string;
    name: string;
    headEmployeeId: string | null;
    parentDepartmentId: string | null;
    unitType: string;
    sortOrder: number;
    headEmployee?: { name: string } | null;
  }) {
    return {
      id: department.departmentId,
      name: department.name,
      headEmployeeId: department.headEmployeeId ?? undefined,
      head: department.headEmployee?.name ?? undefined,
      parentDepartmentId: department.parentDepartmentId ?? undefined,
      unitType: department.unitType,
      sortOrder: department.sortOrder,
    };
  }

  function leaveRequestDto(
    row: {
      leaveRequestId: string;
      employeeId: string;
      leaveTypeId: string;
      managerId?: string | null;
      employee?: { name: string; manager?: { name: string } | null } | null;
      leaveType?: { name: string } | null;
      fromDate: Date;
      toDate: Date;
      days: Prisma.Decimal | number;
      reason: string;
      status: string;
      createdAt: Date;
      updatedAt?: Date;
      cancelledDates?: unknown;
      medicalDocumentUrl?: string | null;
      medicalDocumentDueAt?: Date | null;
      medicalDocumentVerifiedAt?: Date | null;
    },
    approverName?: string,
  ) {
    const cancelledDates = Array.isArray(row.cancelledDates)
      ? row.cancelledDates.filter((date): date is string => typeof date === "string")
      : [];
    const employeeStatusMap: Record<string, string> = {
      PENDING: "Pending",
      MANAGER_APPROVED: "Approved",
      HR_VERIFIED: "Approved",
      APPROVED: "Approved",
      REJECTED: "Rejected",
      CANCELLED: "Cancelled",
    };
    const workflowStatusMap: Record<string, string> = {
      PENDING: "Submitted — awaiting organization head",
      MANAGER_APPROVED: "Approved by organization head",
      HR_VERIFIED: "HR verified",
      APPROVED: "Approved by organization head",
      REJECTED: "Rejected by organization head",
      CANCELLED: "Cancelled",
    };
    return {
      id: row.leaveRequestId,
      employeeId: row.employeeId,
      employeeName: row.employee?.name ?? row.employeeId,
      managerName: row.employee?.manager?.name,
      approverName,
      type: row.leaveType?.name ?? "-",
      from: row.fromDate.toISOString().slice(0, 10),
      to: row.toDate.toISOString().slice(0, 10),
      days: Number(row.days),
      reason: row.reason,
      status: employeeStatusMap[row.status] ?? row.status,
      workflowStatus:
        cancelledDates.length && row.status !== "CANCELLED"
          ? `${workflowStatusMap[row.status] ?? row.status} — ${cancelledDates.length} day${cancelledDates.length === 1 ? "" : "s"} cancelled`
          : (workflowStatusMap[row.status] ?? row.status),
      appliedOn: row.createdAt.toISOString().slice(0, 10),
      updatedOn: row.updatedAt?.toISOString().slice(0, 10),
      cancelledDates,
      cancelledDays: cancelledDates.length,
      medicalDocumentUrl: row.medicalDocumentUrl ?? undefined,
      medicalDocumentDueAt: row.medicalDocumentDueAt?.toISOString(),
      medicalDocumentVerifiedAt: row.medicalDocumentVerifiedAt?.toISOString(),
    };
  }

  async function leaveRequestDtos<T extends Parameters<typeof leaveRequestDto>[0]>(rows: T[]) {
    const approverIds = [...new Set(rows.map((row) => row.managerId).filter(Boolean))] as string[];
    const approvers = await prisma.employee.findMany({
      where: { employeeId: { in: approverIds } },
      select: { employeeId: true, name: true },
    });
    const names = new Map(approvers.map((approver) => [approver.employeeId, approver.name]));
    const balancePromises = new Map<string, ReturnType<typeof syncEmployeeLeaveBalances>>();
    return Promise.all(
      rows.map(async (row) => {
        const dto = leaveRequestDto(row, row.managerId ? names.get(row.managerId) : undefined);
        if (!balancePromises.has(row.employeeId)) {
          balancePromises.set(row.employeeId, syncEmployeeLeaveBalances(row.employeeId));
        }
        const balances = await balancePromises.get(row.employeeId)!;
        const balance = balances.find((item) => item.leaveTypeId === row.leaveTypeId);
        const availableBalance = Number(balance?.balance ?? 0);
        return {
          ...dto,
          availableBalance,
          requestedDays: Number(row.days),
          projectedBalance: availableBalance - Number(row.days),
        };
      }),
    );
  }

  async function findLeaveApprover(employeeId: string) {
    const [employee, units] = await Promise.all([
      prisma.employee.findUnique({ where: { employeeId }, select: { departmentId: true } }),
      prisma.department.findMany({
        select: { departmentId: true, parentDepartmentId: true, headEmployeeId: true },
      }),
    ]);
    if (!employee?.departmentId) return null;

    const byId = new Map(units.map((unit) => [unit.departmentId, unit]));
    let unit = byId.get(employee.departmentId);
    while (unit) {
      if (unit.headEmployeeId && unit.headEmployeeId !== employeeId) {
        const approver = await prisma.employee.findFirst({
          where: { employeeId: unit.headEmployeeId, status: "ACTIVE" },
          select: { employeeId: true, name: true },
        });
        if (approver) return approver;
      }
      unit = unit.parentDepartmentId ? byId.get(unit.parentDepartmentId) : undefined;
    }
    return prisma.employee.findFirst({
      where: { status: "ACTIVE", user: { role: Role.CEO } },
      select: { employeeId: true, name: true },
    });
  }

  async function assertOrganizationApproverForLeave(
    user: { employeeId?: string | null },
    leave: { managerId?: string | null; employeeId: string },
  ) {
    if (!user.employeeId) {
      throw new HttpError(
        403,
        "Only the responsible organization head can approve or reject leave.",
      );
    }
    if (leave.managerId !== user.employeeId) {
      throw new HttpError(
        403,
        "Only the responsible organization head can approve or reject leave.",
      );
    }
  }

  async function assertOrganizationApproverForCorrection(
    user: { employeeId?: string | null },
    request: { approverId?: string | null; employeeId: string },
  ) {
    const assignedApproverId =
      request.approverId ?? (await findLeaveApprover(request.employeeId))?.employeeId;
    if (!user.employeeId || assignedApproverId !== user.employeeId) {
      throw new HttpError(
        403,
        "Only the employee's responsible organization head can approve or reject this punch request.",
      );
    }
    return assignedApproverId;
  }

  function weeklyOffWeekStart(date: Date) {
    const day = startOfDayUtc(date);
    const weekday = day.getUTCDay();
    day.setUTCDate(day.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
    return day;
  }

  function weeklyOffRequestDto(row: {
    weeklyOffRequestId: string;
    employeeId: string;
    date: Date;
    status: string;
    reason: string | null;
    approverId: string;
    createdAt: Date;
    employee?: { name: string; employeeCode: string };
  }) {
    return {
      id: row.weeklyOffRequestId,
      employeeId: row.employeeId,
      employeeName: row.employee?.name,
      employeeCode: row.employee?.employeeCode,
      date: row.date.toISOString().slice(0, 10),
      status: row.status,
      reason: row.reason ?? undefined,
      approverId: row.approverId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async function assertWeeklyOffNotConsecutive(employeeId: string, date: Date, excludeId?: string) {
    const previous = new Date(date);
    previous.setUTCDate(previous.getUTCDate() - 1);
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    const adjacent = await prisma.weeklyOffRequest.findFirst({
      where: {
        employeeId,
        date: { in: [previous, next] },
        status: { in: ["PENDING", "APPROVED"] },
        ...(excludeId ? { weeklyOffRequestId: { not: excludeId } } : {}),
      },
    });
    if (adjacent) {
      throw new HttpError(400, "You cannot take weekly offs on two consecutive days");
    }
  }

  function leaveTypeDto(row: {
    leaveTypeId: string;
    name: string;
    code: string;
    paid: boolean;
    active: boolean;
    annualAllowance: Prisma.Decimal | null;
    monthlyCredit: Prisma.Decimal | null;
    maxPerMonth: Prisma.Decimal | null;
    carryForward: boolean;
    requiresMedicalDocument: boolean;
    approvalRequired: boolean;
  }) {
    return {
      id: row.leaveTypeId,
      name: row.name,
      code: row.code,
      paid: row.paid,
      active: row.active,
      annualAllowance: row.annualAllowance === null ? undefined : Number(row.annualAllowance),
      monthlyCredit: row.monthlyCredit === null ? undefined : Number(row.monthlyCredit),
      maxPerMonth: row.maxPerMonth === null ? undefined : Number(row.maxPerMonth),
      carryForward: row.carryForward,
      requiresMedicalDocument: row.requiresMedicalDocument,
      approvalRequired: row.approvalRequired,
      description: leavePolicyDescription(row.code),
    };
  }

  function safeAuditValue(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        /password|token|secret|hash/i.test(key) ? "[protected]" : nestedValue,
      ]),
    );
  }

  function nextEmployeeCode() {
    // Collision-resistant across parallel bulk imports and multiple backend instances.
    return `EMP-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  }

  const brandProofDefaults = {
    litresDelivered: "10M+",
    happyClients: "5,000+",
    appRating: "4.8 / 5",
    certification: "PESO & OMC",
  };
  const brandProofSettingKey = "startup_brand_proof";
  const brandProofSchema = z.object({
    litresDelivered: z.string().trim().min(1).max(30),
    happyClients: z.string().trim().min(1).max(30),
    appRating: z.string().trim().min(1).max(30),
    certification: z.string().trim().min(1).max(50),
  });

  async function readBrandProof() {
    const setting = await prisma.systemSetting.findUnique({ where: { key: brandProofSettingKey } });
    if (!setting) return brandProofDefaults;
    try {
      return brandProofSchema.parse(JSON.parse(setting.value));
    } catch {
      return brandProofDefaults;
    }
  }

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get(
    "/public/brand-proof",
    asyncHandler(async (_req, res) => res.json(await readBrandProof())),
  );

  app.patch(
    "/system/brand-proof",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const value = brandProofSchema.parse(req.body);
      const previous = await readBrandProof();
      await prisma.systemSetting.upsert({
        where: { key: brandProofSettingKey },
        create: {
          key: brandProofSettingKey,
          value: JSON.stringify(value),
          updatedById: req.user!.id,
        },
        update: { value: JSON.stringify(value), updatedById: req.user!.id },
      });
      await audit({
        action: "UPDATE_STARTUP_BRAND_PROOF",
        performedByUserId: req.user!.id,
        oldValue: previous,
        newValue: value,
        ipAddress: req.ip,
      });
      res.json(value);
    }),
  );

  app.post(
    "/system/reset-test-data",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = resetTestDataSchema.parse(req.body);
      const developerAdmin = await prisma.user.findUniqueOrThrow({
        where: { id: req.user!.id },
        select: { id: true, employeeId: true, passwordHash: true, role: true },
      });
      if (developerAdmin.role !== Role.DEVELOPER_ADMIN) {
        throw new HttpError(403, "Developer Admin access required");
      }
      if (!(await verifyPassword(body.password, developerAdmin.passwordHash))) {
        throw new HttpError(401, "The Developer Admin password is incorrect");
      }
      const removedFaceEvidence = await prisma.faceEvidence.findMany({
        where: { userId: { not: developerAdmin.id } },
        select: { imageKey: true },
      });

      const result = await prisma.$transaction(
        async (tx) => {
          const before = {
            users: await tx.user.count(),
            employees: await tx.employee.count(),
            branches: await tx.branch.count(),
            departments: await tx.department.count(),
            leaveTypes: await tx.leaveType.count(),
          };

          await tx.department.updateMany({ data: { headEmployeeId: null } });
          await tx.employee.updateMany({ data: { managerId: null } });
          await tx.user.updateMany({ data: { createdByUserId: null } });
          await tx.systemSetting.updateMany({ data: { updatedById: developerAdmin.id } });

          await tx.integrationIdempotency.deleteMany();
          await tx.integrationClient.deleteMany();
          await tx.employeeChangeEvent.deleteMany();
          await tx.assetReturn.deleteMany();
          await tx.companyAsset.deleteMany();
          await tx.assetCatalogItem.deleteMany();
          await tx.taskUpdate.deleteMany();
          await tx.taskAssignment.deleteMany();
          await tx.workTask.updateMany({ data: { parentTaskId: null } });
          await tx.workTask.deleteMany();
          await tx.taskBoard.deleteMany();
          await tx.pushSubscription.deleteMany();
          await tx.announcement.deleteMany();
          await tx.expenseClaim.deleteMany();
          await tx.certificateRequest.deleteMany();
          await tx.attendanceCorrectionRequest.deleteMany();
          await tx.attendanceReminder.deleteMany();
          await tx.compOffCredit.deleteMany();
          await tx.weeklyOffRequest.deleteMany();
          await tx.leaveBalance.deleteMany();
          await tx.leaveRequest.deleteMany();
          await tx.profileEditRequest.deleteMany();
          await tx.biometricEmployeeMapping.deleteMany();
          await tx.fieldAttendance.deleteMany();
          await tx.attendanceDailySummary.deleteMany();
          await tx.attendanceEvent.deleteMany();
          await tx.employeeBranchSchedule.deleteMany();
          await tx.emergencyContact.deleteMany();
          await tx.biometricDevice.deleteMany();
          await tx.holiday.deleteMany();
          await tx.auditLog.deleteMany();

          const deletedUsers = await tx.user.deleteMany({
            where: { id: { not: developerAdmin.id } },
          });
          const deletedEmployees = await tx.employee.deleteMany({
            where: developerAdmin.employeeId
              ? { employeeId: { not: developerAdmin.employeeId } }
              : undefined,
          });

          return {
            ok: true as const,
            deletedUsers: deletedUsers.count,
            deletedEmployees: deletedEmployees.count,
            preserved: {
              developerAdminUserId: developerAdmin.id,
              branches: before.branches,
              departments: before.departments,
              leaveTypes: before.leaveTypes,
            },
          };
        },
        { maxWait: 10_000, timeout: 60_000 },
      );

      await removeFaceEvidenceFiles(removedFaceEvidence.map((evidence) => evidence.imageKey)).catch(
        (error) =>
          console.error("Test data reset left one or more encrypted evidence files", error),
      );
      publishNotificationChange("test-data-reset", developerAdmin.id);
      res.json(result);
    }),
  );

  app.get(
    "/system/health",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (_req, res) => {
      const databaseStartedAt = performance.now();
      let databaseReachable = true;
      let databaseError: string | undefined;
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        databaseReachable = false;
        databaseError = error instanceof Error ? error.message : "Database check failed";
      }
      const databaseLatencyMs = Math.round(performance.now() - databaseStartedAt);
      const totalMemoryBytes = totalmem();
      const usedMemoryBytes = totalMemoryBytes - freemem();
      const memoryUsedPercent = Math.round((usedMemoryBytes / totalMemoryBytes) * 1000) / 10;
      const degraded = !databaseReachable || databaseLatencyMs > 1500 || memoryUsedPercent > 92;

      res.json({
        status: degraded ? "DEGRADED" : "HEALTHY",
        checkedAt: new Date().toISOString(),
        backendStartedAt: backendStartedAt.toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        database: {
          reachable: databaseReachable,
          latencyMs: databaseLatencyMs,
          error: databaseError,
        },
        memory: {
          usedPercent: memoryUsedPercent,
          processRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
        loadAverage: Math.round(loadavg()[0] * 100) / 100,
        nodeVersion: process.version,
      });
    }),
  );
  app.get(
    "/health/db",
    asyncHandler(async (_req, res) => {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, provider: "mysql", database: "reachable" });
    }),
  );

  app.get(
    "/face/status",
    requireAuth,
    asyncHandler(async (req, res) => {
      const profile = await prisma.faceProfile.findUnique({
        where: { userId: req.user!.id },
        select: {
          status: true,
          rejectionReason: true,
          submittedAt: true,
          approvedAt: true,
        },
      });
      const settings = await readFaceSettings();
      res.json({
        status:
          req.user!.role === Role.DEVELOPER_ADMIN
            ? "DISABLED"
            : (profile?.status ?? "NOT_REGISTERED"),
        required:
          settings.verificationEnabled &&
          req.user!.role !== Role.DEVELOPER_ADMIN &&
          profile?.status !== FaceEnrollmentStatus.APPROVED,
        verificationEnabled: settings.verificationEnabled,
        rejectionReason: profile?.rejectionReason ?? null,
        submittedAt: profile?.submittedAt?.toISOString() ?? null,
        approvedAt: profile?.approvedAt?.toISOString() ?? null,
        maxGpsAccuracyMeters: settings.maxGpsAccuracyMeters,
        consent: FACE_CONSENT,
      });
    }),
  );

  app.post(
    "/face/session",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = faceSessionSchema.parse(req.body);
      const settings = await readFaceSettings();
      if (!settings.verificationEnabled) {
        throw new HttpError(409, "Face verification is currently disabled by Developer Admin");
      }
      if (
        body.purpose !== FaceVerificationPurpose.ENROLLMENT &&
        !(await userHasApprovedFace(req.user!.id))
      ) {
        throw new HttpError(403, "Approved face registration is required for attendance");
      }
      res.status(201).json(await createFaceVerificationSession(req.user!.id, body));
    }),
  );

  app.post(
    "/face/enrollment",
    requireAuth,
    asyncHandler(async (req, res) => {
      const capture = faceCaptureSchema.parse(req.body);
      const result = await submitFaceEnrollment({
        userId: req.user!.id,
        employeeId: req.user!.employeeId,
        role: req.user!.role,
        capture,
      });
      await audit({
        action: result.autoApproved ? "FACE_ENROLLMENT_AUTO_APPROVED" : "FACE_ENROLLMENT_SUBMITTED",
        performedByUserId: req.user!.id,
        affectedUserId: req.user!.id,
        newValue: { status: result.status, consentVersion: result.consentVersion },
        ipAddress: req.ip,
      });
      res.status(201).json(result);
    }),
  );

  app.get(
    "/face/admin/profiles",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (_req, res) => {
      const settings = await readFaceSettings();
      const alertWindowStart = new Date(Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000);
      const [users, mismatchEvidence] = await Promise.all([
        prisma.user.findMany({
          where: { status: UserStatus.ACTIVE, role: { not: Role.DEVELOPER_ADMIN } },
          orderBy: { name: "asc" },
          select: {
            id: true,
            employeeId: true,
            name: true,
            email: true,
            role: true,
            faceProfile: {
              select: {
                status: true,
                submittedAt: true,
                approvedAt: true,
                rejectionReason: true,
                approvedBy: { select: { name: true } },
              },
            },
            faceEvidence: {
              orderBy: { capturedAt: "desc" },
              take: 1,
              select: {
                evidenceId: true,
                outcome: true,
                capturedAt: true,
                expiresAt: true,
                deletedAt: true,
                imageKey: true,
                faceConfidence: true,
                livenessScore: true,
                antiSpoofScore: true,
                similarityScore: true,
                failureReason: true,
              },
            },
          },
        }),
        prisma.faceEvidence.findMany({
          where: {
            capturedAt: { gte: alertWindowStart },
            failureReason: { startsWith: "Another face detected" },
            user: { status: UserStatus.ACTIVE, role: { not: Role.DEVELOPER_ADMIN } },
          },
          orderBy: { capturedAt: "desc" },
          select: {
            evidenceId: true,
            userId: true,
            capturedAt: true,
            failureReason: true,
          },
        }),
      ]);
      const latestAlertByUser = new Map<string, (typeof mismatchEvidence)[number]>();
      for (const alert of mismatchEvidence) {
        if (!latestAlertByUser.has(alert.userId)) latestAlertByUser.set(alert.userId, alert);
      }
      res.json(
        users.map((user) => {
          const latestAlert = latestAlertByUser.get(user.id);
          return {
            userId: user.id,
            employeeId: user.employeeId,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.faceProfile?.status ?? "NOT_REGISTERED",
            submittedAt: user.faceProfile?.submittedAt?.toISOString() ?? null,
            approvedAt: user.faceProfile?.approvedAt?.toISOString() ?? null,
            approvedBy: user.faceProfile?.approvedBy?.name ?? null,
            rejectionReason: user.faceProfile?.rejectionReason ?? null,
            latestAlert: latestAlert
              ? {
                  evidenceId: latestAlert.evidenceId,
                  capturedAt: latestAlert.capturedAt.toISOString(),
                  failureReason: latestAlert.failureReason,
                }
              : null,
            latestEvidence: user.faceEvidence[0]
              ? {
                  ...user.faceEvidence[0],
                  faceConfidence: Number(user.faceEvidence[0].faceConfidence ?? 0),
                  livenessScore: Number(user.faceEvidence[0].livenessScore ?? 0),
                  antiSpoofScore: Number(user.faceEvidence[0].antiSpoofScore ?? 0),
                  similarityScore:
                    user.faceEvidence[0].similarityScore === null
                      ? null
                      : Number(user.faceEvidence[0].similarityScore),
                  capturedAt: user.faceEvidence[0].capturedAt.toISOString(),
                  expiresAt: user.faceEvidence[0].expiresAt.toISOString(),
                  imageAvailable: Boolean(
                    user.faceEvidence[0].imageKey && !user.faceEvidence[0].deletedAt,
                  ),
                  imageKey: undefined,
                }
              : null,
          };
        }),
      );
    }),
  );

  app.patch(
    "/face/admin/profiles/:userId/approve",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const userId = String(req.params.userId);
      const existing = await prisma.faceProfile.findUnique({ where: { userId } });
      if (!existing) throw new HttpError(404, "Face registration was not submitted");
      if (existing.status !== FaceEnrollmentStatus.PENDING) {
        throw new HttpError(409, "Only a pending face registration can be approved");
      }
      const profile = await prisma.faceProfile.update({
        where: { userId },
        data: {
          status: FaceEnrollmentStatus.APPROVED,
          approvedByUserId: req.user!.id,
          approvedAt: new Date(),
          rejectedAt: null,
          rejectionReason: null,
          disabledAt: null,
        },
      });
      invalidateFaceStatusCache(userId);
      await audit({
        action: "FACE_ENROLLMENT_APPROVED",
        performedByUserId: req.user!.id,
        affectedUserId: userId,
        oldValue: { status: existing.status },
        newValue: { status: profile.status },
        ipAddress: req.ip,
      });
      res.json({ status: profile.status });
    }),
  );

  app.patch(
    "/face/admin/profiles/:userId/reject",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const userId = String(req.params.userId);
      const body = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
      const existing = await prisma.faceProfile.findUnique({ where: { userId } });
      if (!existing) throw new HttpError(404, "Face registration was not submitted");
      if (existing.status !== FaceEnrollmentStatus.PENDING) {
        throw new HttpError(409, "Only a pending face registration can be rejected");
      }
      const profile = await prisma.faceProfile.update({
        where: { userId },
        data: {
          status: FaceEnrollmentStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: body.reason,
          approvedAt: null,
          approvedByUserId: null,
        },
      });
      invalidateFaceStatusCache(userId);
      await audit({
        action: "FACE_ENROLLMENT_REJECTED",
        performedByUserId: req.user!.id,
        affectedUserId: userId,
        oldValue: { status: existing.status },
        newValue: { status: profile.status, reason: body.reason },
        ipAddress: req.ip,
      });
      res.json({ status: profile.status, rejectionReason: profile.rejectionReason });
    }),
  );

  app.delete(
    "/face/admin/profiles/:userId",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const userId = String(req.params.userId);
      if (userId === req.user!.id) {
        throw new HttpError(400, "You cannot reset your own approved face registration");
      }
      const existing = await prisma.faceProfile.findUnique({ where: { userId } });
      if (!existing) throw new HttpError(404, "Face registration was not found");
      await prisma.faceProfile.delete({ where: { userId } });
      invalidateFaceStatusCache(userId);
      await audit({
        action: "FACE_ENROLLMENT_RESET",
        performedByUserId: req.user!.id,
        affectedUserId: userId,
        oldValue: { status: existing.status },
        ipAddress: req.ip,
      });
      res.json({ status: "NOT_REGISTERED" });
    }),
  );

  app.get(
    "/face/admin/settings",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (_req, res) => res.json(await readFaceSettings())),
  );

  app.patch(
    "/face/admin/settings",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const previous = await readFaceSettings();
      const settings = await saveFaceSettings(req.body, req.user!.id);
      await audit({
        action: "FACE_ATTENDANCE_SETTINGS_UPDATED",
        performedByUserId: req.user!.id,
        oldValue: previous,
        newValue: settings,
        ipAddress: req.ip,
      });
      res.json(settings);
    }),
  );

  app.get(
    "/face/admin/evidence/:evidenceId/image",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const evidence = await prisma.faceEvidence.findUnique({
        where: { evidenceId: String(req.params.evidenceId) },
        select: { imageKey: true, deletedAt: true },
      });
      if (!evidence?.imageKey || evidence.deletedAt) {
        throw new HttpError(404, "Evidence image has expired or is unavailable");
      }
      const image = await readDecryptedEvidence(evidence.imageKey);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.type("image/jpeg").send(image);
    }),
  );

  app.get(
    "/face/admin/evidence",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const { userId } = z.object({ userId: z.string().min(1) }).parse(req.query);
      const evidence = await prisma.faceEvidence.findMany({
        where: { userId },
        orderBy: { capturedAt: "desc" },
        take: 100,
      });
      res.json(
        evidence.map((row) => ({
          evidenceId: row.evidenceId,
          purpose: row.purpose,
          outcome: row.outcome,
          capturedAt: row.capturedAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          imageAvailable: Boolean(row.imageKey && !row.deletedAt),
          faceConfidence: Number(row.faceConfidence ?? 0),
          livenessScore: Number(row.livenessScore ?? 0),
          antiSpoofScore: Number(row.antiSpoofScore ?? 0),
          similarityScore: row.similarityScore === null ? null : Number(row.similarityScore),
          latitude: row.latitude === null ? null : Number(row.latitude),
          longitude: row.longitude === null ? null : Number(row.longitude),
          locationAccuracy: row.locationAccuracy === null ? null : Number(row.locationAccuracy),
          failureReason: row.failureReason,
        })),
      );
    }),
  );

  registerIntegrationRoutes(app);

  app.post(
    "/auth/login",
    authLimiter,
    asyncHandler(async (req, res) => {
      const body = loginSchema.parse(req.body);
      const recordFailedLogin = (reason: string, affectedUserId?: string) => {
        void audit({
          action: "login failed",
          affectedUserId,
          newValue: {
            reason,
            emailHash: createHash("sha256").update(body.email.toLowerCase()).digest("hex"),
          },
          ipAddress: req.ip,
        }).catch((error) => console.error("Failed to write login failure audit", error));
      };
      const user = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase() },
        include: { employee: true, faceProfile: true },
      });
      if (!user) {
        recordFailedLogin("unknown_account");
        throw new HttpError(401, "Invalid credentials");
      }

      const isDeveloperAdmin = user.role === Role.DEVELOPER_ADMIN;

      if (!isDeveloperAdmin && user.status === UserStatus.LOCKED) {
        recordFailedLogin("locked_account", user.id);
        throw new HttpError(
          403,
          "Account blocked after 5 failed attempts. Contact your HR team; a Developer Admin must reactivate the login.",
        );
      }

      if (!isDeveloperAdmin && user.status !== UserStatus.ACTIVE) {
        recordFailedLogin("inactive_account", user.id);
        throw new HttpError(401, "Invalid credentials");
      }

      const suspensionIsActive =
        user.suspensionStartsAt &&
        user.suspendedUntil &&
        user.suspensionStartsAt.getTime() <= Date.now() &&
        user.suspendedUntil.getTime() > Date.now();
      if (!isDeveloperAdmin && suspensionIsActive) {
        recordFailedLogin("suspended_account", user.id);
        throw new HttpError(
          403,
          `Account suspended until ${user.suspendedUntil!.toISOString().slice(0, 10)}`,
        );
      }
      const ok = await verifyPassword(body.password, user.passwordHash);
      if (!ok) {
        recordFailedLogin("invalid_password", user.id);
        if (isDeveloperAdmin) {
          throw new HttpError(401, "Invalid email address or password.");
        }
        const nextAttempts = user.failedLoginAttempts + 1;
        const isLocked = nextAttempts >= 5;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: nextAttempts,
            status: isLocked ? UserStatus.LOCKED : undefined,
          },
        });
        const remainingAttempts = Math.max(0, 5 - nextAttempts);
        throw new HttpError(
          isLocked ? 403 : 401,
          isLocked
            ? "Account blocked after 5 failed attempts. Contact your HR team; a Developer Admin must reactivate the login."
            : `Invalid email address or password. ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining before the account is blocked.`,
        );
      }
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lastLoginAt: new Date(),
          ...(isDeveloperAdmin
            ? {
                status: UserStatus.ACTIVE,
                suspendedUntil: null,
                suspensionStartsAt: null,
              }
            : {}),
          ...(user.suspendedUntil && user.suspendedUntil.getTime() <= Date.now()
            ? { suspendedUntil: null, suspensionStartsAt: null }
            : {}),
        },
        include: { employee: true, faceProfile: true },
      });
      issueCookies(res, updated);
      res.json({ user: userDto(updated) });
      void audit({
        action: "login succeeded",
        performedByUserId: user.id,
        affectedUserId: user.id,
        ipAddress: req.ip,
      }).catch((err) => {
        console.error("Failed to write login audit log", err);
      });
    }),
  );

  app.patch(
    "/users/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const body = updateUserSchema.parse(req.body);
      const existing = await prisma.user.findUniqueOrThrow({ where: { id } });
      if (existing.role === Role.DEVELOPER_ADMIN && req.user!.role !== Role.DEVELOPER_ADMIN) {
        throw new HttpError(403, "Only Developer Admin can update Developer Admin");
      }
      if (body.role && body.role !== existing.role && !canCreateRole(req.user!.role, body.role)) {
        throw new HttpError(403, "This role cannot assign the requested login role");
      }
      if (body.role === Role.DEVELOPER_ADMIN && req.user!.role !== Role.DEVELOPER_ADMIN) {
        throw new HttpError(403, "Only Developer Admin can assign Developer Admin");
      }
      if (
        existing.role === Role.DEVELOPER_ADMIN &&
        ((body.status !== undefined && body.status !== UserStatus.ACTIVE) ||
          (body.role !== undefined && body.role !== Role.DEVELOPER_ADMIN) ||
          body.suspendedUntil != null ||
          body.suspensionStartsAt != null)
      ) {
        throw new HttpError(
          403,
          "Developer Admin accounts cannot be deactivated, suspended, or demoted",
        );
      }
      const updated = await prisma.$transaction(async (tx) => {
        const sharedProfileChanged =
          body.name !== undefined ||
          body.email !== undefined ||
          body.phone !== undefined ||
          body.status === UserStatus.ACTIVE ||
          body.status === UserStatus.INACTIVE;
        if (existing.employeeId && sharedProfileChanged) {
          const employee = await tx.employee.update({
            where: { employeeId: existing.employeeId },
            data: {
              name: body.name,
              email: body.email?.toLowerCase(),
              phone: body.phone,
              status:
                body.status === UserStatus.INACTIVE
                  ? "INACTIVE"
                  : body.status === UserStatus.ACTIVE
                    ? "ACTIVE"
                    : undefined,
              terminatedAt:
                body.status === UserStatus.INACTIVE
                  ? new Date()
                  : body.status === UserStatus.ACTIVE
                    ? null
                    : undefined,
              version: { increment: 1 },
            },
          });
          await tx.employeeChangeEvent.create({
            data: {
              employeeId: employee.employeeId,
              eventType:
                body.status === UserStatus.INACTIVE
                  ? "DEACTIVATED"
                  : body.status === UserStatus.ACTIVE && existing.status !== UserStatus.ACTIVE
                    ? "REACTIVATED"
                    : "UPDATED",
              version: employee.version,
              payload: {
                employeeId: employee.employeeId,
                employeeCode: employee.employeeCode,
                version: employee.version,
              },
            },
          });
        }
        return tx.user.update({
          where: { id },
          data: {
            name: body.name,
            email: body.email?.toLowerCase(),
            phone: body.phone,
            role: body.role,
            status: body.status,
            firstLoginPasswordChangeRequired: body.firstLoginPasswordChangeRequired,
            suspendedUntil: body.suspendedUntil,
            suspensionStartsAt: body.suspensionStartsAt,
            deactivatedAt:
              body.status === UserStatus.INACTIVE
                ? new Date()
                : body.status === UserStatus.ACTIVE
                  ? null
                  : undefined,
            failedLoginAttempts: body.status === UserStatus.ACTIVE ? 0 : undefined,
            sessionVersion:
              body.role !== undefined ||
              body.status !== undefined ||
              body.firstLoginPasswordChangeRequired !== undefined ||
              body.suspendedUntil !== undefined ||
              body.suspensionStartsAt !== undefined
                ? { increment: 1 }
                : undefined,
          },
          include: { employee: true, faceProfile: true },
        });
      });
      await audit({
        action: "user updated",
        performedByUserId: req.user!.id,
        affectedUserId: updated.id,
        oldValue: { role: existing.role, status: existing.status },
        newValue: { role: updated.role, status: updated.status },
        ipAddress: req.ip,
      });
      res.json(userDto(updated));
    }),
  );

  app.post(
    "/users/:id/suspend",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const suspensionStartsAt = new Date(String(req.body.suspensionStartsAt));
      const suspendedUntil = new Date(String(req.body.suspendedUntil));
      if (
        Number.isNaN(suspensionStartsAt.getTime()) ||
        Number.isNaN(suspendedUntil.getTime()) ||
        suspensionStartsAt.getTime() <= Date.now() ||
        suspendedUntil.getTime() <= suspensionStartsAt.getTime()
      ) {
        throw new HttpError(400, "Choose a future start date and an end date after it");
      }
      const existing = await prisma.user.findUniqueOrThrow({ where: { id } });
      if (existing.id === req.user!.id) throw new HttpError(400, "You cannot suspend yourself");
      if (existing.role === Role.DEVELOPER_ADMIN) {
        throw new HttpError(403, "Developer Admin accounts cannot be suspended");
      }
      const updated = await prisma.user.update({
        where: { id },
        data: { suspensionStartsAt, suspendedUntil, sessionVersion: { increment: 1 } },
        include: { employee: true, faceProfile: true },
      });
      await audit({
        action: "user temporarily suspended",
        performedByUserId: req.user!.id,
        affectedUserId: updated.id,
        oldValue: {
          suspensionStartsAt: existing.suspensionStartsAt,
          suspendedUntil: existing.suspendedUntil,
        },
        newValue: { suspensionStartsAt, suspendedUntil },
        ipAddress: req.ip,
      });
      res.json(userDto(updated));
    }),
  );

  app.post(
    "/users/:id/deactivate",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const existing = await prisma.user.findUniqueOrThrow({ where: { id } });
      if (existing.id === req.user!.id) throw new HttpError(400, "You cannot deactivate yourself");
      if (existing.role === Role.DEVELOPER_ADMIN) {
        throw new HttpError(403, "Developer Admin accounts cannot be deactivated");
      }
      const updated = await prisma.$transaction(async (tx) => {
        if (existing.employeeId) {
          const employee = await tx.employee.update({
            where: { employeeId: existing.employeeId },
            data: { status: "INACTIVE", terminatedAt: new Date(), version: { increment: 1 } },
          });
          await tx.employeeChangeEvent.create({
            data: {
              employeeId: employee.employeeId,
              eventType: "DEACTIVATED",
              version: employee.version,
              payload: {
                employeeId: employee.employeeId,
                employeeCode: employee.employeeCode,
                version: employee.version,
              },
            },
          });
        }
        return tx.user.update({
          where: { id },
          data: {
            status: UserStatus.INACTIVE,
            deactivatedAt: new Date(),
            sessionVersion: { increment: 1 },
          },
          include: { employee: true, faceProfile: true },
        });
      });
      await audit({
        action: "user deactivated",
        performedByUserId: req.user!.id,
        affectedUserId: updated.id,
        oldValue: { status: existing.status },
        newValue: { status: updated.status },
        ipAddress: req.ip,
      });
      res.json(userDto(updated));
    }),
  );

  app.delete(
    "/users/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const existing = await prisma.user.findUniqueOrThrow({
        where: { id },
        include: { employee: true, faceProfile: true },
      });
      if (existing.id === req.user!.id) {
        throw new HttpError(400, "You cannot deactivate your own account");
      }
      if (existing.role === Role.DEVELOPER_ADMIN) {
        throw new HttpError(403, "Developer Admin accounts cannot be deactivated");
      }
      if (req.body?.confirmation !== "DEACTIVATE") {
        throw new HttpError(400, "Type DEACTIVATE to preserve history and deactivate the account");
      }

      const employeeId = existing.employeeId;
      const updated = await prisma.$transaction(async (tx) => {
        if (employeeId) {
          const employee = await tx.employee.update({
            where: { employeeId },
            data: { status: "INACTIVE", terminatedAt: new Date(), version: { increment: 1 } },
          });
          await tx.employeeChangeEvent.create({
            data: {
              employeeId,
              eventType: "DEACTIVATED",
              version: employee.version,
              payload: {
                employeeId,
                employeeCode: employee.employeeCode,
                version: employee.version,
              },
            },
          });
        }
        return tx.user.update({
          where: { id },
          data: {
            status: UserStatus.INACTIVE,
            deactivatedAt: new Date(),
            suspendedUntil: null,
            suspensionStartsAt: null,
            sessionVersion: { increment: 1 },
          },
          include: { employee: true, faceProfile: true },
        });
      });

      await audit({
        action: "user deactivated with history retained",
        performedByUserId: req.user!.id,
        affectedUserId: id,
        ipAddress: req.ip,
        newValue: {
          userId: id,
          employeeId,
          name: existing.name,
          email: existing.email,
          employeeDataRetained: Boolean(employeeId),
        },
      });

      res.json({ ok: true, user: userDto(updated), dataRetained: true });
    }),
  );

  app.post(
    "/users/:id/reset-password",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const body = resetPasswordSchema.parse(req.body);
      const existing = await prisma.user.findUniqueOrThrow({ where: { id } });
      if (existing.role === Role.DEVELOPER_ADMIN && req.user!.role !== Role.DEVELOPER_ADMIN) {
        throw new HttpError(403, "Only Developer Admin can reset Developer Admin's password");
      }
      const updated = await prisma.user.update({
        where: { id },
        data: {
          passwordHash: await hashPassword(body.password),
          firstLoginPasswordChangeRequired: true,
          failedLoginAttempts: 0,
          sessionVersion: { increment: 1 },
        },
        include: { employee: true },
      });
      await audit({
        action: "user password reset by admin/hr",
        performedByUserId: req.user!.id,
        affectedUserId: id,
        ipAddress: req.ip,
      });
      res.json(userDto(updated));
    }),
  );

  app.post(
    "/auth/logout",
    asyncHandler(async (req, res) => {
      const token = req.cookies?.[config.refreshCookie];
      if (token) {
        try {
          const payload = verifyRefreshToken(token);
          await prisma.user.updateMany({
            where: { id: payload.id, sessionVersion: payload.sessionVersion },
            data: { sessionVersion: { increment: 1 } },
          });
        } catch {
          // Logout remains successful for expired, malformed, or already-revoked cookies.
        }
      }
      clearCookies(res);
      res.json({ ok: true });
    }),
  );

  app.post(
    "/auth/restore",
    asyncHandler(async (req, res) => {
      const token = req.cookies?.[config.refreshCookie];
      if (!token) throw new HttpError(401, "Refresh token missing");
      const payload = verifyRefreshToken(token);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: payload.id },
        include: { employee: true, faceProfile: true },
      });
      if (payload.sessionVersion !== user.sessionVersion) {
        clearCookies(res);
        throw new HttpError(401, "Session has been revoked. Sign in again");
      }
      if (user.status !== UserStatus.ACTIVE) {
        clearCookies(res);
        throw new HttpError(403, "Account inactive");
      }
      if (
        user.suspensionStartsAt &&
        user.suspendedUntil &&
        user.suspensionStartsAt.getTime() <= Date.now() &&
        user.suspendedUntil.getTime() > Date.now()
      ) {
        clearCookies(res);
        throw new HttpError(403, "Account temporarily suspended");
      }
      issueCookies(res, user);
      res.json({ user: userDto(user) });
    }),
  );

  app.get(
    "/auth/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user!.id },
        include: { employee: true, faceProfile: true },
      });
      if (
        user.suspensionStartsAt &&
        user.suspendedUntil &&
        user.suspensionStartsAt.getTime() <= Date.now() &&
        user.suspendedUntil.getTime() > Date.now()
      ) {
        clearCookies(res);
        throw new HttpError(403, "Account temporarily suspended");
      }
      res.json({ user: userDto(user) });
    }),
  );

  app.post(
    "/auth/refresh",
    asyncHandler(async (req, res) => {
      const token = req.cookies?.[config.refreshCookie];
      if (!token) throw new HttpError(401, "Refresh token missing");
      const payload = verifyRefreshToken(token);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.id } });
      if (payload.sessionVersion !== user.sessionVersion) {
        clearCookies(res);
        throw new HttpError(401, "Session has been revoked. Sign in again");
      }
      if (user.status !== UserStatus.ACTIVE) throw new HttpError(403, "Account inactive");
      if (
        user.suspensionStartsAt &&
        user.suspendedUntil &&
        user.suspensionStartsAt.getTime() <= Date.now() &&
        user.suspendedUntil.getTime() > Date.now()
      ) {
        clearCookies(res);
        throw new HttpError(403, "Account temporarily suspended");
      }
      issueCookies(res, user);
      res.json({ ok: true });
    }),
  );

  app.post(
    "/auth/change-password",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = changePasswordSchema.parse(req.body);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
      if (!user.firstLoginPasswordChangeRequired) {
        if (!body.oldPassword) throw new HttpError(400, "Current password is required");
        const ok = await verifyPassword(body.oldPassword, user.passwordHash);
        if (!ok) throw new HttpError(401, "Current password is incorrect");
      }
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(body.nextPassword),
          firstLoginPasswordChangeRequired: false,
          failedLoginAttempts: 0,
          sessionVersion: { increment: 1 },
        },
        include: { employee: true, faceProfile: true },
      });
      issueCookies(res, updated);
      await audit({
        action: "password changed",
        performedByUserId: user.id,
        affectedUserId: user.id,
        ipAddress: req.ip,
      });
      res.json({ ok: true, user: userDto(updated) });
    }),
  );

  app.get(
    "/users",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const users = await prisma.user.findMany({
        include: { employee: true, faceProfile: true },
        orderBy: { createdAt: "desc" },
        skip: listOffset(req),
        take: listLimit(req, 750, 1000),
      });
      res.json(users.map(userDto));
    }),
  );

  app.post(
    "/users",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = createUserSchema.parse(req.body);
      const linkedEmployee = body.employeeId
        ? await prisma.employee.findUnique({
            where: { employeeId: body.employeeId },
            include: { user: true },
          })
        : null;
      if (body.employeeId && !linkedEmployee) throw new HttpError(404, "Employee not found");
      if (linkedEmployee?.user) throw new HttpError(409, "Employee already has a login account");
      const organizationUnitId = body.departmentId ?? linkedEmployee?.departmentId;
      const organizationUnit = organizationUnitId
        ? await prisma.department.findUnique({ where: { departmentId: organizationUnitId } })
        : null;
      if (!organizationUnit) throw new HttpError(400, "Select an organization unit");
      const unitName = organizationUnit.name.toLowerCase();
      const targetRole =
        unitName === "executive leadership"
          ? Role.CEO
          : unitName === "human resources"
            ? Role.HR
            : unitName === "administration" && body.organizationLevel === "HEAD"
              ? Role.MAIN_ADMIN
              : unitName === "drivers"
                ? Role.DRIVER
                : body.organizationLevel === "HEAD"
                  ? Role.MANAGER
                  : unitName.includes("sales")
                    ? Role.SALES
                    : Role.EMPLOYEE;
      if (!canCreateRole(req.user!.role, targetRole))
        throw new HttpError(403, "This role cannot create the requested login");
      const employeeRoles = [
        Role.MAIN_ADMIN,
        Role.CEO,
        Role.HR,
        Role.MANAGER,
        Role.EMPLOYEE,
        Role.SALES,
        Role.DRIVER,
        Role.FIELD_STAFF,
      ] as Role[];
      const shouldCreateEmployee = employeeRoles.includes(targetRole) && !body.employeeId;
      let reportingManagerId = body.managerId ?? null;
      if (shouldCreateEmployee && !reportingManagerId && targetRole !== Role.CEO) {
        const unitWithParent = await prisma.department.findUnique({
          where: { departmentId: organizationUnit.departmentId },
          select: {
            headEmployeeId: true,
            parentDepartment: { select: { headEmployeeId: true } },
          },
        });
        reportingManagerId =
          body.organizationLevel === "HEAD"
            ? (unitWithParent?.parentDepartment?.headEmployeeId ?? null)
            : (unitWithParent?.headEmployeeId ??
              unitWithParent?.parentDepartment?.headEmployeeId ??
              null);
        if (!reportingManagerId) {
          const ceo = await prisma.user.findFirst({
            where: { role: Role.CEO, status: "ACTIVE", employeeId: { not: null } },
            select: { employeeId: true },
          });
          reportingManagerId = ceo?.employeeId ?? null;
        }
      }
      if (shouldCreateEmployee) await assertValidManager("new-employee", reportingManagerId);
      if (linkedEmployee && !linkedEmployee.email) {
        throw new HttpError(409, "Add an email to the employee profile before creating a login");
      }
      const passwordHash = await hashPassword(body.password);
      const user = await prisma.$transaction(async (tx) => {
        const employee = shouldCreateEmployee
          ? await tx.employee.create({
              data: {
                employeeCode: body.employeeCode || nextEmployeeCode(),
                name: body.name,
                email: body.email.toLowerCase(),
                phone: body.phone,
                companyPhone: body.companyPhone,
                companyEntity: body.companyEntity,
                departmentId: body.departmentId ?? undefined,
                designation: body.designation ?? undefined,
                homeBranchId: body.homeBranchId ?? undefined,
                managerId: reportingManagerId ?? undefined,
                attendanceMode: body.attendanceMode ?? "BOTH",
                attendanceRequired: targetRole !== Role.CEO,
                isFieldEmployee:
                  body.isFieldEmployee ??
                  ([Role.SALES, Role.DRIVER, Role.FIELD_STAFF] as Role[]).includes(targetRole),
                joiningDate: body.joiningDate ?? undefined,
                dateOfBirth: body.dateOfBirth ?? undefined,
                gender: body.gender ?? undefined,
                bloodGroup: body.bloodGroup ?? undefined,
                employmentType: body.employmentType ?? "FULL_TIME",
                organizationLevel: body.organizationLevel ?? "MEMBER",
                bankAccountType: body.bankAccountType ?? undefined,
                bankAccountHolderName: body.bankAccountHolderName ?? undefined,
                bankIfscCode: body.bankIfscCode ?? undefined,
                bankAccountNumberEncrypted: encryptEmployeeField(body.bankAccountNumber),
                bankAccountNumberLast4: lastFour(body.bankAccountNumber),
                panNumberEncrypted: encryptEmployeeField(body.panNumber),
                panNumberLast4: lastFour(body.panNumber),
                aadhaarNumberEncrypted: encryptEmployeeField(body.aadhaarNumber),
                aadhaarNumberLast4: lastFour(body.aadhaarNumber),
                uanNumberEncrypted: encryptEmployeeField(body.uanNumber),
                uanNumberLast4: lastFour(body.uanNumber),
                shiftType: body.shiftType ?? "DAY",
                shiftStartMinutes: body.shiftStartMinutes ?? 540,
                shiftEndMinutes: body.shiftEndMinutes ?? 1080,
              },
            })
          : linkedEmployee;
        if (shouldCreateEmployee && employee) {
          await tx.employeeChangeEvent.create({
            data: {
              employeeId: employee.employeeId,
              eventType: "CREATED",
              version: employee.version,
              payload: {
                employeeId: employee.employeeId,
                employeeCode: employee.employeeCode,
                version: employee.version,
              },
            },
          });
        }
        return tx.user.create({
          data: {
            name: employee?.name ?? body.name,
            email: (employee?.email ?? body.email).toLowerCase(),
            phone: employee?.phone ?? body.phone,
            passwordHash,
            role: targetRole,
            employeeId: employee?.employeeId,
            createdByUserId: req.user!.id,
          },
          include: { employee: true, faceProfile: true },
        });
      });
      await audit({
        action: "login created",
        performedByUserId: req.user!.id,
        affectedUserId: user.id,
        newValue: { role: user.role, email: user.email, employeeId: user.employeeId },
        ipAddress: req.ip,
      });
      res.status(201).json(userDto(user));
    }),
  );

  app.get(
    "/employees/me/is-reporting-manager",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) {
        res.json({ isReportingManager: false, teamCount: 0 });
        return;
      }
      const teamCount = (await getOrganizationTeamEmployeeIds(req.user!.employeeId)).length;
      res.json({ isReportingManager: teamCount > 0, teamCount });
    }),
  );

  app.get(
    "/employees",
    requireAuth,
    asyncHandler(async (req, res) => {
      const directoryRoles: Role[] = [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.CEO, Role.HR];
      const where = directoryRoles.includes(req.user!.role)
        ? {}
        : req.user!.role === Role.MANAGER && req.user!.employeeId
          ? { employeeId: { in: await getOrganizationTeamEmployeeIds(req.user!.employeeId) } }
          : req.user!.employeeId
            ? { employeeId: req.user!.employeeId }
            : { employeeId: "__none__" };
      const employees = await prisma.employee.findMany({
        where,
        include: { user: true, department: true, homeBranch: true, manager: true },
        orderBy: { employeeCode: "asc" },
        skip: listOffset(req),
        take: listLimit(req, 750, 1000),
      });
      res.json(employees.map((emp) => employeeDto(emp, req.user!)));
    }),
  );

  app.get(
    "/leave/approver",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(400, "No employee profile");
      const approver = await findLeaveApprover(req.user!.employeeId);
      res.json({ approverName: approver?.name ?? null, canApply: Boolean(approver) });
    }),
  );

  app.get(
    "/employees/birthdays",
    requireAuth,
    asyncHandler(async (req, res) => {
      const employees = await prisma.employee.findMany({
        where: {
          dateOfBirth: { not: null },
          status: "ACTIVE",
        },
        select: {
          employeeId: true,
          name: true,
          dateOfBirth: true,
          gender: true,
          designation: true,
          department: { select: { name: true } },
        },
      });

      const today = new Date();
      const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
      const currentYear = today.getUTCFullYear();

      const birthdayList = employees.map((emp) => {
        const dob = new Date(emp.dateOfBirth!);
        const bMonth = dob.getUTCMonth();
        const bDate = dob.getUTCDate();

        let nextBdayUTC = Date.UTC(currentYear, bMonth, bDate);
        if (nextBdayUTC < todayUTC) {
          nextBdayUTC = Date.UTC(currentYear + 1, bMonth, bDate);
        }

        const daysUntil = Math.ceil((nextBdayUTC - todayUTC) / (1000 * 60 * 60 * 24));
        const isToday = bMonth === today.getUTCMonth() && bDate === today.getUTCDate();
        const age = currentYear - dob.getUTCFullYear();
        const dobString = `1900-${String(bMonth + 1).padStart(2, "0")}-${String(bDate).padStart(2, "0")}`;

        return {
          employeeId: emp.employeeId,
          name: emp.name,
          designation: emp.designation ?? undefined,
          department: emp.department?.name ?? undefined,
          dateOfBirth: dobString,
          isToday,
          daysUntil: isToday ? 0 : daysUntil,
          age,
          message: birthdayMessage(emp.employeeId, emp.name, age, currentYear, emp.gender),
        };
      });

      birthdayList.sort((a, b) => a.daysUntil - b.daysUntil);
      res.json(birthdayList.filter((item) => isUpcomingBirthday(item.daysUntil)));
    }),
  );

  app.get(
    "/employees/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const employeeId = String(req.params.id);
      await assertEmployeeAccess(req.user, employeeId);
      const employee = await prisma.employee.findUniqueOrThrow({
        where: { employeeId },
        include: { user: true, department: true, homeBranch: true, manager: true },
      });
      res.json(employeeDto(employee, req.user!, true));
    }),
  );

  app.patch(
    "/employees/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const employeeId = String(req.params.id);
      const body = updateEmployeeSchema.parse(req.body);
      const { bankAccountNumber, panNumber, aadhaarNumber, uanNumber, ...employeeUpdate } = body;
      if (
        req.user!.role === Role.HR &&
        (body.managerId === undefined || Object.keys(body).some((key) => key !== "managerId"))
      ) {
        throw new HttpError(403, "HR can update only the reporting manager");
      }
      const existing = await prisma.employee.findUniqueOrThrow({
        where: { employeeId },
        include: { user: true },
      });
      const nextDateOfBirth =
        body.dateOfBirth === undefined ? existing.dateOfBirth : body.dateOfBirth;
      const nextJoiningDate =
        body.joiningDate === undefined ? existing.joiningDate : body.joiningDate;
      if (
        nextDateOfBirth &&
        nextJoiningDate &&
        nextJoiningDate.getTime() <= nextDateOfBirth.getTime()
      ) {
        throw new HttpError(400, "Joining date must be after date of birth");
      }
      await assertValidManager(employeeId, body.managerId);
      if (existing.user && body.email === null) {
        throw new HttpError(409, "Email cannot be removed while the employee has a login account");
      }
      const employee = await prisma.$transaction(async (tx) => {
        const updatedEmployee = await tx.employee.update({
          where: { employeeId },
          data: {
            ...employeeUpdate,
            email: body.email === undefined ? undefined : body.email?.toLowerCase(),
            bankAccountNumberEncrypted:
              bankAccountNumber === undefined ? undefined : encryptEmployeeField(bankAccountNumber),
            bankAccountNumberLast4:
              bankAccountNumber === undefined ? undefined : lastFour(bankAccountNumber),
            panNumberEncrypted:
              panNumber === undefined ? undefined : encryptEmployeeField(panNumber),
            panNumberLast4: panNumber === undefined ? undefined : lastFour(panNumber),
            aadhaarNumberEncrypted:
              aadhaarNumber === undefined ? undefined : encryptEmployeeField(aadhaarNumber),
            aadhaarNumberLast4: aadhaarNumber === undefined ? undefined : lastFour(aadhaarNumber),
            uanNumberEncrypted:
              uanNumber === undefined ? undefined : encryptEmployeeField(uanNumber),
            uanNumberLast4: uanNumber === undefined ? undefined : lastFour(uanNumber),
            terminatedAt:
              body.status && body.status !== "ACTIVE"
                ? (existing.terminatedAt ?? new Date())
                : body.status === "ACTIVE"
                  ? null
                  : undefined,
            version: { increment: 1 },
          },
          include: { user: true, department: true, homeBranch: true, manager: true },
        });
        if (existing.user) {
          await tx.user.update({
            where: { id: existing.user.id },
            data: {
              name: body.name,
              email: body.email === undefined ? undefined : body.email!.toLowerCase(),
              phone: body.phone,
              status:
                body.status && body.status !== "ACTIVE"
                  ? UserStatus.INACTIVE
                  : body.status === "ACTIVE"
                    ? UserStatus.ACTIVE
                    : undefined,
              deactivatedAt:
                body.status && body.status !== "ACTIVE"
                  ? new Date()
                  : body.status === "ACTIVE"
                    ? null
                    : undefined,
              sessionVersion: body.status ? { increment: 1 } : undefined,
            },
          });
        }
        await tx.employeeChangeEvent.create({
          data: {
            employeeId,
            eventType:
              body.status && body.status !== "ACTIVE" && existing.status === "ACTIVE"
                ? "DEACTIVATED"
                : body.status === "ACTIVE" && existing.status !== "ACTIVE"
                  ? "REACTIVATED"
                  : "UPDATED",
            version: updatedEmployee.version,
            payload: {
              employeeId,
              employeeCode: updatedEmployee.employeeCode,
              version: updatedEmployee.version,
            },
          },
        });
        return tx.employee.findUniqueOrThrow({
          where: { employeeId },
          include: { user: true, department: true, homeBranch: true, manager: true },
        });
      });
      if (body.managerId !== undefined && body.managerId !== existing.managerId) {
        await audit({
          action: "employee manager changed",
          performedByUserId: req.user!.id,
          affectedUserId: employee.user?.id,
          oldValue: { managerId: existing.managerId },
          newValue: { managerId: employee.managerId },
          ipAddress: req.ip,
        });
      } else {
        await audit({
          action: "employee updated",
          performedByUserId: req.user!.id,
          affectedUserId: employee.user?.id,
          newValue: { employeeId },
          ipAddress: req.ip,
        });
      }
      res.json(employeeDto(employee, req.user!, true));
    }),
  );

  app.get(
    "/branches",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const branches = await prisma.branch.findMany({
        where: { status: { not: "DELETED" } },
        orderBy: { branchName: "asc" },
      });
      res.json(branches.map(branchDto));
    }),
  );

  app.get(
    "/assets",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN, Role.CEO),
    asyncHandler(async (req, res) => {
      const query = String(req.query.q ?? "").trim();
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const assets = await prisma.companyAsset.findMany({
        where: {
          ...(status && status !== "all" ? { status } : {}),
          ...(query
            ? {
                OR: [
                  { assetCode: { contains: query } },
                  { name: { contains: query } },
                  { category: { contains: query } },
                  { serialNumber: { contains: query } },
                  { assignedEmployee: { name: { contains: query } } },
                ],
              }
            : {}),
        },
        include: { assignedEmployee: true, branch: true },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        skip: listOffset(req),
        take: listLimit(req, 500, 1000),
      });
      res.json(assets.map(companyAssetDto));
    }),
  );

  app.get(
    "/assets/investment-summary",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN, Role.CEO),
    asyncHandler(async (_req, res) => {
      const assets = await prisma.companyAsset.findMany({
        where: { assignedEmployeeId: { not: null }, status: { not: "RETIRED" } },
        include: { assignedEmployee: { include: { department: true } } },
      });
      const summary = new Map<
        string,
        {
          employeeId: string;
          employeeName: string;
          employeeCode: string;
          department?: string;
          physicalAssets: number;
          onlineAssets: number;
          oneTimeInvestment: number;
          monthlyRecurring: number;
          annualRecurring: number;
          firstYearInvestment: number;
        }
      >();
      for (const asset of assets) {
        const employee = asset.assignedEmployee;
        if (!employee) continue;
        const value = Number(asset.purchaseValue);
        const monthly =
          asset.costFrequency === "MONTHLY"
            ? value
            : asset.costFrequency === "YEARLY"
              ? value / 12
              : 0;
        const annual =
          asset.costFrequency === "MONTHLY"
            ? value * 12
            : asset.costFrequency === "YEARLY"
              ? value
              : 0;
        const row = summary.get(employee.employeeId) ?? {
          employeeId: employee.employeeId,
          employeeName: employee.name,
          employeeCode: employee.employeeCode,
          department: employee.department?.name,
          physicalAssets: 0,
          onlineAssets: 0,
          oneTimeInvestment: 0,
          monthlyRecurring: 0,
          annualRecurring: 0,
          firstYearInvestment: 0,
        };
        if (asset.assetType === "PHYSICAL") row.physicalAssets += 1;
        else row.onlineAssets += 1;
        if (asset.costFrequency === "ONE_TIME") row.oneTimeInvestment += value;
        row.monthlyRecurring += monthly;
        row.annualRecurring += annual;
        row.firstYearInvestment = row.oneTimeInvestment + row.annualRecurring;
        summary.set(employee.employeeId, row);
      }
      res.json([...summary.values()].sort((a, b) => b.firstYearInvestment - a.firstYearInvestment));
    }),
  );

  app.get(
    "/assets/catalog",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const includeInactive = req.query.includeInactive === "true";
      const items = await prisma.assetCatalogItem.findMany({
        where: includeInactive ? {} : { status: "ACTIVE" },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      });
      res.json(items.map(assetCatalogItemDto));
    }),
  );

  app.post(
    "/assets/catalog",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = assetCatalogItemSchema.parse(req.body);
      const item = await prisma.assetCatalogItem.create({ data: body });
      await audit({
        action: "asset catalog item created",
        performedByUserId: req.user!.id,
        newValue: { catalogId: item.catalogId, name: item.name },
        ipAddress: req.ip,
      });
      res.status(201).json(assetCatalogItemDto(item));
    }),
  );

  app.patch(
    "/assets/catalog/:id",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = assetCatalogItemUpdateSchema.parse(req.body);
      const existing = await prisma.assetCatalogItem.findUniqueOrThrow({
        where: { catalogId: String(req.params.id) },
      });
      const item = await prisma.assetCatalogItem.update({
        where: { catalogId: existing.catalogId },
        data: body,
      });
      await audit({
        action: "asset catalog item updated",
        performedByUserId: req.user!.id,
        oldValue: { name: existing.name, category: existing.category },
        newValue: { catalogId: item.catalogId, name: item.name, category: item.category },
        ipAddress: req.ip,
      });
      res.json(assetCatalogItemDto(item));
    }),
  );

  app.delete(
    "/assets/catalog/:id",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const item = await prisma.assetCatalogItem.update({
        where: { catalogId: String(req.params.id) },
        data: { status: "INACTIVE" },
      });
      await audit({
        action: "asset catalog item deactivated",
        performedByUserId: req.user!.id,
        newValue: { catalogId: item.catalogId, status: item.status },
        ipAddress: req.ip,
      });
      res.json(assetCatalogItemDto(item));
    }),
  );

  app.post(
    "/assets",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = companyAssetSchema.parse(req.body);
      if (body.assetType !== "ONLINE" && !body.assetCode) {
        throw new HttpError(400, "Asset ID is required for physical assets");
      }
      const catalogItem = body.catalogId
        ? await prisma.assetCatalogItem.findFirst({
            where: { catalogId: body.catalogId, status: "ACTIVE" },
          })
        : undefined;
      if (body.catalogId && !catalogItem) {
        throw new HttpError(400, "Select an active item from Asset Catalog");
      }
      const assetType = body.assetType ?? "PHYSICAL";
      const assignmentScope = body.assignmentScope ?? "EMPLOYEE";
      const catalogType =
        catalogItem?.category === "Company Asset" ? "PHYSICAL" : catalogItem?.category;
      if (catalogType && catalogType !== assetType) {
        throw new HttpError(400, "Asset name does not match the selected asset type");
      }
      if (assignmentScope === "COMPANY" && body.assignedEmployeeId) {
        throw new HttpError(400, "Company-use assets cannot be assigned to an employee");
      }
      if (body.assignedEmployeeId) {
        const employee = await prisma.employee.findFirst({
          where: { employeeId: body.assignedEmployeeId, status: "ACTIVE" },
        });
        if (!employee) throw new HttpError(400, "Assigned employee must be active");
      }
      let status: string;
      try {
        status = resolveAssetStatus({
          assignedEmployeeId:
            assignmentScope === "COMPANY" ? null : (body.assignedEmployeeId ?? null),
          requestedStatus: body.status,
        });
      } catch (error) {
        throw new HttpError(400, (error as Error).message);
      }
      const asset = await prisma.companyAsset.create({
        data: {
          ...body,
          assetCode: body.assetCode ?? `ATD-ONL-${randomUUID().slice(0, 8).toUpperCase()}`,
          name: catalogItem?.name ?? body.name,
          category: assetType,
          assignmentScope,
          catalogId: body.catalogId || null,
          serialNumber: body.serialNumber || null,
          assignedEmployeeId:
            assignmentScope === "COMPANY" ? null : body.assignedEmployeeId || null,
          branchId: assetType === "ONLINE" ? null : body.branchId || null,
          status,
        },
        include: { assignedEmployee: true, branch: true },
      });
      await audit({
        action: "company asset created",
        performedByUserId: req.user!.id,
        newValue: { assetId: asset.assetId, assetCode: asset.assetCode },
        ipAddress: req.ip,
      });
      res.status(201).json(companyAssetDto(asset));
    }),
  );

  app.patch(
    "/assets/:id",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = companyAssetUpdateSchema.parse(req.body);
      const existing = await prisma.companyAsset.findUniqueOrThrow({
        where: { assetId: String(req.params.id) },
      });
      const catalogItem = body.catalogId
        ? await prisma.assetCatalogItem.findFirst({
            where: { catalogId: body.catalogId, status: "ACTIVE" },
          })
        : body.catalogId === undefined && existing.catalogId
          ? await prisma.assetCatalogItem.findUnique({
              where: { catalogId: existing.catalogId },
            })
          : undefined;
      if (body.catalogId && !catalogItem) {
        throw new HttpError(400, "Select an active item from Asset Catalog");
      }
      const nextAssetType = body.assetType ?? existing.assetType;
      const catalogType =
        catalogItem?.category === "Company Asset" ? "PHYSICAL" : catalogItem?.category;
      if (catalogType && catalogType !== nextAssetType) {
        throw new HttpError(400, "Asset name does not match the selected asset type");
      }
      if (body.assignedEmployeeId) {
        const employee = await prisma.employee.findFirst({
          where: { employeeId: body.assignedEmployeeId, status: "ACTIVE" },
        });
        if (!employee) throw new HttpError(400, "Assigned employee must be active");
      }
      const nextAssignmentScope = body.assignmentScope ?? existing.assignmentScope;
      if (nextAssignmentScope === "COMPANY" && body.assignedEmployeeId) {
        throw new HttpError(400, "Company-use assets cannot be assigned to an employee");
      }
      const nextAssignedEmployeeId =
        nextAssignmentScope === "COMPANY"
          ? null
          : body.assignedEmployeeId === undefined
            ? existing.assignedEmployeeId
            : body.assignedEmployeeId || null;
      let nextStatus: string;
      try {
        nextStatus = resolveAssetStatus({
          assignedEmployeeId: nextAssignedEmployeeId,
          requestedStatus: body.status,
          previousStatus: existing.status,
        });
      } catch (error) {
        throw new HttpError(400, (error as Error).message);
      }
      const asset = await prisma.companyAsset.update({
        where: { assetId: existing.assetId },
        data: {
          ...body,
          name: catalogItem?.name,
          category:
            body.assetType !== undefined || body.catalogId !== undefined
              ? nextAssetType
              : undefined,
          serialNumber: body.serialNumber === undefined ? undefined : body.serialNumber || null,
          assignedEmployeeId: nextAssignedEmployeeId,
          branchId:
            nextAssetType === "ONLINE"
              ? null
              : body.branchId === undefined
                ? undefined
                : body.branchId || null,
          status: nextStatus,
        },
        include: { assignedEmployee: true, branch: true },
      });
      await audit({
        action: "company asset updated",
        performedByUserId: req.user!.id,
        oldValue: { assignedEmployeeId: existing.assignedEmployeeId, status: existing.status },
        newValue: {
          assetId: asset.assetId,
          assignedEmployeeId: asset.assignedEmployeeId,
          status: asset.status,
        },
        ipAddress: req.ip,
      });
      res.json(companyAssetDto(asset));
    }),
  );

  app.get(
    "/assets/returns/history",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (_req, res) => {
      const rows = await prisma.assetReturn.findMany({
        include: { asset: true, employee: true },
        orderBy: { returnedAt: "desc" },
        take: 500,
      });
      res.json(
        rows.map((row) => ({
          id: row.returnId,
          assetId: row.assetId,
          assetCode: row.asset.assetCode,
          assetName: row.asset.name,
          employeeId: row.employeeId,
          employeeCode: row.employee.employeeCode,
          employeeName: row.employee.name,
          condition: row.condition,
          accessoriesReturned: row.accessoriesReturned,
          chargerReturned: row.chargerReturned,
          dataBackedUp: row.dataBackedUp,
          dataWiped: row.dataWiped,
          physicalDamage: row.physicalDamage,
          damageNotes: row.damageNotes,
          remarks: row.remarks,
          returnedAt: row.returnedAt.toISOString(),
        })),
      );
    }),
  );

  app.post(
    "/assets/:id/return",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = assetReturnSchema.parse(req.body);
      const existing = await prisma.companyAsset.findUniqueOrThrow({
        where: { assetId: String(req.params.id) },
      });
      if (!existing.assignedEmployeeId || existing.status !== "ASSIGNED") {
        throw new HttpError(409, "Only an assigned asset can be returned");
      }
      const result = await prisma.$transaction(async (tx) => {
        const claimed = await tx.companyAsset.updateMany({
          where: {
            assetId: existing.assetId,
            assignedEmployeeId: existing.assignedEmployeeId,
            status: "ASSIGNED",
          },
          data: {
            assignedEmployeeId: null,
            status: body.condition === "NOT_WORKING" ? "UNDER_REPAIR" : "AVAILABLE",
          },
        });
        if (claimed.count !== 1) {
          throw new HttpError(409, "This asset was already returned or reassigned");
        }
        const returned = await tx.assetReturn.create({
          data: {
            assetId: existing.assetId,
            employeeId: existing.assignedEmployeeId!,
            receivedByUserId: req.user!.id,
            ...body,
            damageNotes: body.damageNotes || null,
            remarks: body.remarks || null,
          },
          include: { asset: true, employee: true },
        });
        const asset = await tx.companyAsset.findUniqueOrThrow({
          where: { assetId: existing.assetId },
          include: { assignedEmployee: true, branch: true },
        });
        return { returned, asset };
      });
      await audit({
        action: "company asset returned",
        performedByUserId: req.user!.id,
        oldValue: { assignedEmployeeId: existing.assignedEmployeeId, status: existing.status },
        newValue: { returnId: result.returned.returnId, condition: body.condition },
        ipAddress: req.ip,
      });
      res.status(201).json({
        asset: companyAssetDto(result.asset),
        returnId: result.returned.returnId,
      });
    }),
  );

  app.get(
    "/expense-claims",
    requireAuth,
    asyncHandler(async (req, res) => {
      const canViewAll = ([Role.HR, Role.CEO, Role.DEVELOPER_ADMIN] as Role[]).includes(
        req.user!.role,
      );
      if (!canViewAll && !req.user!.employeeId)
        throw new HttpError(403, "Employee profile required");
      const rows = await prisma.expenseClaim.findMany({
        where: canViewAll ? {} : { employeeId: req.user!.employeeId! },
        include: { employee: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      res.json(
        rows.map((row) => ({
          id: row.claimId,
          employeeId: row.employeeId,
          employeeName: row.employee.name,
          employeeCode: row.employee.employeeCode,
          claimType: row.claimType,
          title: row.title,
          amount: Number(row.amount),
          expenseDate: row.expenseDate?.toISOString().slice(0, 10) ?? null,
          description: row.description,
          remark: row.remark,
          receiptUrl: row.receiptUrl,
          receiptAccessConfirmed: row.receiptAccessConfirmed,
          status: row.status,
          reviewNotes: row.reviewNotes,
          paidAt: row.paidAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
      );
    }),
  );

  app.post(
    "/expense-claims",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = expenseClaimSchema.parse(req.body);
      const canSubmitForEmployee = ([Role.HR, Role.DEVELOPER_ADMIN] as Role[]).includes(
        req.user!.role,
      );
      if (canSubmitForEmployee && !body.employeeId) {
        throw new HttpError(400, "Select the employee who should receive this request");
      }
      const employeeId =
        canSubmitForEmployee && body.employeeId ? body.employeeId : req.user!.employeeId;
      if (!employeeId) throw new HttpError(403, "Employee profile required");
      if (body.employeeId && !canSubmitForEmployee) {
        throw new HttpError(403, "Only HR can submit a request for another employee");
      }
      if (body.expenseDate && body.expenseDate.getTime() > Date.now()) {
        throw new HttpError(400, "Expense date cannot be in the future");
      }
      const activeEmployee = await prisma.employee.findFirst({
        where: { employeeId, status: "ACTIVE" },
        select: { employeeId: true },
      });
      if (!activeEmployee) throw new HttpError(400, "Select an active employee");
      const { employeeId: _requestedEmployeeId, ...claim } = body;
      const row = await prisma.expenseClaim.create({
        data: {
          employeeId,
          ...claim,
          title:
            claim.title ||
            (claim.category
              ? claim.category
                  .toLowerCase()
                  .replaceAll("_", " ")
                  .replace(/\b\w/g, (letter) => letter.toUpperCase())
              : null),
          expenseDate: claim.expenseDate || null,
          description: claim.description || null,
          remark: claim.remark || null,
          receiptUrl: claim.receiptUrl || null,
        },
        include: { employee: true },
      });
      await audit({
        action: "expense claim submitted",
        performedByUserId: req.user!.id,
        newValue: {
          claimId: row.claimId,
          amount: Number(row.amount),
          claimType: row.claimType,
          employeeId,
        },
        ipAddress: req.ip,
      });
      publishNotificationChange("expense-claim-submitted", row.claimId);
      res.status(201).json({ id: row.claimId, status: row.status });
    }),
  );

  app.patch(
    "/expense-claims/:id/review",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = expenseClaimReviewSchema.parse(req.body);
      const existing = await prisma.expenseClaim.findUniqueOrThrow({
        where: { claimId: String(req.params.id) },
      });
      const allowedExpenseTransitions: Record<string, string[]> = {
        PENDING: ["UNPAID", "REJECTED"],
        UNPAID: ["PAID"],
        REJECTED: [],
        PAID: [],
      };
      if (!allowedExpenseTransitions[existing.status]?.includes(body.status)) {
        throw new HttpError(
          409,
          `Cannot change an expense from ${existing.status} to ${body.status}`,
        );
      }
      const reviewedAt = new Date();
      const changed = await prisma.expenseClaim.updateMany({
        where: { claimId: existing.claimId, status: existing.status },
        data: {
          status: body.status,
          reviewNotes: body.reviewNotes || null,
          reviewedByUserId: req.user!.id,
          reviewedAt,
          paidAt: body.status === "PAID" ? reviewedAt : existing.paidAt,
        },
      });
      if (changed.count !== 1) {
        throw new HttpError(409, "This expense was already reviewed");
      }
      const row = await prisma.expenseClaim.findUniqueOrThrow({
        where: { claimId: existing.claimId },
      });
      await audit({
        action: "expense claim reviewed",
        performedByUserId: req.user!.id,
        oldValue: { status: existing.status },
        newValue: { claimId: row.claimId, status: row.status },
        ipAddress: req.ip,
      });
      publishNotificationChange("expense-claim-updated", row.claimId);
      res.json({ id: row.claimId, status: row.status, reviewNotes: row.reviewNotes });
    }),
  );

  app.get(
    "/certificate-requests",
    requireAuth,
    asyncHandler(async (req, res) => {
      const canViewAll = ([Role.HR, Role.CEO, Role.DEVELOPER_ADMIN] as Role[]).includes(
        req.user!.role,
      );
      if (!canViewAll && !req.user!.employeeId)
        throw new HttpError(403, "Employee profile required");
      const rows = await prisma.certificateRequest.findMany({
        where: canViewAll ? {} : { employeeId: req.user!.employeeId! },
        include: { employee: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      res.json(
        rows.map((row) => ({
          id: row.certificateRequestId,
          employeeId: row.employeeId,
          employeeName: row.employee.name,
          employeeCode: row.employee.employeeCode,
          certificateType: row.certificateType,
          purpose: row.purpose,
          deliveryMode: row.deliveryMode,
          requiredBy: row.requiredBy?.toISOString().slice(0, 10) ?? null,
          status: row.status,
          hrNotes: row.hrNotes,
          documentUrl: row.documentUrl,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
      );
    }),
  );

  app.post(
    "/certificate-requests",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(403, "Employee profile required");
      const body = certificateRequestSchema.parse(req.body);
      if (body.requiredBy && body.requiredBy.getTime() < startOfDayUtc(todayIstDate()).getTime()) {
        throw new HttpError(400, "Required-by date cannot be in the past");
      }
      const row = await prisma.certificateRequest.create({
        data: { employeeId: req.user!.employeeId, ...body },
      });
      await audit({
        action: "certificate requested",
        performedByUserId: req.user!.id,
        newValue: { requestId: row.certificateRequestId, type: row.certificateType },
        ipAddress: req.ip,
      });
      publishNotificationChange("certificate-request-submitted", row.certificateRequestId);
      res.status(201).json({ id: row.certificateRequestId, status: row.status });
    }),
  );

  app.patch(
    "/certificate-requests/:id/review",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = certificateRequestReviewSchema.parse(req.body);
      const existing = await prisma.certificateRequest.findUniqueOrThrow({
        where: { certificateRequestId: String(req.params.id) },
      });
      const allowedCertificateTransitions: Record<string, string[]> = {
        PENDING: ["IN_PROGRESS", "REJECTED"],
        IN_PROGRESS: ["READY", "REJECTED"],
        READY: ["COLLECTED"],
        REJECTED: [],
        COLLECTED: [],
      };
      if (!allowedCertificateTransitions[existing.status]?.includes(body.status)) {
        throw new HttpError(
          409,
          `Cannot change a certificate request from ${existing.status} to ${body.status}`,
        );
      }
      if (
        body.status === "READY" &&
        existing.deliveryMode === "DIGITAL" &&
        !(body.documentUrl ?? existing.documentUrl)
      ) {
        throw new HttpError(400, "Add the digital document link before marking it ready");
      }
      const changed = await prisma.certificateRequest.updateMany({
        where: {
          certificateRequestId: existing.certificateRequestId,
          status: existing.status,
        },
        data: {
          status: body.status,
          hrNotes: body.hrNotes === undefined ? existing.hrNotes : body.hrNotes || null,
          documentUrl:
            body.documentUrl === undefined ? existing.documentUrl : body.documentUrl || null,
          reviewedByUserId: req.user!.id,
          completedAt: ["READY", "COLLECTED"].includes(body.status) ? new Date() : null,
        },
      });
      if (changed.count !== 1) {
        throw new HttpError(409, "This HR document request was already reviewed");
      }
      const row = await prisma.certificateRequest.findUniqueOrThrow({
        where: { certificateRequestId: existing.certificateRequestId },
      });
      await audit({
        action: "certificate request reviewed",
        performedByUserId: req.user!.id,
        oldValue: { status: existing.status },
        newValue: { requestId: row.certificateRequestId, status: row.status },
        ipAddress: req.ip,
      });
      publishNotificationChange("certificate-request-updated", row.certificateRequestId);
      res.json({ id: row.certificateRequestId, status: row.status });
    }),
  );

  app.post(
    "/branches",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = branchSchema.parse(req.body);
      if ((body.latitude == null) !== (body.longitude == null)) {
        throw new HttpError(400, "Latitude and longitude must be provided together");
      }
      const branch = await prisma.branch.create({
        data: {
          branchName: body.name,
          branchCode: body.code,
          address: body.address,
          city: body.city ?? undefined,
          status: body.status ?? "ACTIVE",
          latitude: body.latitude,
          longitude: body.longitude,
          attendanceRadiusMeters: body.attendanceRadiusMeters,
        },
      });
      await audit({
        action: "branch created",
        performedByUserId: req.user!.id,
        newValue: { branchId: branch.branchId, name: branch.branchName },
        ipAddress: req.ip,
      });
      res.status(201).json(branchDto(branch));
    }),
  );

  app.patch(
    "/branches/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = branchUpdateSchema.parse(req.body);
      const changesLatitude = body.latitude !== undefined;
      const changesLongitude = body.longitude !== undefined;
      if (
        changesLatitude !== changesLongitude ||
        (body.latitude == null) !== (body.longitude == null)
      ) {
        throw new HttpError(400, "Latitude and longitude must be updated together");
      }
      const branch = await prisma.branch.update({
        where: { branchId: String(req.params.id) },
        data: {
          branchName: body.name,
          branchCode: body.code,
          address: body.address,
          city: body.city,
          status: body.status,
          latitude: body.latitude,
          longitude: body.longitude,
          attendanceRadiusMeters: body.attendanceRadiusMeters,
        },
      });
      await audit({
        action: "branch updated",
        performedByUserId: req.user!.id,
        newValue: { branchId: branch.branchId, name: branch.branchName, status: branch.status },
        ipAddress: req.ip,
      });
      res.json(branchDto(branch));
    }),
  );

  app.delete(
    "/branches/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const branch = await prisma.branch.update({
        where: { branchId: String(req.params.id) },
        data: { status: "DELETED" },
      });
      await audit({
        action: "branch deleted",
        performedByUserId: req.user!.id,
        newValue: { branchId: branch.branchId, name: branch.branchName },
        ipAddress: req.ip,
      });
      res.json(branchDto(branch));
    }),
  );

  app.get(
    "/departments",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.CEO, Role.HR, Role.MANAGER),
    asyncHandler(async (_req, res) => {
      const departments = await prisma.department.findMany({
        include: { headEmployee: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      res.json(departments.map(departmentDto));
    }),
  );

  app.post(
    "/departments",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = departmentSchema.parse(req.body);
      await assertValidDepartmentHead(body.headEmployeeId);
      if (body.parentDepartmentId) {
        await prisma.department.findUniqueOrThrow({
          where: { departmentId: body.parentDepartmentId },
        });
      }
      const department = await prisma.department.create({
        data: {
          name: body.name,
          headEmployeeId: body.headEmployeeId ?? undefined,
          parentDepartmentId: body.parentDepartmentId ?? undefined,
          unitType: body.unitType ?? "TEAM",
          sortOrder: body.sortOrder ?? 0,
        },
        include: { headEmployee: true },
      });
      await audit({
        action: "department created",
        performedByUserId: req.user!.id,
        newValue: {
          departmentId: department.departmentId,
          name: department.name,
          headEmployeeId: department.headEmployeeId,
        },
        ipAddress: req.ip,
      });
      res.status(201).json(departmentDto(department));
    }),
  );

  app.patch(
    "/departments/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = departmentUpdateSchema.parse(req.body);
      await assertValidDepartmentHead(body.headEmployeeId);
      const existing = await prisma.department.findUniqueOrThrow({
        where: { departmentId: String(req.params.id) },
      });
      if (body.parentDepartmentId === existing.departmentId) {
        throw new HttpError(400, "An organizational unit cannot be its own parent");
      }
      if (body.parentDepartmentId) {
        let cursor: string | null = body.parentDepartmentId;
        while (cursor) {
          if (cursor === existing.departmentId)
            throw new HttpError(400, "This parent would create a hierarchy cycle");
          const parent: { parentDepartmentId: string | null } | null =
            await prisma.department.findUnique({
              where: { departmentId: cursor },
              select: { parentDepartmentId: true },
            });
          cursor = parent?.parentDepartmentId ?? null;
        }
      }
      const department = await prisma.department.update({
        where: { departmentId: String(req.params.id) },
        data: {
          name: body.name,
          headEmployeeId: body.headEmployeeId,
          parentDepartmentId: body.parentDepartmentId,
          unitType: body.unitType,
          sortOrder: body.sortOrder,
        },
        include: { headEmployee: true },
      });
      await audit({
        action: "department updated",
        performedByUserId: req.user!.id,
        oldValue: { name: existing.name, headEmployeeId: existing.headEmployeeId },
        newValue: {
          departmentId: department.departmentId,
          name: department.name,
          headEmployeeId: department.headEmployeeId,
        },
        ipAddress: req.ip,
      });
      res.json(departmentDto(department));
    }),
  );

  app.delete(
    "/departments/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const employeeCount = await prisma.employee.count({
        where: { departmentId: String(req.params.id) },
      });
      if (employeeCount > 0) throw new HttpError(400, "Department has employees assigned");
      const childCount = await prisma.department.count({
        where: { parentDepartmentId: String(req.params.id) },
      });
      if (childCount > 0) throw new HttpError(400, "Move or delete child units first");
      const department = await prisma.department.delete({
        where: { departmentId: String(req.params.id) },
      });
      await audit({
        action: "department deleted",
        performedByUserId: req.user!.id,
        newValue: {
          departmentId: department.departmentId,
          name: department.name,
          headEmployeeId: department.headEmployeeId,
        },
        ipAddress: req.ip,
      });
      res.json(departmentDto({ ...department, headEmployee: null }));
    }),
  );

  app.get(
    "/biometric/devices",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (_req, res) => {
      const devices = await prisma.biometricDevice.findMany({ orderBy: { deviceName: "asc" } });
      res.json(devices.map(deviceDto));
    }),
  );

  app.post(
    "/biometric/devices",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = biometricDeviceSchema.parse(req.body);
      const device = await prisma.biometricDevice.create({
        data: {
          deviceName: body.name,
          deviceCode: body.code,
          branchId: body.branchId,
          deviceIp: body.deviceIp ?? undefined,
          port: body.port ?? undefined,
          location: body.location ?? undefined,
          status: body.status ?? "ACTIVE",
        },
      });
      await audit({
        action: "biometric device created",
        performedByUserId: req.user!.id,
        newValue: { deviceId: device.deviceId, code: device.deviceCode },
        ipAddress: req.ip,
      });
      res.status(201).json(deviceDto(device));
    }),
  );

  app.patch(
    "/biometric/devices/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = biometricDeviceUpdateSchema.parse(req.body);
      const device = await prisma.biometricDevice.update({
        where: { deviceId: String(req.params.id) },
        data: {
          deviceName: body.name,
          deviceCode: body.code,
          branchId: body.branchId,
          deviceIp: body.deviceIp,
          port: body.port,
          location: body.location,
          status: body.status,
        },
      });
      await audit({
        action: "biometric device updated",
        performedByUserId: req.user!.id,
        newValue: { deviceId: device.deviceId, code: device.deviceCode, status: device.status },
        ipAddress: req.ip,
      });
      res.json(deviceDto(device));
    }),
  );

  app.delete(
    "/biometric/devices/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const device = await prisma.biometricDevice.update({
        where: { deviceId: String(req.params.id) },
        data: { status: "INACTIVE" },
      });
      await audit({
        action: "biometric device deactivated",
        performedByUserId: req.user!.id,
        newValue: { deviceId: device.deviceId, code: device.deviceCode },
        ipAddress: req.ip,
      });
      res.json(deviceDto(device));
    }),
  );

  app.get(
    "/biometric/mappings",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (_req, res) => {
      const mappings = await prisma.biometricEmployeeMapping.findMany({
        include: { employee: true, device: true },
        orderBy: { updatedAt: "desc" },
      });
      res.json(mappings.map(biometricMappingDto));
    }),
  );

  app.post(
    "/biometric/mappings",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = biometricMappingSchema.parse(req.body);
      await prisma.employee.findUniqueOrThrow({ where: { employeeId: body.employeeId } });
      if (body.deviceId) {
        await prisma.biometricDevice.findUniqueOrThrow({ where: { deviceId: body.deviceId } });
      }
      const existing = await prisma.biometricEmployeeMapping.findFirst({
        where: {
          employeeId: body.employeeId,
          deviceId: body.deviceId ?? null,
        },
      });
      const mapping = existing
        ? await prisma.biometricEmployeeMapping.update({
            where: { mappingId: existing.mappingId },
            data: {
              biometricUserId: body.biometricUserId,
              deviceId: body.deviceId ?? null,
              status: body.status ?? "ACTIVE",
            },
            include: { employee: true, device: true },
          })
        : await prisma.biometricEmployeeMapping.create({
            data: {
              employeeId: body.employeeId,
              biometricUserId: body.biometricUserId,
              deviceId: body.deviceId ?? null,
              status: body.status ?? "ACTIVE",
            },
            include: { employee: true, device: true },
          });
      await audit({
        action: existing ? "biometric mapping updated" : "biometric mapping created",
        performedByUserId: req.user!.id,
        newValue: {
          employeeId: mapping.employeeId,
          biometricUserId: mapping.biometricUserId,
          deviceId: mapping.deviceId,
        },
        ipAddress: req.ip,
      });
      res.status(existing ? 200 : 201).json(biometricMappingDto(mapping));
    }),
  );

  app.patch(
    "/biometric/mappings/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const body = biometricMappingUpdateSchema.parse(req.body);
      if (body.employeeId) {
        await prisma.employee.findUniqueOrThrow({ where: { employeeId: body.employeeId } });
      }
      if (body.deviceId) {
        await prisma.biometricDevice.findUniqueOrThrow({ where: { deviceId: body.deviceId } });
      }
      const mapping = await prisma.biometricEmployeeMapping.update({
        where: { mappingId: id },
        data: {
          employeeId: body.employeeId,
          biometricUserId: body.biometricUserId,
          deviceId: body.deviceId === undefined ? undefined : body.deviceId,
          status: body.status,
        },
        include: { employee: true, device: true },
      });
      await audit({
        action: "biometric mapping updated",
        performedByUserId: req.user!.id,
        newValue: { mappingId: id, status: mapping.status },
        ipAddress: req.ip,
      });
      res.json(biometricMappingDto(mapping));
    }),
  );

  app.delete(
    "/biometric/mappings/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const mapping = await prisma.biometricEmployeeMapping.update({
        where: { mappingId: id },
        data: { status: "INACTIVE" },
        include: { employee: true, device: true },
      });
      await audit({
        action: "biometric mapping deactivated",
        performedByUserId: req.user!.id,
        newValue: { mappingId: id },
        ipAddress: req.ip,
      });
      res.json(biometricMappingDto(mapping));
    }),
  );

  app.post(
    "/attendance/thumb/event",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.HR, Role.MAIN_ADMIN),
    asyncHandler(async (req, res) => {
      const body = thumbEventSchema.parse(req.body);
      const event = await createAttendanceEvent({
        employeeId: body.employeeId,
        branchId: body.branchId,
        deviceId: body.deviceId,
        eventTime: body.eventTime,
        eventType: body.eventType,
        eventSource: EventSource.THUMB_SCANNER,
        rawPayload: body.rawPayload as never,
        createdByUserId: req.user!.id,
      });
      await audit({
        action: "attendance event created",
        performedByUserId: req.user!.id,
        newValue: { eventId: event.eventId, source: event.eventSource },
        ipAddress: req.ip,
      });
      res.status(201).json(event);
    }),
  );

  app.get("/attendance/stream", requireAuth, openAttendanceStream);

  app.post(
    "/attendance/thumb/import-csv",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.HR, Role.MAIN_ADMIN),
    asyncHandler(async (req, res) => {
      const rows = parse(String(req.body), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<Record<string, string>>;

      const csvRowSchema = z.object({
        employeeId: z.string().min(1, "employeeId is required"),
        branchId: z.string().min(1, "branchId is required"),
        deviceId: z.string().optional(),
        eventTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
          message: "Invalid eventTime date format",
        }),
      });

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const parsed = csvRowSchema.safeParse(row);
        if (!parsed.success) {
          throw new HttpError(
            400,
            `CSV validation failed at row ${i + 1}: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
          );
        }
      }

      for (const row of rows) {
        await createAttendanceEvent({
          employeeId: row.employeeId,
          branchId: row.branchId,
          deviceId: row.deviceId || undefined,
          eventTime: row.eventTime ? new Date(row.eventTime) : undefined,
          eventSource: EventSource.THUMB_SCANNER,
          rawPayload: row,
          createdByUserId: req.user!.id,
        });
      }
      res.json({ imported: rows.length });
    }),
  );

  async function mobileEvent(
    req: express.Request,
    res: express.Response,
    type: EventType,
    workType: WorkType,
  ) {
    const body = (
      type === EventType.CLIENT_CHECK_IN || type === EventType.CLIENT_CHECK_OUT
        ? clientEventSchema
        : mobileEventSchema
    ).parse(req.body);
    const employeeId = body.employeeId ?? req.user?.employeeId;
    if (!employeeId) throw new HttpError(400, "employeeId is required");
    if (!req.user?.employeeId || employeeId !== req.user.employeeId) {
      throw new HttpError(403, "Mobile attendance can only be recorded for your own profile");
    }
    await assertEmployeeAccess(req.user, employeeId);
    const isCheckOut = type === EventType.FIELD_CHECK_OUT || type === EventType.CLIENT_CHECK_OUT;
    const faceSettings = await readFaceSettings();
    if (body.locationAccuracy > faceSettings.maxGpsAccuracyMeters) {
      throw new HttpError(
        422,
        `Location accuracy must be within ${faceSettings.maxGpsAccuracyMeters} metres.`,
      );
    }
    let nearbyBranchId: string | undefined;
    if (workType === WorkType.FIELD) {
      const configuredBranches = await prisma.branch.findMany({
        where: { status: "ACTIVE", latitude: { not: null }, longitude: { not: null } },
        select: {
          branchId: true,
          branchName: true,
          latitude: true,
          longitude: true,
          attendanceRadiusMeters: true,
        },
      });
      if (configuredBranches.length) {
        const nearest = nearestBranch(
          { latitude: body.latitude, longitude: body.longitude },
          configuredBranches.map((branch) => ({
            ...branch,
            latitude: Number(branch.latitude),
            longitude: Number(branch.longitude),
          })),
        );
        if (nearest && nearest.distance <= nearest.branch.attendanceRadiusMeters) {
          nearbyBranchId = nearest.branch.branchId;
        }
      }
    }
    const eventDate = await attendanceDateForEmployee(employeeId, body.eventTime ?? new Date());
    if (!isCheckOut) {
      const unresolvedPreviousDay = await prisma.attendanceDailySummary.findFirst({
        where: {
          employeeId,
          date: { lt: eventDate },
          hasMissingOutEvent: true,
        },
        orderBy: { date: "desc" },
        select: { date: true },
      });
      if (unresolvedPreviousDay) {
        throw new HttpError(
          409,
          `Your attendance for ${unresolvedPreviousDay.date.toISOString().slice(0, 10)} has a missing checkout. Submit a missed-punch correction before checking in again.`,
        );
      }
    }
    const latestEvent = await prisma.attendanceEvent.findFirst({
      where: { employeeId, eventType: { in: attendancePunchEventTypes } },
      orderBy: { eventTime: "desc" },
    });
    const transitionIssue = attendanceTransitionIssue(latestEvent, eventDate, isCheckOut);
    if (transitionIssue) throw new HttpError(409, transitionIssue);
    let approvedLeave: Awaited<ReturnType<typeof findApprovedLeaveForDay>> | null | undefined =
      null;
    if (!isCheckOut) {
      approvedLeave = await findApprovedLeaveForDay(employeeId, eventDate, true).then(
        (paidLeave) => paidLeave ?? findApprovedLeaveForDay(employeeId, eventDate, false),
      );
      if (approvedLeave && !body.confirmLeaveCancellation) {
        throw new HttpError(
          409,
          "You are on approved leave today. Confirm check-in to cancel leave for this date.",
        );
      }
    }
    let verifiedFace: Awaited<ReturnType<typeof verifyFaceCapture>> | null = null;
    if (!isCheckOut && faceSettings.verificationEnabled) {
      if (!body.faceVerification) {
        throw new HttpError(400, "Live face verification is required for check-in");
      }
      verifiedFace = await verifyFaceCapture({
        userId: req.user!.id,
        employeeId,
        expectedPurpose: FaceVerificationPurpose.ATTENDANCE_CHECK_IN,
        capture: faceCaptureSchema.parse({
          ...body.faceVerification,
          latitude: body.latitude,
          longitude: body.longitude,
          locationAccuracy: body.locationAccuracy,
        }),
      });
    }
    const matchingCheckOut = (checkInType: EventType): EventType => {
      switch (checkInType) {
        case EventType.OFFICE_IN:
        case EventType.BRANCH_IN:
          return EventType.OFFICE_OUT;
        case EventType.FIELD_CHECK_IN:
        case EventType.CLIENT_CHECK_IN:
          return EventType.FIELD_CHECK_OUT;
        case EventType.BREAK_IN:
          return EventType.BREAK_OUT;
        default:
          return EventType.FIELD_CHECK_OUT;
      }
    };
    const resolvedType = isCheckOut && latestEvent ? matchingCheckOut(latestEvent.eventType) : type;
    const clientBody = body as Partial<{
      clientName: string;
      clientLocationName: string;
      photoUrl: string;
    }>;
    let event: Awaited<ReturnType<typeof createAttendanceEvent>>;
    try {
      event = await createAttendanceEvent({
        employeeId,
        branchId: nearbyBranchId,
        eventSource: EventSource.MOBILE_GPS,
        eventType: resolvedType,
        eventTime: body.eventTime,
        latitude: body.latitude,
        longitude: body.longitude,
        address: body.address,
        mobileDeviceId: body.mobileDeviceId,
        remarks: body.remarks,
        workType,
        clientName: clientBody.clientName,
        clientLocationName: clientBody.clientLocationName,
        photoUrl: clientBody.photoUrl,
        createdByUserId: req.user!.id,
      });
      if (verifiedFace) {
        await prisma.faceEvidence.update({
          where: { evidenceId: verifiedFace.evidence.evidenceId },
          data: { attendanceEventId: event.eventId },
        });
      }
    } catch (error) {
      if (verifiedFace) {
        await prisma.faceEvidence
          .update({
            where: { evidenceId: verifiedFace.evidence.evidenceId },
            data: {
              outcome: "FAILED",
              failureReason: "Attendance event creation failed after identity verification",
            },
          })
          .catch((evidenceError) =>
            console.error("Failed to mark unlinked face evidence as failed", evidenceError),
          );
      }
      throw error;
    }
    if (approvedLeave) await cancelApprovedLeaveForDay(employeeId, eventDate);
    res.status(201).json(event);
  }

  app.post(
    "/attendance/mobile/check-in",
    requireAuth,
    asyncHandler((req, res) => mobileEvent(req, res, EventType.FIELD_CHECK_IN, WorkType.FIELD)),
  );
  app.post(
    "/attendance/mobile/check-out",
    requireAuth,
    asyncHandler((req, res) => mobileEvent(req, res, EventType.FIELD_CHECK_OUT, WorkType.FIELD)),
  );
  app.post(
    "/attendance/client/check-in",
    requireAuth,
    asyncHandler((req, res) =>
      mobileEvent(req, res, EventType.CLIENT_CHECK_IN, WorkType.CLIENT_VISIT),
    ),
  );
  app.post(
    "/attendance/client/check-out",
    requireAuth,
    asyncHandler((req, res) =>
      mobileEvent(req, res, EventType.CLIENT_CHECK_OUT, WorkType.CLIENT_VISIT),
    ),
  );

  type AttendanceSummaryRow = Prisma.AttendanceDailySummaryGetPayload<{
    include: { employee: true };
  }>;

  async function mapSummariesToDtos(summaries: AttendanceSummaryRow | AttendanceSummaryRow[]) {
    const isArray = Array.isArray(summaries);
    const list = isArray ? summaries : [summaries];
    if (list.length === 0) return [];

    const employeeIds = list.map((s) => s.employeeId);
    const dates = list.map((s) => s.date);

    const events = await prisma.attendanceEvent.findMany({
      where: {
        employeeId: { in: employeeIds },
        eventDate: { in: dates },
      },
      orderBy: { eventTime: "asc" },
      include: { branch: true },
    });

    const dtos = list.map((summary) => {
      const summaryEvents = events.filter(
        (e) =>
          e.employeeId === summary.employeeId &&
          e.eventDate.toISOString().slice(0, 10) === summary.date.toISOString().slice(0, 10),
      );

      const inEventTypes = new Set<EventType>([
        EventType.OFFICE_IN,
        EventType.BRANCH_IN,
        EventType.FIELD_CHECK_IN,
        EventType.CLIENT_CHECK_IN,
      ]);
      const outEventTypes = new Set<EventType>([
        EventType.OFFICE_OUT,
        EventType.BRANCH_OUT,
        EventType.FIELD_CHECK_OUT,
        EventType.CLIENT_CHECK_OUT,
      ]);
      const firstInEvent = summaryEvents.find((event) => inEventTypes.has(event.eventType));
      const lastOutEvent = [...summaryEvents]
        .reverse()
        .find((event) => outEventTypes.has(event.eventType));

      const sourceLabel = (event: (typeof summaryEvents)[number] | undefined) =>
        event?.eventSource === "THUMB_SCANNER"
          ? "Thumb Scanner"
          : event?.eventSource === "MOBILE_GPS"
            ? "Mobile GPS"
            : undefined;

      const dto = attendanceRecordDto(summary);

      return {
        ...dto,
        latestOpenPunchAt:
          summary.hasMissingOutEvent && summaryEvents.length
            ? summaryEvents.at(-1)?.eventTime.toISOString()
            : undefined,
        punchInSource: sourceLabel(firstInEvent),
        punchInBranchId: firstInEvent?.branchId ?? undefined,
        punchOutSource: sourceLabel(lastOutEvent),
        punchOutBranchId: lastOutEvent?.branchId ?? undefined,
      };
    });

    return isArray ? dtos : dtos[0];
  }

  app.get(
    "/attendance/my/today",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(404, "No employee profile");
      const attendanceDate = await attendanceDateForEmployee(req.user!.employeeId, new Date());
      const today = attendanceDate.toISOString().slice(0, 10);
      await recalculateDailySummary(req.user!.employeeId, attendanceDate);
      const summary = await prisma.attendanceDailySummary.findUnique({
        where: {
          employeeId_date: {
            employeeId: req.user!.employeeId,
            date: new Date(`${today}T00:00:00.000Z`),
          },
        },
        include: { employee: true },
      });
      res.json(summary ? await mapSummariesToDtos(summary) : null);
    }),
  );

  app.get(
    "/attendance/my/timeline",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(404, "No employee profile");
      const currentAttendanceDate = await attendanceDateForEmployee(
        req.user!.employeeId,
        new Date(),
      );
      const date = String(req.query.date ?? currentAttendanceDate.toISOString().slice(0, 10));
      const events = await prisma.attendanceEvent.findMany({
        where: { employeeId: req.user!.employeeId, eventDate: new Date(`${date}T00:00:00.000Z`) },
        include: { branch: true, device: true },
        orderBy: { eventTime: "asc" },
      });
      res.json(events.map(eventDto));
    }),
  );

  app.get(
    "/attendance/my/report",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(404, "No employee profile");
      await settleExpiredOpenPunches(req.user!.employeeId);
      const from = dateFromQuery(req.query.from);
      const to = dateFromQuery(req.query.to);
      const rows = await prisma.attendanceDailySummary.findMany({
        where: {
          employeeId: req.user!.employeeId,
          ...(from || to ? { date: { gte: from, lte: to } } : {}),
        },
        include: { employee: true },
        orderBy: { date: "desc" },
        skip: listOffset(req),
        take: listLimit(req, 120, 366),
      });
      res.json(await mapSummariesToDtos(rows));
    }),
  );

  app.get(
    "/attendance/team/today",
    requireAuth,
    requireRoles(Role.MANAGER, Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const date = new Date(new Date().toISOString().slice(0, 10));
      const where: Prisma.AttendanceDailySummaryWhereInput =
        req.user!.role === Role.MANAGER && req.user!.employeeId
          ? {
              date,
              employee: employeeAttendanceVisibilityFilter({
                employeeId: { in: await getOrganizationTeamEmployeeIds(req.user!.employeeId) },
              }),
            }
          : { date, employee: employeeAttendanceVisibilityFilter() };
      const rows = await prisma.attendanceDailySummary.findMany({
        where,
        include: { employee: true },
        orderBy: { employeeId: "asc" },
        skip: listOffset(req),
        take: listLimit(req, 750, 1000),
      });
      res.json(await mapSummariesToDtos(rows));
    }),
  );

  app.get(
    "/attendance/team/timeline",
    requireAuth,
    asyncHandler(async (req, res) => {
      const employeeId = String(req.query.employeeId ?? "");
      const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
      await assertEmployeeAccess(req.user, employeeId);
      const events = await prisma.attendanceEvent.findMany({
        where: { employeeId, eventDate: new Date(`${date}T00:00:00.000Z`) },
        include: { branch: true, device: true },
        orderBy: { eventTime: "asc" },
      });
      res.json(events.map(eventDto));
    }),
  );

  app.get(
    "/attendance/hr/daily",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN, Role.CEO, Role.MANAGER),
    asyncHandler(async (req, res) => {
      const where = attendanceWhereFromQuery(req);
      if (req.user!.role === Role.MANAGER && req.user!.employeeId) {
        const departmentId =
          typeof req.query.departmentId === "string" ? req.query.departmentId : undefined;
        where.employee = employeeAttendanceVisibilityFilter({
          employeeId: { in: await getOrganizationTeamEmployeeIds(req.user!.employeeId) },
          ...(departmentId ? { departmentId } : {}),
        });
      }

      const employeeId =
        typeof req.query.employeeId === "string" ? req.query.employeeId : undefined;
      const from = dateFromQuery(req.query.from ?? req.query.dateFrom);
      const to = dateFromQuery(req.query.to ?? req.query.dateTo);
      if (employeeId && from && to) {
        await ensureDailySummariesForRange(employeeId, from, to, recalculateDailySummary);
      }

      const rows = await prisma.attendanceDailySummary.findMany({
        where,
        include: { employee: true },
        orderBy: { date: "desc" },
        skip: listOffset(req),
        take: req.query.limit === "none" ? undefined : listLimit(req, 500, 1000),
      });
      res.json(await mapSummariesToDtos(rows));
    }),
  );

  app.get(
    "/reports/attendance",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN, Role.CEO),
    asyncHandler(async (_req, res) => {
      const employeeVisibility = employeeAttendanceVisibilityFilter({ status: "ACTIVE" });
      const summaryVisibility = { employee: employeeAttendanceVisibilityFilter() };
      const [totalEmployees, present, absent, onLeave] = await Promise.all([
        prisma.employee.count({ where: employeeVisibility }),
        prisma.attendanceDailySummary.count({
          where: { ...summaryVisibility, status: { startsWith: "Present" } },
        }),
        prisma.attendanceDailySummary.count({
          where: { ...summaryVisibility, status: "Absent" },
        }),
        prisma.attendanceDailySummary.count({
          where: { ...summaryVisibility, status: { contains: "Leave" } },
        }),
      ]);
      res.json({ totalEmployees, present, absent, onLeave });
    }),
  );

  for (const path of [
    "/attendance/hr/branch-wise",
    "/attendance/hr/field",
    "/attendance/hr/client-visits",
    "/reports/movement",
    "/reports/branch-wise",
    "/reports/multi-branch",
    "/reports/field",
    "/reports/client-visits",
    "/reports/late",
    "/reports/absent",
    "/reports/payroll",
  ]) {
    app.get(
      path,
      requireAuth,
      requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN, Role.CEO, Role.MANAGER),
      asyncHandler(async (req, res) => {
        const where = attendanceWhereFromQuery(req);
        const existingOr = where.OR;
        const specializedOr: Prisma.AttendanceDailySummaryWhereInput[] = [];
        if (path.includes("branch-wise")) {
          where.primaryAttendedBranchId = { not: null };
          where.NOT = [{ status: { contains: "Field" } }];
        }
        if (path.includes("field")) {
          where.primaryAttendedBranchId = null;
          specializedOr.push({ status: { contains: "Field" } });
        }
        if (specializedOr.length) {
          delete where.OR;
          where.AND = [...(existingOr ? [{ OR: existingOr }] : []), { OR: specializedOr }];
        }
        if (path.includes("client-visits")) where.clientVisitCount = { gt: 0 };
        if (path.includes("multi-branch") || path.includes("movement")) {
          where.branchMovementCount = { gt: 0 };
        }
        if (req.user!.role === Role.MANAGER && req.user!.employeeId) {
          const departmentId =
            typeof req.query.departmentId === "string" ? req.query.departmentId : undefined;
          where.employee = employeeAttendanceVisibilityFilter({
            employeeId: { in: await getOrganizationTeamEmployeeIds(req.user!.employeeId) },
            ...(departmentId ? { departmentId } : {}),
          });
        }
        const rows = await prisma.attendanceDailySummary.findMany({
          where,
          include: { employee: true },
          orderBy: { date: "desc" },
          skip: listOffset(req),
          take: listLimit(req, 500, 1000),
        });
        res.json(await mapSummariesToDtos(rows));
      }),
    );
  }

  app.get(
    "/reports/leave",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN, Role.CEO, Role.MANAGER),
    asyncHandler(async (req, res) => {
      const where: Prisma.LeaveRequestWhereInput = {};
      const from = dateFromQuery(req.query.from ?? req.query.dateFrom);
      const to = dateFromQuery(req.query.to ?? req.query.dateTo);
      if (from || to) {
        where.fromDate = { gte: from };
        where.toDate = { lte: to };
      }
      if (typeof req.query.employeeId === "string") where.employeeId = req.query.employeeId;
      if (typeof req.query.status === "string") where.status = req.query.status as never;
      if (req.user!.role === Role.MANAGER && req.user!.employeeId) {
        where.employee = {
          employeeId: { in: await getOrganizationTeamEmployeeIds(req.user!.employeeId) },
        };
      }
      const rows = await prisma.leaveRequest.findMany({
        where,
        include: { leaveType: true, employee: { include: { manager: true } } },
        orderBy: { createdAt: "desc" },
        skip: listOffset(req),
        take: listLimit(req, 500, 1000),
      });
      res.json(await leaveRequestDtos(rows));
    }),
  );

  app.get(
    "/reports/employee-attendance",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN, Role.CEO, Role.MANAGER),
    asyncHandler(async (req, res) => {
      const where = attendanceWhereFromQuery(req);
      if (req.user!.role === Role.MANAGER && req.user!.employeeId) {
        const departmentId =
          typeof req.query.departmentId === "string" ? req.query.departmentId : undefined;
        where.employee = employeeAttendanceVisibilityFilter({
          employeeId: { in: await getOrganizationTeamEmployeeIds(req.user!.employeeId) },
          ...(departmentId ? { departmentId } : {}),
        });
      }
      const rows = await prisma.attendanceDailySummary.findMany({
        where,
        include: { employee: true },
        orderBy: [{ date: "desc" }, { employeeId: "asc" }],
        skip: listOffset(req),
        take: listLimit(req, 500, 1000),
      });
      res.json(await mapSummariesToDtos(rows));
    }),
  );

  app.get(
    "/reports/timeline",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN, Role.CEO, Role.MANAGER),
    asyncHandler(async (req, res) => {
      const where = attendanceEventWhereFromQuery(req);
      if (req.user!.role === Role.MANAGER && req.user!.employeeId) {
        const departmentId =
          typeof req.query.departmentId === "string" ? req.query.departmentId : undefined;
        where.employee = employeeAttendanceVisibilityFilter({
          employeeId: { in: await getOrganizationTeamEmployeeIds(req.user!.employeeId) },
          ...(departmentId ? { departmentId } : {}),
        });
      }
      const events = await prisma.attendanceEvent.findMany({
        where,
        include: { branch: true, device: true, employee: true },
        orderBy: [{ eventTime: "desc" }],
        skip: listOffset(req),
        take: listLimit(req, 1000, 2000),
      });
      res.json(events.map(eventDto));
    }),
  );

  app.post(
    "/attendance/recalculate/:employeeId/:date",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const employeeId = String(req.params.employeeId);
      const date = String(req.params.date);
      const summary = await recalculateDailySummary(employeeId, date);
      const refreshed = await prisma.attendanceDailySummary.findUniqueOrThrow({
        where: {
          employeeId_date: {
            employeeId: summary.employeeId,
            date: summary.date,
          },
        },
        include: { employee: true },
      });
      await audit({
        action: "attendance corrected",
        performedByUserId: req.user!.id,
        newValue: { employeeId, date },
        ipAddress: req.ip,
      });
      res.json(await mapSummariesToDtos(refreshed));
    }),
  );

  app.post(
    "/attendance/correction-request",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = correctionSchema.parse(req.body);
      await assertEmployeeAccess(req.user, body.employeeId);
      if (body.punchTime.getTime() > Date.now()) {
        throw new HttpError(
          400,
          "Punch time must be in the past. You can only request corrections for already completed times.",
        );
      }

      const approver = await findLeaveApprover(body.employeeId);
      if (!approver) {
        throw new HttpError(
          400,
          "No organization head is available for this punch request. Contact HR to complete the organization chart.",
        );
      }

      const request = await prisma.attendanceCorrectionRequest.create({
        data: {
          employeeId: body.employeeId,
          date: body.date,
          punchTime: body.punchTime,
          eventType: body.eventType,
          remarks: body.remarks,
          status: "PENDING",
          approverId: approver.employeeId,
        },
      });

      await audit({
        action: "attendance correction requested",
        performedByUserId: req.user!.id,
        newValue: body as never,
        ipAddress: req.ip,
      });
      publishNotificationChange("attendance-correction-requested", request.requestId);

      res.status(201).json({
        ok: true,
        requestId: request.requestId,
        status: request.status,
        approverName: approver.name,
      });
    }),
  );

  app.get(
    "/attendance/correction-requests",
    requireAuth,
    asyncHandler(async (req, res) => {
      const isHrOrAdmin = (
        [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR, Role.CEO] as Role[]
      ).includes(req.user!.role);
      const where: Prisma.AttendanceCorrectionRequestWhereInput = {};
      if (!isHrOrAdmin && req.user!.employeeId) {
        const teamEmployeeIds = await getOrganizationTeamEmployeeIds(req.user!.employeeId);
        where.OR = [
          { employeeId: req.user!.employeeId },
          { approverId: req.user!.employeeId },
          { approverId: null, employeeId: { in: teamEmployeeIds } },
        ];
      } else if (!isHrOrAdmin) {
        where.employeeId = req.user!.employeeId ?? "__none__";
      }

      const requests = await prisma.attendanceCorrectionRequest.findMany({
        where,
        include: {
          employee: {
            select: { name: true, employeeCode: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const visibleRequests = [];
      const approverNames = new Map<string, string | null>();
      for (const request of requests) {
        const resolvedApproverId =
          request.approverId ?? (await findLeaveApprover(request.employeeId))?.employeeId ?? null;
        if (resolvedApproverId && !approverNames.has(resolvedApproverId)) {
          const approver = await prisma.employee.findUnique({
            where: { employeeId: resolvedApproverId },
            select: { name: true },
          });
          approverNames.set(resolvedApproverId, approver?.name ?? null);
        }
        if (!request.approverId && resolvedApproverId && request.status === "PENDING") {
          await prisma.attendanceCorrectionRequest.update({
            where: { requestId: request.requestId },
            data: { approverId: resolvedApproverId },
          });
        }
        if (
          !isHrOrAdmin &&
          request.employeeId !== req.user!.employeeId &&
          resolvedApproverId !== req.user!.employeeId
        ) {
          continue;
        }
        visibleRequests.push({
          id: request.requestId,
          employeeId: request.employeeId,
          employeeName: request.employee?.name ?? request.employeeId,
          employeeCode: request.employee?.employeeCode,
          date: request.date.toISOString().slice(0, 10),
          punchTime: request.punchTime.toISOString(),
          eventType: request.eventType,
          remarks: request.remarks,
          status: request.status,
          createdAt: request.createdAt.toISOString(),
          canReview: resolvedApproverId === req.user!.employeeId,
          approverName: resolvedApproverId ? (approverNames.get(resolvedApproverId) ?? null) : null,
        });
      }
      res.json(visibleRequests);
    }),
  );

  app.post(
    "/attendance/hr-punch-correction",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = correctionSchema.parse(req.body);
      await assertEmployeeAccess(req.user, body.employeeId);
      if (body.punchTime.getTime() > Date.now()) {
        throw new HttpError(400, "Punch time must be in the past.");
      }

      await createAttendanceEvent({
        employeeId: body.employeeId,
        eventTime: body.punchTime,
        eventSource: EventSource.MANUAL_CORRECTION,
        eventType: body.eventType,
        remarks: body.remarks,
        createdByUserId: req.user!.id,
      });

      await audit({
        action: "attendance hr correction applied",
        performedByUserId: req.user!.id,
        newValue: body as never,
        ipAddress: req.ip,
      });

      res.status(201).json({ ok: true });
    }),
  );

  app.post(
    "/attendance/correction-requests/:id/approve",
    requireAuth,
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const request = await prisma.attendanceCorrectionRequest.findUniqueOrThrow({
        where: { requestId: id },
      });

      if (request.status !== "PENDING") {
        throw new HttpError(400, "Only pending requests can be approved");
      }
      const approverId = await assertOrganizationApproverForCorrection(req.user!, request);

      const changed = await prisma.attendanceCorrectionRequest.updateMany({
        where: { requestId: id, status: "PENDING" },
        data: { status: "APPROVED", approverId, reviewedBy: req.user!.id },
      });
      if (changed.count !== 1) {
        throw new HttpError(409, "This correction request was already reviewed");
      }

      try {
        // Create attendance event (this will trigger recalculateDailySummary internally).
        await createAttendanceEvent({
          employeeId: request.employeeId,
          eventTime: request.punchTime,
          eventSource: EventSource.MANUAL_CORRECTION,
          eventType: request.eventType,
          remarks: `Correction Approved: ${request.remarks}`,
          createdByUserId: req.user!.id,
        });
      } catch (error) {
        await prisma.attendanceCorrectionRequest.updateMany({
          where: { requestId: id, status: "APPROVED", reviewedBy: req.user!.id },
          data: { status: "PENDING", reviewedBy: null },
        });
        throw error;
      }

      await audit({
        action: "attendance corrected",
        performedByUserId: req.user!.id,
        newValue: { requestId: id, employeeId: request.employeeId, punchTime: request.punchTime },
        ipAddress: req.ip,
      });
      publishNotificationChange("attendance-correction-approved", request.requestId);

      res.json({ ok: true, status: "APPROVED" });
    }),
  );

  app.post(
    "/attendance/correction-requests/:id/reject",
    requireAuth,
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const request = await prisma.attendanceCorrectionRequest.findUniqueOrThrow({
        where: { requestId: id },
      });

      if (request.status !== "PENDING") {
        throw new HttpError(400, "Only pending requests can be rejected");
      }
      const approverId = await assertOrganizationApproverForCorrection(req.user!, request);

      const changed = await prisma.attendanceCorrectionRequest.updateMany({
        where: { requestId: id, status: "PENDING" },
        data: { status: "REJECTED", approverId, reviewedBy: req.user!.id },
      });
      if (changed.count !== 1) {
        throw new HttpError(409, "This correction request was already reviewed");
      }

      await audit({
        action: "attendance correction rejected",
        performedByUserId: req.user!.id,
        newValue: { requestId: id, employeeId: request.employeeId },
        ipAddress: req.ip,
      });
      publishNotificationChange("attendance-correction-rejected", request.requestId);

      res.json({ ok: true, status: "REJECTED" });
    }),
  );

  app.get(
    "/verify-id-card/:employeeId",
    asyncHandler(async (req, res) => {
      const employeeId = String(req.params.employeeId);
      const employee = await prisma.employee.findUnique({
        where: { employeeId },
        include: { user: true, department: true, homeBranch: true },
      });

      if (!employee || employee.status !== "ACTIVE" || employee.user?.status !== "ACTIVE") {
        throw new HttpError(404, "Invalid or inactive Employee ID");
      }

      res.json({
        verified: true,
        name: employee.name,
        employeeCode: employee.employeeCode,
        designation: employee.designation,
        department: employee.department?.name ?? "-",
        companyEntity: employee.companyEntity,
        companyPhone: employee.companyPhone,
        status: employee.status,
      });
    }),
  );

  app.get(
    "/weekly-offs",
    requireAuth,
    asyncHandler(async (req, res) => {
      const assigned = req.query.assignedApprovals === "true";
      const all = req.query.all === "true";
      const canViewAll = ([Role.HR, Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN] as Role[]).includes(
        req.user!.role,
      );
      if (all && !canViewAll) throw new HttpError(403, "HR or admin access is required");
      if (!all && !req.user!.employeeId) return res.json([]);
      const employeeId = req.user!.employeeId!;
      const rows = await prisma.weeklyOffRequest.findMany({
        where: all ? {} : assigned ? { approverId: employeeId } : { employeeId },
        include: { employee: { select: { name: true, employeeCode: true } } },
        orderBy: { date: "desc" },
        take: 100,
      });
      res.json(rows.map(weeklyOffRequestDto));
    }),
  );

  app.post(
    "/weekly-offs/:id/cancel",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(400, "No employee profile");
      const existing = await prisma.weeklyOffRequest.findUniqueOrThrow({
        where: { weeklyOffRequestId: String(req.params.id) },
      });
      if (existing.employeeId !== req.user!.employeeId) {
        throw new HttpError(403, "You can cancel only your own weekly-off request");
      }
      if (!["PENDING", "APPROVED"].includes(existing.status)) {
        throw new HttpError(400, "Only a pending or approved weekly off can be cancelled");
      }
      if (existing.date < todayIstDate()) {
        throw new HttpError(400, "A past weekly off cannot be cancelled");
      }
      const row = await prisma.weeklyOffRequest.update({
        where: { weeklyOffRequestId: existing.weeklyOffRequestId },
        data: { status: "CANCELLED" },
        include: { employee: { select: { name: true, employeeCode: true } } },
      });
      await recalculateDailySummary(row.employeeId, row.date);
      await audit({
        action: "weekly off cancelled",
        performedByUserId: req.user!.id,
        oldValue: { status: existing.status, date: existing.date },
        newValue: { status: row.status },
        ipAddress: req.ip,
      });
      publishNotificationChange("weekly-off-cancelled", row.weeklyOffRequestId);
      res.json(weeklyOffRequestDto(row));
    }),
  );

  app.post(
    "/weekly-offs",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(400, "No employee profile");
      const body = weeklyOffRequestSchema.parse(req.body);
      const date = startOfDayUtc(body.date);
      const today = todayIstDate();
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      if (date < tomorrow) {
        throw new HttpError(400, "A weekly off must be requested at least one day in advance");
      }
      await assertWeeklyOffNotConsecutive(req.user!.employeeId, date);
      const approver = await findLeaveApprover(req.user!.employeeId);
      if (!approver) throw new HttpError(400, "No organization head is available for approval");
      const weekStart = weeklyOffWeekStart(date);
      const existingForWeek = await prisma.weeklyOffRequest.findUnique({
        where: {
          employeeId_weekStart: { employeeId: req.user!.employeeId, weekStart },
        },
      });
      if (existingForWeek && !["REJECTED", "CANCELLED"].includes(existingForWeek.status)) {
        throw new HttpError(400, "Only one weekly-off request is allowed in a Monday-Sunday week");
      }
      const row = await prisma.weeklyOffRequest.upsert({
        where: { employeeId_weekStart: { employeeId: req.user!.employeeId, weekStart } },
        create: {
          employeeId: req.user!.employeeId,
          date,
          weekStart,
          approverId: approver.employeeId,
          reason: body.reason,
        },
        update: {
          date,
          approverId: approver.employeeId,
          reason: body.reason,
          status: "PENDING",
          reviewedBy: null,
        },
        include: { employee: { select: { name: true, employeeCode: true } } },
      });
      publishNotificationChange("weekly-off-requested", row.weeklyOffRequestId);
      res.status(201).json(weeklyOffRequestDto(row));
    }),
  );

  app.post(
    "/weekly-offs/:id/approve",
    requireAuth,
    asyncHandler(async (req, res) => {
      const existing = await prisma.weeklyOffRequest.findUniqueOrThrow({
        where: { weeklyOffRequestId: String(req.params.id) },
      });
      if (existing.approverId !== req.user!.employeeId) {
        throw new HttpError(403, "Only the assigned organization head can approve this weekly off");
      }
      if (existing.status !== "PENDING") throw new HttpError(400, "Request is already reviewed");
      await assertWeeklyOffNotConsecutive(
        existing.employeeId,
        existing.date,
        existing.weeklyOffRequestId,
      );
      const changed = await prisma.weeklyOffRequest.updateMany({
        where: { weeklyOffRequestId: existing.weeklyOffRequestId, status: "PENDING" },
        data: { status: "APPROVED", reviewedBy: req.user!.id },
      });
      if (changed.count !== 1) {
        throw new HttpError(409, "This weekly-off request was already reviewed");
      }
      const row = await prisma.weeklyOffRequest.findUniqueOrThrow({
        where: { weeklyOffRequestId: existing.weeklyOffRequestId },
        include: { employee: { select: { name: true, employeeCode: true } } },
      });
      await recalculateDailySummary(row.employeeId, row.date);
      publishNotificationChange("weekly-off-approved", row.weeklyOffRequestId);
      res.json(weeklyOffRequestDto(row));
    }),
  );

  app.post(
    "/weekly-offs/:id/reject",
    requireAuth,
    asyncHandler(async (req, res) => {
      const existing = await prisma.weeklyOffRequest.findUniqueOrThrow({
        where: { weeklyOffRequestId: String(req.params.id) },
      });
      if (existing.approverId !== req.user!.employeeId) {
        throw new HttpError(403, "Only the assigned organization head can reject this weekly off");
      }
      if (existing.status !== "PENDING") throw new HttpError(400, "Request is already reviewed");
      const changed = await prisma.weeklyOffRequest.updateMany({
        where: { weeklyOffRequestId: existing.weeklyOffRequestId, status: "PENDING" },
        data: { status: "REJECTED", reviewedBy: req.user!.id },
      });
      if (changed.count !== 1) {
        throw new HttpError(409, "This weekly-off request was already reviewed");
      }
      const row = await prisma.weeklyOffRequest.findUniqueOrThrow({
        where: { weeklyOffRequestId: existing.weeklyOffRequestId },
        include: { employee: { select: { name: true, employeeCode: true } } },
      });
      publishNotificationChange("weekly-off-rejected", row.weeklyOffRequestId);
      res.json(weeklyOffRequestDto(row));
    }),
  );

  app.get(
    "/leave/types",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const types = await prisma.leaveType.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      });
      res.json(types.map(leaveTypeDto));
    }),
  );
  app.post(
    "/leave/types",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = leaveTypeSchema.parse(req.body);
      throw new HttpError(400, "Company leave policies are protected and cannot be added manually");
      /* istanbul ignore next */
      const type = await prisma.leaveType.create({
        data: {
          name: body.name,
          code: body.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
          paid: body.paid ?? true,
        },
      });
      await audit({
        action: "leave type created",
        performedByUserId: req.user!.id,
        newValue: leaveTypeDto(type),
        ipAddress: req.ip,
      });
      res.status(201).json(leaveTypeDto(type));
    }),
  );
  app.patch(
    "/leave/types/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = leaveTypeUpdateSchema.parse(req.body);
      throw new HttpError(400, "Company leave policies are protected and cannot be modified");
      /* istanbul ignore next */
      const type = await prisma.leaveType.update({
        where: { leaveTypeId: String(req.params.id) },
        data: { name: body.name, paid: body.paid },
      });
      await audit({
        action: "leave type updated",
        performedByUserId: req.user!.id,
        newValue: leaveTypeDto(type),
        ipAddress: req.ip,
      });
      res.json(leaveTypeDto(type));
    }),
  );
  app.delete(
    "/leave/types/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      throw new HttpError(400, "Company leave policies are protected and cannot be deleted");
      /* istanbul ignore next */
      const usage = await prisma.leaveRequest.count({ where: { leaveTypeId: id } });
      const balances = await prisma.leaveBalance.count({ where: { leaveTypeId: id } });
      if (usage || balances) {
        throw new HttpError(400, "Leave type is already used and cannot be deleted");
      }
      const type = await prisma.leaveType.delete({ where: { leaveTypeId: id } });
      await audit({
        action: "leave type deleted",
        performedByUserId: req.user!.id,
        newValue: leaveTypeDto(type),
        ipAddress: req.ip,
      });
      res.json(leaveTypeDto(type));
    }),
  );
  app.get(
    "/leave/balances/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) return res.json([]);
      const balances = await syncEmployeeLeaveBalances(req.user!.employeeId);
      res.json(
        balances.map((balance) => ({
          type: balance.leaveType.name,
          entitled: Number(balance.entitled),
          used: Number(balance.used),
          balance: Number(balance.balance),
          code: balance.leaveType.code,
          manualAdjustment: Number(balance.manualAdjustment),
          description: leavePolicyDescription(balance.leaveType.code),
        })),
      );
    }),
  );
  app.get(
    "/leave/balances",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : null;
      if (!employeeId) return res.json([]);
      const employee = await prisma.employee.findFirst({
        where: { employeeId, status: "ACTIVE" },
        select: { employeeId: true },
      });
      if (!employee) throw new HttpError(404, "Active employee not found");
      await syncEmployeeLeaveBalances(employeeId);
      const balances = await prisma.leaveBalance.findMany({
        where: { employeeId },
        include: {
          employee: {
            select: {
              employeeId: true,
              employeeCode: true,
              name: true,
              department: { select: { name: true } },
            },
          },
          leaveType: true,
        },
        orderBy: { leaveType: { name: "asc" } },
      });
      res.json(
        balances.map((b) => ({
          id: b.leaveBalanceId,
          employeeId: b.employeeId,
          employeeCode: b.employee.employeeCode,
          employeeName: b.employee.name,
          department: b.employee.department?.name ?? "-",
          leaveType: b.leaveType.name,
          leaveTypeId: b.leaveTypeId,
          entitled: Number(b.entitled),
          used: Number(b.used),
          balance: Number(b.balance),
          code: b.leaveType.code,
          manualAdjustment: Number(b.manualAdjustment),
        })),
      );
    }),
  );
  app.patch(
    "/leave/balances/:employeeId/:leaveTypeId",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const employeeId = String(req.params.employeeId);
      const leaveTypeId = String(req.params.leaveTypeId);
      const body = leaveBalanceAdjustmentSchema.parse(req.body);
      await syncEmployeeLeaveBalances(employeeId);
      const previous = await prisma.leaveBalance.findUniqueOrThrow({
        where: { employeeId_leaveTypeId: { employeeId, leaveTypeId } },
      });
      await prisma.leaveBalance.update({
        where: { employeeId_leaveTypeId: { employeeId, leaveTypeId } },
        data: { manualAdjustment: body.adjustment },
      });
      const balances = await syncEmployeeLeaveBalances(employeeId);
      await audit({
        action: "leave balance adjusted",
        performedByUserId: req.user!.id,
        oldValue: { manualAdjustment: Number(previous.manualAdjustment) },
        newValue: { employeeId, leaveTypeId, adjustment: body.adjustment, reason: body.reason },
        ipAddress: req.ip,
      });
      res.json(balances.find((balance) => balance.leaveTypeId === leaveTypeId));
    }),
  );
  app.get(
    "/leave/requests",
    requireAuth,
    asyncHandler(async (req, res) => {
      const operationalRoles: Role[] = [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR, Role.CEO];
      const ownOnly = req.query.mine === "true";
      const assignedApprovals = req.query.assignedApprovals === "true";
      const where: Prisma.LeaveRequestWhereInput = ownOnly
        ? { employeeId: req.user!.employeeId ?? "__none__" }
        : assignedApprovals
          ? { managerId: req.user!.employeeId ?? "__none__" }
          : operationalRoles.includes(req.user!.role)
            ? {}
            : req.user!.role === Role.MANAGER && req.user!.employeeId
              ? {
                  employeeId: { in: await getOrganizationTeamEmployeeIds(req.user!.employeeId) },
                }
              : { employeeId: req.user!.employeeId ?? "__none__" };
      if (typeof req.query.status === "string") {
        const status = req.query.status.toUpperCase();
        if (status === "PENDING") where.status = "PENDING";
        else if (status === "APPROVED")
          where.status = { in: ["APPROVED", "MANAGER_APPROVED", "HR_VERIFIED"] };
        else if (status === "REJECTED") where.status = "REJECTED";
        else if (status === "CANCELLED") where.status = "CANCELLED";
      }
      const rows = await prisma.leaveRequest.findMany({
        where,
        include: { leaveType: true, employee: { include: { manager: true } } },
        orderBy: { createdAt: "desc" },
        take: listLimit(req, 500, 1000),
      });
      res.json(await leaveRequestDtos(rows));
    }),
  );
  app.post(
    "/leave/requests",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(400, "No employee profile");
      const body = leaveRequestSchema.parse(req.body);
      const policy = await validateLeaveApplication({
        employeeId: req.user!.employeeId,
        leaveTypeId: body.leaveTypeId,
        fromDate: body.fromDate,
        toDate: body.toDate,
        days: body.days,
      });
      const approver = policy.type.approvalRequired
        ? await findLeaveApprover(req.user!.employeeId)
        : null;
      if (policy.type.approvalRequired && !approver) {
        throw new HttpError(
          400,
          "No organization head is available for this leave request. Contact HR to complete the organization chart.",
        );
      }
      const request = await prisma.$transaction(async (tx) => {
        const created = await tx.leaveRequest.create({
          data: {
            ...body,
            employeeId: req.user!.employeeId!,
            managerId: approver?.employeeId,
            status: policy.type.approvalRequired ? "PENDING" : "APPROVED",
            medicalDocumentDueAt:
              policy.type.code === LEAVE_CODES.SICK ? medicalDocumentDueAt(body.toDate) : undefined,
          },
          include: { leaveType: true, employee: { include: { manager: true } } },
        });
        if (policy.type.code === LEAVE_CODES.COMP_OFF) {
          await consumeCompOffCredits(
            req.user!.employeeId!,
            created.leaveRequestId,
            body.days,
            created.fromDate,
            tx,
          );
        }
        return created;
      });
      if (policy.type.code === LEAVE_CODES.COMP_OFF) {
        await recalculateLeaveDateRange(
          request.employeeId,
          request.fromDate,
          request.toDate,
          recalculateDailySummary,
        );
      }
      await syncEmployeeLeaveBalances(req.user!.employeeId);
      await audit({
        action: "leave requested",
        performedByUserId: req.user!.id,
        newValue: { leaveRequestId: request.leaveRequestId },
        ipAddress: req.ip,
      });
      res.status(201).json(leaveRequestDto(request, approver?.name ?? "No approval required"));
    }),
  );
  app.post(
    "/leave/requests/:id/approve",
    requireAuth,
    asyncHandler(async (req, res) => {
      const existing = await prisma.leaveRequest.findUniqueOrThrow({
        where: { leaveRequestId: String(req.params.id) },
        include: { employee: true },
      });
      await assertOrganizationApproverForLeave(req.user!, existing);
      if (existing.status !== "PENDING") {
        throw new HttpError(400, "Only pending leave requests can be approved.");
      }
      const changed = await prisma.leaveRequest.updateMany({
        where: { leaveRequestId: String(req.params.id), status: "PENDING" },
        data: { status: "APPROVED" },
      });
      if (changed.count !== 1) {
        throw new HttpError(409, "This leave request was already reviewed");
      }
      const leave = await prisma.leaveRequest.findUniqueOrThrow({
        where: { leaveRequestId: String(req.params.id) },
        include: { leaveType: true, employee: { include: { manager: true } } },
      });
      await syncEmployeeLeaveBalances(leave.employeeId);
      await recalculateLeaveDateRange(
        leave.employeeId,
        leave.fromDate,
        leave.toDate,
        recalculateDailySummary,
      );
      await audit({
        action: "leave approved",
        performedByUserId: req.user!.id,
        newValue: { leaveRequestId: leave.leaveRequestId },
        ipAddress: req.ip,
      });
      res.json((await leaveRequestDtos([leave]))[0]);
    }),
  );
  app.post(
    "/leave/requests/:id/reject",
    requireAuth,
    asyncHandler(async (req, res) => {
      const existing = await prisma.leaveRequest.findUniqueOrThrow({
        where: { leaveRequestId: String(req.params.id) },
        include: { employee: true },
      });
      await assertOrganizationApproverForLeave(req.user!, existing);
      if (existing.status !== "PENDING") {
        throw new HttpError(400, "Only pending leave requests can be rejected.");
      }
      const changed = await prisma.leaveRequest.updateMany({
        where: { leaveRequestId: String(req.params.id), status: "PENDING" },
        data: { status: "REJECTED" },
      });
      if (changed.count !== 1) {
        throw new HttpError(409, "This leave request was already reviewed");
      }
      const leave = await prisma.leaveRequest.findUniqueOrThrow({
        where: { leaveRequestId: String(req.params.id) },
        include: { leaveType: true, employee: { include: { manager: true } } },
      });
      await audit({
        action: "leave rejected",
        performedByUserId: req.user!.id,
        newValue: { leaveRequestId: leave.leaveRequestId },
        ipAddress: req.ip,
      });
      res.json((await leaveRequestDtos([leave]))[0]);
    }),
  );

  app.post(
    "/leave/requests/:id/cancel",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(400, "No employee profile");
      const existing = await prisma.leaveRequest.findUniqueOrThrow({
        where: { leaveRequestId: String(req.params.id) },
        include: { leaveType: true, employee: { include: { manager: true } } },
      });
      if (existing.employeeId !== req.user!.employeeId) {
        throw new HttpError(403, "You can only cancel your own leave request.");
      }
      if (existing.status === "CANCELLED" || existing.status === "REJECTED") {
        throw new HttpError(400, "This leave request is already closed.");
      }

      let leave = existing;
      if (existing.status === "PENDING") {
        leave = await prisma.leaveRequest.update({
          where: { leaveRequestId: existing.leaveRequestId },
          data: { status: "CANCELLED" },
          include: { leaveType: true, employee: { include: { manager: true } } },
        });
      } else {
        const today = todayIstDate();
        const datesToCancel = eachDateInRange(existing.fromDate, existing.toDate).filter(
          (date) => date.getTime() >= today.getTime(),
        );
        if (datesToCancel.length === 0) {
          throw new HttpError(400, "Only current or future leave dates can be cancelled.");
        }
        leave = await cancelLeaveDates(existing.leaveRequestId, datesToCancel);
        await Promise.all(
          datesToCancel.map((date) => recalculateDailySummary(existing.employeeId, date)),
        );
      }
      if (existing.leaveType.code === LEAVE_CODES.COMP_OFF) {
        await releaseCompOffCredits(existing.leaveRequestId);
      }
      await syncEmployeeLeaveBalances(existing.employeeId);
      await audit({
        action: "leave cancelled by employee",
        performedByUserId: req.user!.id,
        newValue: { leaveRequestId: existing.leaveRequestId },
        ipAddress: req.ip,
      });
      res.json((await leaveRequestDtos([leave]))[0]);
    }),
  );

  app.patch(
    "/leave/requests/:id/medical-document",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(400, "No employee profile");
      const body = medicalDocumentSchema.parse(req.body);
      const existing = await prisma.leaveRequest.findUniqueOrThrow({
        where: { leaveRequestId: String(req.params.id) },
        include: { leaveType: true },
      });
      const canManage = ([Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN] as Role[]).includes(
        req.user!.role,
      );
      if (existing.employeeId !== req.user!.employeeId && !canManage) {
        throw new HttpError(403, "You cannot update this medical document");
      }
      if (existing.leaveType.code !== LEAVE_CODES.SICK) {
        throw new HttpError(400, "Medical documents apply only to Sick Leave");
      }
      const leave = await prisma.leaveRequest.update({
        where: { leaveRequestId: existing.leaveRequestId },
        data: { medicalDocumentUrl: body.url },
        include: { leaveType: true, employee: { include: { manager: true } } },
      });
      await audit({
        action: "sick leave medical document updated",
        performedByUserId: req.user!.id,
        newValue: { leaveRequestId: leave.leaveRequestId, documentProvided: true },
        ipAddress: req.ip,
      });
      res.json((await leaveRequestDtos([leave]))[0]);
    }),
  );

  app.post(
    "/leave/requests/:id/medical-document/verify",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const leave = await prisma.leaveRequest.update({
        where: { leaveRequestId: String(req.params.id) },
        data: { medicalDocumentVerifiedAt: new Date(), medicalDocumentVerifiedBy: req.user!.id },
        include: { leaveType: true, employee: { include: { manager: true } } },
      });
      res.json((await leaveRequestDtos([leave]))[0]);
    }),
  );

  app.post(
    "/profile/edit-requests",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(400, "No employee profile");
      const body = profileEditSchema.parse(req.body);
      const request = await prisma.profileEditRequest.create({
        data: { employeeId: req.user!.employeeId, requestedData: body.requestedData as never },
      });
      res.status(201).json(request);
    }),
  );

  app.get(
    "/id-card/:employeeId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const employeeId = String(req.params.employeeId);
      await assertEmployeeAccess(req.user, employeeId);
      const employee = await prisma.employee.findUniqueOrThrow({
        where: { employeeId },
        include: { homeBranch: true, emergencyContact: true, department: true },
      });
      res.json({
        companyEntity: employee.companyEntity,
        parentCompanyName: "Royal Petro Park Private Limited",
        employeeName: employee.name,
        employeeCode: employee.employeeCode,
        department: employee.department?.name,
        designation: employee.designation,
        companyPhone: employee.companyPhone,
        personalPhone: employee.phone,
        email: employee.email,
        joiningDate: employee.joiningDate?.toISOString().slice(0, 10),
        bloodGroup: employee.bloodGroup ?? employee.emergencyContact?.bloodGroup,
        emergencyContact: employee.emergencyContact,
        status: employee.status,
      });
    }),
  );

  app.get(
    "/audit-logs",
    requireAuth,
    requireRoles(Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const logs = await prisma.auditLog.findMany({
        include: { performedBy: true, affectedUser: true },
        orderBy: { createdAt: "desc" },
        take: listLimit(req, 250, 1000),
      });
      res.json(
        logs.map((log) => ({
          id: log.auditId,
          actor: log.performedBy?.name ?? "System",
          role: log.performedBy?.role?.toLowerCase() ?? "system",
          action: log.action,
          target: log.affectedUser?.name ?? "",
          timestamp: log.createdAt.toISOString(),
          ipAddress: log.ipAddress,
          oldValue: safeAuditValue(log.oldValue),
          newValue: safeAuditValue(log.newValue),
        })),
      );
    }),
  );

  app.get(
    "/audit-logs/summary",
    requireAuth,
    requireRoles(Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (_req, res) => {
      const summary = await prisma.auditLog.aggregate({
        _count: { auditId: true },
        _min: { createdAt: true },
        _max: { createdAt: true },
      });
      res.json({
        count: summary._count.auditId,
        oldest: summary._min.createdAt?.toISOString(),
        latest: summary._max.createdAt?.toISOString(),
      });
    }),
  );

  app.get(
    "/module-access/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const matrix = await getModuleAccessMatrix();
      res.json({ modules: matrix[req.user!.role] });
    }),
  );

  app.get(
    "/module-access/matrix",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (_req, res) => {
      res.json({ modules: MODULE_KEYS, matrix: await getModuleAccessMatrix() });
    }),
  );

  app.put(
    "/module-access/matrix",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          matrix: z
            .record(z.string(), z.array(z.enum(MODULE_KEYS)))
            .refine(
              (value) => Object.values(Role).every((role) => Array.isArray(value[role])),
              "Every role must be configured",
            ),
        })
        .parse(req.body);
      const matrix = await saveModuleAccessMatrix(body.matrix, req.user!.id);
      await audit({
        action: "module access updated",
        performedByUserId: req.user!.id,
        newValue: matrix,
        ipAddress: req.ip,
      });
      res.json({ modules: MODULE_KEYS, matrix });
    }),
  );

  const taskInclude = {
    assignments: {
      include: {
        employee: {
          select: {
            employeeId: true,
            employeeCode: true,
            name: true,
            designation: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { assignedAt: "asc" as const },
    },
    createdBy: { select: { id: true, name: true } },
    board: { select: { boardId: true, name: true } },
    stage: {
      select: {
        stageId: true,
        name: true,
        color: true,
        sortOrder: true,
        isCompleted: true,
        status: true,
      },
    },
    updates: {
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" as const },
      take: 20,
    },
    _count: { select: { subtasks: true, updates: true } },
  } satisfies Prisma.WorkTaskInclude;

  type TaskWithDetails = Prisma.WorkTaskGetPayload<{ include: typeof taskInclude }>;

  function taskDto(task: TaskWithDetails) {
    return {
      id: task.taskId,
      title: task.title,
      description: task.description ?? undefined,
      assignees: task.assignments.map(({ employee }) => ({
        id: employee.employeeId,
        name: employee.name,
        employeeCode: employee.employeeCode,
        designation: employee.designation ?? undefined,
        department: employee.department?.name,
      })),
      createdByUserId: task.createdByUserId,
      createdByName: task.createdBy.name,
      parentTaskId: task.parentTaskId ?? undefined,
      boardId: task.boardId ?? undefined,
      boardName: task.board?.name,
      stageId: task.stageId ?? undefined,
      stage: task.stage
        ? {
            id: task.stage.stageId,
            name: task.stage.name,
            color: task.stage.color,
            sortOrder: task.stage.sortOrder,
            isCompleted: task.stage.isCompleted,
            status: task.stage.status,
          }
        : undefined,
      status: task.status,
      priority: task.priority,
      progress: task.progress,
      version: task.version,
      startDate: task.startDate?.toISOString().slice(0, 10),
      dueDate: task.dueDate?.toISOString().slice(0, 10),
      completedAt: task.completedAt?.toISOString(),
      archivedAt: task.archivedAt?.toISOString(),
      lastActivityAt: task.lastActivityAt.toISOString(),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      subtaskCount: task._count?.subtasks ?? 0,
      updateCount: task._count?.updates ?? 0,
      updates: task.updates.map((entry) => ({
        id: entry.updateId,
        authorName: entry.author.name,
        activityType: entry.activityType,
        message: entry.message,
        metadata: entry.metadata ?? undefined,
        progress: entry.progress ?? undefined,
        status: entry.status ?? undefined,
        minutesWorked: entry.minutesWorked ?? undefined,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  async function taskScope(user: NonNullable<express.Request["user"]>) {
    const unrestrictedRoles: Role[] = [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.CEO, Role.HR];
    const assignmentAdminRoles: Role[] = [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.CEO, Role.HR];
    const unrestricted = unrestrictedRoles.includes(user.role);
    const teamIds = user.employeeId ? await getOrganizationTeamEmployeeIds(user.employeeId) : [];
    const visibleIds = unrestricted
      ? undefined
      : [...new Set([...(user.employeeId ? [user.employeeId] : []), ...teamIds])];
    const assignableIds = assignmentAdminRoles.includes(user.role) ? undefined : teamIds;
    return { visibleIds, assignableIds };
  }

  const boardInclude = {
    stages: { orderBy: { sortOrder: "asc" as const } },
    roleAccess: { select: { role: true } },
    members: { select: { employeeId: true } },
    tasks: {
      where: { status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] } },
      select: { taskId: true },
    },
    _count: { select: { tasks: true } },
  } satisfies Prisma.TaskBoardInclude;

  type BoardWithDetails = Prisma.TaskBoardGetPayload<{ include: typeof boardInclude }>;

  function boardDto(board: BoardWithDetails) {
    return {
      id: board.boardId,
      name: board.name,
      createdByUserId: board.createdByUserId,
      description: board.description ?? undefined,
      accessType: board.accessType,
      archived: board.archived,
      version: board.version,
      allowedRoles: board.roleAccess.map((entry) => entry.role),
      memberEmployeeIds: board.members.map((entry) => entry.employeeId),
      stages: board.stages.map((stage) => ({
        id: stage.stageId,
        name: stage.name,
        color: stage.color,
        sortOrder: stage.sortOrder,
        isCompleted: stage.isCompleted,
        status: stage.status,
      })),
      taskCount: board._count.tasks,
      openTaskCount: board.tasks.length,
      createdAt: board.createdAt.toISOString(),
      updatedAt: board.updatedAt.toISOString(),
    };
  }

  function taskStatusForStage(stage: { status: TaskStatus }) {
    return stage.status;
  }

  function boardAccessWhere(user: NonNullable<express.Request["user"]>) {
    if (user.role === Role.DEVELOPER_ADMIN) return {};
    return {
      OR: [
        { createdByUserId: user.id },
        { accessType: TaskBoardAccessType.OPEN },
        { accessType: TaskBoardAccessType.ROLE_GATED, roleAccess: { some: { role: user.role } } },
        ...(user.employeeId
          ? [
              {
                accessType: TaskBoardAccessType.MEMBER_GATED,
                members: { some: { employeeId: user.employeeId } },
              },
            ]
          : []),
      ],
    } satisfies Prisma.TaskBoardWhereInput;
  }

  async function assertBoardAccess(user: NonNullable<express.Request["user"]>, boardId: string) {
    const board = await prisma.taskBoard.findFirst({
      where: { boardId, ...boardAccessWhere(user) },
      include: boardInclude,
    });
    if (!board) throw new HttpError(403, "This board is not available to your account");
    return board;
  }

  app.get(
    "/task-boards",
    requireAuth,
    asyncHandler(async (req, res) => {
      const archived = req.query.archived === "true";
      const boards = await prisma.taskBoard.findMany({
        where: { archived, ...boardAccessWhere(req.user!) },
        include: boardInclude,
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
        take: 250,
      });
      res.json(boards.map(boardDto));
    }),
  );

  app.post(
    "/task-boards",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = taskBoardSchema.parse(req.body);
      const { assignableIds } = await taskScope(req.user!);
      if (assignableIds?.length === 0)
        throw new HttpError(403, "Only team leads can create boards");
      if (
        assignableIds &&
        body.memberEmployeeIds.some((employeeId) => !assignableIds.includes(employeeId))
      ) {
        throw new HttpError(403, "Boards can include only members of your organization team");
      }
      if (body.memberEmployeeIds.length > 0) {
        const uniqueMemberIds = [...new Set(body.memberEmployeeIds)];
        const activeMembers = await prisma.employee.count({
          where: { employeeId: { in: uniqueMemberIds }, status: "ACTIVE" },
        });
        if (activeMembers !== uniqueMemberIds.length) {
          throw new HttpError(400, "Select active employees for board access");
        }
      }
      const board = await prisma.taskBoard.create({
        data: {
          name: body.name,
          description: body.description || null,
          accessType: body.accessType,
          createdByUserId: req.user!.id,
          stages: {
            create: body.stages.map((stage, sortOrder) => ({
              name: stage.name,
              color: stage.color,
              status: stage.status,
              sortOrder,
              isCompleted: stage.status === TaskStatus.COMPLETED,
            })),
          },
          roleAccess: {
            create:
              body.accessType === TaskBoardAccessType.ROLE_GATED
                ? [...new Set(body.allowedRoles)].map((role) => ({ role }))
                : [],
          },
          members: {
            create:
              body.accessType === TaskBoardAccessType.MEMBER_GATED
                ? [...new Set(body.memberEmployeeIds)].map((employeeId) => ({ employeeId }))
                : [],
          },
        },
        include: boardInclude,
      });
      await audit({
        action: "task board created",
        performedByUserId: req.user!.id,
        newValue: { boardId: board.boardId, name: board.name, accessType: board.accessType },
        ipAddress: req.ip,
      });
      res.status(201).json(boardDto(board));
    }),
  );

  app.patch(
    "/task-boards/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const existing = await assertBoardAccess(req.user!, String(req.params.id));
      if (req.user!.role !== Role.DEVELOPER_ADMIN && existing.createdByUserId !== req.user!.id) {
        throw new HttpError(403, "Only the board owner can change this board");
      }

      const archiveResult = taskBoardArchiveSchema.safeParse(req.body);
      if (archiveResult.success) {
        const changed = await prisma.taskBoard.updateMany({
          where: { boardId: existing.boardId, version: archiveResult.data.version },
          data: { archived: archiveResult.data.archived, version: { increment: 1 } },
        });
        if (changed.count !== 1) {
          throw new HttpError(409, "This board changed in another session. Refresh and try again");
        }
        const board = await prisma.taskBoard.findUniqueOrThrow({
          where: { boardId: existing.boardId },
          include: boardInclude,
        });
        await audit({
          action: archiveResult.data.archived ? "task board archived" : "task board restored",
          performedByUserId: req.user!.id,
          newValue: { boardId: board.boardId, archived: board.archived, version: board.version },
          ipAddress: req.ip,
        });
        res.json(boardDto(board));
        return;
      }

      const body = taskBoardUpdateSchema.parse(req.body);
      if (existing.archived) {
        throw new HttpError(409, "Restore this board before changing its configuration");
      }
      const { assignableIds } = await taskScope(req.user!);
      if (
        assignableIds &&
        body.memberEmployeeIds.some((employeeId) => !assignableIds.includes(employeeId))
      ) {
        throw new HttpError(403, "Boards can include only members of your organization team");
      }
      const uniqueMemberIds = [...new Set(body.memberEmployeeIds)];
      if (uniqueMemberIds.length > 0) {
        const activeMembers = await prisma.employee.count({
          where: { employeeId: { in: uniqueMemberIds }, status: "ACTIVE" },
        });
        if (activeMembers !== uniqueMemberIds.length) {
          throw new HttpError(400, "Select active employees for board access");
        }
      }

      const board = await prisma.$transaction(async (transaction) => {
        const currentStages = await transaction.taskStage.findMany({
          where: { boardId: existing.boardId },
          include: { _count: { select: { tasks: true } } },
        });
        const currentById = new Map(currentStages.map((stage) => [stage.stageId, stage]));
        const requestedIds = body.stages.flatMap((stage) => (stage.id ? [stage.id] : []));
        if (
          new Set(requestedIds).size !== requestedIds.length ||
          requestedIds.some((stageId) => !currentById.has(stageId))
        ) {
          throw new HttpError(400, "Select stages from this board");
        }
        const requestedIdSet = new Set(requestedIds);
        const removedStages = currentStages.filter((stage) => !requestedIdSet.has(stage.stageId));
        const populatedRemovedStage = removedStages.find((stage) => stage._count.tasks > 0);
        if (populatedRemovedStage) {
          throw new HttpError(
            409,
            `Move tasks out of "${populatedRemovedStage.name}" before removing that stage`,
          );
        }

        const changed = await transaction.taskBoard.updateMany({
          where: { boardId: existing.boardId, version: body.version },
          data: {
            name: body.name,
            description: body.description || null,
            accessType: body.accessType,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          throw new HttpError(409, "This board changed in another session. Refresh and try again");
        }

        const boardAssignments = await transaction.taskAssignment.findMany({
          where: { task: { boardId: existing.boardId } },
          select: {
            employeeId: true,
            employee: { select: { user: { select: { role: true } } } },
          },
          distinct: ["employeeId"],
        });
        if (
          body.accessType === TaskBoardAccessType.MEMBER_GATED &&
          boardAssignments.some((assignment) => !uniqueMemberIds.includes(assignment.employeeId))
        ) {
          throw new HttpError(
            409,
            "Add every current task assignee as a board member before restricting member access",
          );
        }
        if (body.accessType === TaskBoardAccessType.ROLE_GATED) {
          const allowedRoles = new Set(body.allowedRoles);
          if (
            boardAssignments.some(
              (assignment) =>
                !assignment.employee.user || !allowedRoles.has(assignment.employee.user.role),
            )
          ) {
            throw new HttpError(
              409,
              "Add the roles of every current task assignee before restricting role access",
            );
          }
        }

        await transaction.taskBoardRole.deleteMany({ where: { boardId: existing.boardId } });
        await transaction.taskBoardMember.deleteMany({ where: { boardId: existing.boardId } });
        if (body.accessType === TaskBoardAccessType.ROLE_GATED) {
          await transaction.taskBoardRole.createMany({
            data: [...new Set(body.allowedRoles)].map((role) => ({
              boardId: existing.boardId,
              role,
            })),
          });
        }
        if (body.accessType === TaskBoardAccessType.MEMBER_GATED) {
          await transaction.taskBoardMember.createMany({
            data: uniqueMemberIds.map((employeeId) => ({
              boardId: existing.boardId,
              employeeId,
            })),
          });
        }

        if (removedStages.length > 0) {
          await transaction.taskStage.deleteMany({
            where: { stageId: { in: removedStages.map((stage) => stage.stageId) } },
          });
        }
        for (const stage of currentStages.filter((entry) => requestedIdSet.has(entry.stageId))) {
          await transaction.taskStage.update({
            where: { stageId: stage.stageId },
            data: { name: `__updating__${stage.stageId}` },
          });
        }
        for (const [sortOrder, stage] of body.stages.entries()) {
          if (stage.id) {
            const previous = currentById.get(stage.id)!;
            if (previous.status !== stage.status && previous._count.tasks > 0) {
              const affectedTasks = await transaction.workTask.findMany({
                where: { stageId: stage.id },
                select: { taskId: true, status: true, progress: true },
              });
              await transaction.workTask.updateMany({
                where: { stageId: stage.id },
                data:
                  stage.status === TaskStatus.COMPLETED
                    ? {
                        status: stage.status,
                        progress: 100,
                        completedAt: new Date(),
                        version: { increment: 1 },
                        lastActivityAt: new Date(),
                      }
                    : {
                        status: stage.status,
                        completedAt: null,
                        version: { increment: 1 },
                        lastActivityAt: new Date(),
                      },
              });
              await transaction.taskUpdate.createMany({
                data: affectedTasks.map((task) => ({
                  taskId: task.taskId,
                  authorUserId: req.user!.id,
                  activityType: TaskActivityType.STATUS_CHANGED,
                  message: "Workflow stage configuration updated",
                  status: stage.status,
                  progress: stage.status === TaskStatus.COMPLETED ? 100 : task.progress,
                  metadata: {
                    previousStatus: task.status,
                    status: stage.status,
                    source: "BOARD_CONFIGURATION",
                  },
                })),
              });
            }
            await transaction.taskStage.update({
              where: { stageId: stage.id },
              data: {
                name: stage.name,
                color: stage.color,
                status: stage.status,
                sortOrder,
                isCompleted: stage.status === TaskStatus.COMPLETED,
              },
            });
          } else {
            await transaction.taskStage.create({
              data: {
                boardId: existing.boardId,
                name: stage.name,
                color: stage.color,
                status: stage.status,
                sortOrder,
                isCompleted: stage.status === TaskStatus.COMPLETED,
              },
            });
          }
        }

        return transaction.taskBoard.findUniqueOrThrow({
          where: { boardId: existing.boardId },
          include: boardInclude,
        });
      });
      await audit({
        action: "task board updated",
        performedByUserId: req.user!.id,
        newValue: {
          boardId: board.boardId,
          name: board.name,
          accessType: board.accessType,
          version: board.version,
        },
        ipAddress: req.ip,
      });
      res.json(boardDto(board));
    }),
  );

  app.get(
    "/tasks/assignees",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { assignableIds } = await taskScope(req.user!);
      const employees = await prisma.employee.findMany({
        where: {
          status: "ACTIVE",
          ...(assignableIds ? { employeeId: { in: assignableIds } } : {}),
          OR: [{ user: null }, { user: { role: { not: Role.DEVELOPER_ADMIN } } }],
        },
        include: { department: true, user: { select: { role: true } } },
        orderBy: { name: "asc" },
      });
      res.json(
        employees.map((employee) => ({
          id: employee.employeeId,
          name: employee.name,
          employeeCode: employee.employeeCode,
          designation: employee.designation ?? undefined,
          department: employee.department?.name,
          role: employee.user?.role,
        })),
      );
    }),
  );

  app.get(
    "/tasks",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { visibleIds } = await taskScope(req.user!);
      const scope =
        req.query.scope === "mine" && req.user!.employeeId ? [req.user!.employeeId] : visibleIds;
      const requestedStatus = z.nativeEnum(TaskStatus).safeParse(req.query.status);
      const requestedPriority = z.nativeEnum(TaskPriority).safeParse(req.query.priority);
      const boardId = typeof req.query.boardId === "string" ? req.query.boardId : undefined;
      const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
      const due = typeof req.query.due === "string" ? req.query.due : undefined;
      const today = todayIstDate();
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      if (boardId) await assertBoardAccess(req.user!, boardId);
      const tasks = await prisma.workTask.findMany({
        where: {
          archivedAt: null,
          ...(scope ? { assignments: { some: { employeeId: { in: scope } } } } : {}),
          ...(requestedStatus.success ? { status: requestedStatus.data } : {}),
          ...(requestedPriority.success ? { priority: requestedPriority.data } : {}),
          ...(boardId ? { boardId } : {}),
          ...(due === "today" ? { dueDate: { gte: today, lt: tomorrow } } : {}),
          ...(due === "overdue"
            ? {
                dueDate: { lt: today },
                status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
              }
            : {}),
          ...(due === "none" ? { dueDate: null } : {}),
          AND: [
            { OR: [{ boardId: null }, { board: { is: boardAccessWhere(req.user!) } }] },
            ...(query
              ? [
                  {
                    OR: [
                      { title: { contains: query } },
                      { description: { contains: query } },
                      { assignments: { some: { employee: { name: { contains: query } } } } },
                    ],
                  },
                ]
              : []),
          ],
        },
        include: taskInclude,
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        skip: listOffset(req),
        take: listLimit(req, 300, 1000),
      });
      res.json(tasks.map(taskDto));
    }),
  );

  app.post(
    "/tasks",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = taskSchema.parse(req.body);
      const { assignableIds } = await taskScope(req.user!);
      const employeeIds = [...new Set(body.assigneeEmployeeIds)];
      if (assignableIds && employeeIds.some((id) => !assignableIds.includes(id))) {
        throw new HttpError(403, "Tasks can only be assigned within your organization team");
      }
      const activeAssigneeCount = await prisma.employee.count({
        where: { employeeId: { in: employeeIds }, status: "ACTIVE" },
      });
      if (activeAssigneeCount !== employeeIds.length)
        throw new HttpError(400, "Select active employees");
      const boardId = body.boardId || null;
      let stageId = body.stageId || null;
      let selectedStage: { stageId: string; status: TaskStatus; isCompleted: boolean } | undefined;
      if (boardId) {
        const board = await assertBoardAccess(req.user!, boardId);
        if (board.archived) {
          throw new HttpError(409, "Restore this board before adding tasks");
        }
        if (
          board.accessType === TaskBoardAccessType.MEMBER_GATED &&
          employeeIds.some(
            (employeeId) => !board.members.some((member) => member.employeeId === employeeId),
          )
        ) {
          throw new HttpError(400, "Every assignee must be a member of this board");
        }
        if (board.accessType === TaskBoardAccessType.ROLE_GATED) {
          const allowedRoles = new Set(board.roleAccess.map((entry) => entry.role));
          const employeeUsers = await prisma.employee.findMany({
            where: { employeeId: { in: employeeIds } },
            select: { employeeId: true, user: { select: { role: true } } },
          });
          if (
            employeeUsers.some(
              (employee) => !employee.user || !allowedRoles.has(employee.user.role),
            )
          ) {
            throw new HttpError(400, "Every assignee must have a role allowed by this board");
          }
        }
        const stage = stageId
          ? board.stages.find((entry) => entry.stageId === stageId)
          : board.stages[0];
        if (!stage) throw new HttpError(400, "Select a stage from this board");
        stageId = stage.stageId;
        selectedStage = stage;
      } else if (stageId) {
        throw new HttpError(400, "A stage requires a board");
      }
      const { assigneeEmployeeIds: _assigneeEmployeeIds, ...taskData } = body;
      const task = await prisma.workTask.create({
        data: {
          ...taskData,
          boardId,
          stageId,
          status: selectedStage ? taskStatusForStage(selectedStage) : undefined,
          progress: selectedStage?.isCompleted ? 100 : undefined,
          completedAt: selectedStage?.isCompleted ? new Date() : undefined,
          description: body.description || null,
          parentTaskId: body.parentTaskId || null,
          createdByUserId: req.user!.id,
          assignments: {
            create: employeeIds.map((employeeId) => ({
              employeeId,
              assignedByUserId: req.user!.id,
            })),
          },
          updates: {
            create: {
              authorUserId: req.user!.id,
              activityType: "CREATED",
              message: "Task created",
              status: selectedStage?.status ?? TaskStatus.TODO,
              progress: selectedStage?.isCompleted ? 100 : 0,
              metadata: { assigneeEmployeeIds: employeeIds },
            },
          },
        },
        include: taskInclude,
      });
      await audit({
        action: "task assigned",
        performedByUserId: req.user!.id,
        newValue: {
          taskId: task.taskId,
          title: task.title,
          assigneeEmployeeIds: employeeIds,
        },
        ipAddress: req.ip,
      });
      res.status(201).json(taskDto(task));
    }),
  );

  app.patch(
    "/tasks/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = taskUpdateSchema.parse(req.body);
      const existing = await prisma.workTask.findUniqueOrThrow({
        where: { taskId: String(req.params.id) },
      });
      const { visibleIds, assignableIds } = await taskScope(req.user!);
      const existingAssignments = await prisma.taskAssignment.findMany({
        where: { taskId: existing.taskId },
        select: { employeeId: true },
      });
      const existingEmployeeIds = existingAssignments.map(({ employeeId }) => employeeId);
      if (visibleIds && !existingEmployeeIds.some((id) => visibleIds.includes(id)))
        throw new HttpError(403, "Task is outside your organization team");
      const isOwn = !!req.user!.employeeId && existingEmployeeIds.includes(req.user!.employeeId);
      const canManage =
        assignableIds === undefined || existingEmployeeIds.some((id) => assignableIds.includes(id));
      if (!canManage && !isOwn) throw new HttpError(403, "You cannot update this task");
      if (
        !canManage &&
        Object.keys(body).some((key) => !["version", "status", "progress", "stageId"].includes(key))
      )
        throw new HttpError(403, "Employees can update only task status and progress");
      if (
        body.assigneeEmployeeIds &&
        assignableIds &&
        body.assigneeEmployeeIds.some((id) => !assignableIds.includes(id))
      )
        throw new HttpError(403, "Tasks can only be reassigned within your organization team");
      const replacementIds = body.assigneeEmployeeIds
        ? [...new Set(body.assigneeEmployeeIds)]
        : undefined;
      if (replacementIds) {
        const activeAssigneeCount = await prisma.employee.count({
          where: { employeeId: { in: replacementIds }, status: "ACTIVE" },
        });
        if (activeAssigneeCount !== replacementIds.length) {
          throw new HttpError(400, "Select active employees");
        }
      }

      const board = existing.boardId
        ? await assertBoardAccess(req.user!, existing.boardId)
        : undefined;
      if (board?.archived) {
        throw new HttpError(409, "Restore this board before changing its tasks");
      }
      if (replacementIds && board) {
        if (
          board.accessType === TaskBoardAccessType.MEMBER_GATED &&
          replacementIds.some(
            (employeeId) => !board.members.some((member) => member.employeeId === employeeId),
          )
        ) {
          throw new HttpError(400, "Every assignee must be a member of this board");
        }
        if (board.accessType === TaskBoardAccessType.ROLE_GATED) {
          const allowedRoles = new Set(board.roleAccess.map((entry) => entry.role));
          const employeeUsers = await prisma.employee.findMany({
            where: { employeeId: { in: replacementIds } },
            select: { user: { select: { role: true } } },
          });
          if (
            employeeUsers.length !== replacementIds.length ||
            employeeUsers.some(
              (employee) => !employee.user || !allowedRoles.has(employee.user.role),
            )
          ) {
            throw new HttpError(400, "Every assignee must have a role allowed by this board");
          }
        }
      }

      let nextStageId: string | null | undefined;
      let nextStatus = body.status;
      if (body.stageId) {
        const stage = await prisma.taskStage.findUniqueOrThrow({
          where: { stageId: body.stageId },
        });
        if (!existing.boardId || stage.boardId !== existing.boardId) {
          throw new HttpError(400, "Select a stage from the task's current workspace");
        }
        if (body.status && body.status !== stage.status) {
          throw new HttpError(400, "The selected stage and status do not match");
        }
        nextStageId = stage.stageId;
        nextStatus = stage.status;
      } else if (body.status && board) {
        if (body.status === TaskStatus.CANCELLED) {
          nextStageId = null;
        } else {
          const matchingStage = board.stages.find((stage) => stage.status === body.status);
          if (!matchingStage) {
            throw new HttpError(400, "This workspace has no stage for the selected status");
          }
          nextStageId = matchingStage.stageId;
        }
      } else if (body.stageId === null && existing.boardId) {
        throw new HttpError(400, "Workspace tasks must remain in a stage");
      }

      const nextStartDate = body.startDate === undefined ? existing.startDate : body.startDate;
      const nextDueDate = body.dueDate === undefined ? existing.dueDate : body.dueDate;
      if (nextStartDate && nextDueDate && nextDueDate < nextStartDate) {
        throw new HttpError(400, "Due date cannot be before the start date");
      }

      const effectiveStatus = nextStatus ?? existing.status;
      const nextProgress =
        effectiveStatus === TaskStatus.COMPLETED ? 100 : (body.progress ?? existing.progress);
      const activityType = replacementIds
        ? TaskActivityType.ASSIGNEES_CHANGED
        : nextStatus !== undefined || nextStageId !== undefined
          ? TaskActivityType.STATUS_CHANGED
          : body.progress !== undefined
            ? TaskActivityType.PROGRESS_UPDATED
            : TaskActivityType.DETAILS_UPDATED;
      const activityMessage =
        activityType === TaskActivityType.ASSIGNEES_CHANGED
          ? "Assignees updated"
          : activityType === TaskActivityType.STATUS_CHANGED
            ? "Workflow status updated"
            : activityType === TaskActivityType.PROGRESS_UPDATED
              ? "Progress updated"
              : "Task details updated";
      const metadata = JSON.parse(
        JSON.stringify({
          previousStatus: existing.status,
          status: effectiveStatus,
          previousProgress: existing.progress,
          progress: nextProgress,
          assigneeEmployeeIds: replacementIds,
        }),
      ) as Prisma.InputJsonObject;

      const task = await prisma.$transaction(async (transaction) => {
        const updated = await transaction.workTask.updateMany({
          where: { taskId: existing.taskId, version: body.version },
          data: {
            title: body.title,
            description: body.description,
            priority: body.priority,
            status: nextStatus,
            progress: body.progress !== undefined || nextStatus ? nextProgress : undefined,
            startDate: body.startDate,
            dueDate: body.dueDate,
            stageId: nextStageId,
            completedAt:
              nextStatus === TaskStatus.COMPLETED
                ? (existing.completedAt ?? new Date())
                : nextStatus
                  ? null
                  : undefined,
            version: { increment: 1 },
            lastActivityAt: new Date(),
          },
        });
        if (updated.count !== 1) {
          throw new HttpError(409, "This task changed in another session. Refresh and try again");
        }
        if (replacementIds) {
          await transaction.taskAssignment.deleteMany({ where: { taskId: existing.taskId } });
          await transaction.taskAssignment.createMany({
            data: replacementIds.map((employeeId) => ({
              taskId: existing.taskId,
              employeeId,
              assignedByUserId: req.user!.id,
            })),
          });
        }
        await transaction.taskUpdate.create({
          data: {
            taskId: existing.taskId,
            authorUserId: req.user!.id,
            activityType,
            message: activityMessage,
            status: nextStatus,
            progress: body.progress !== undefined || nextStatus ? nextProgress : undefined,
            metadata,
          },
        });
        return transaction.workTask.findUniqueOrThrow({
          where: { taskId: existing.taskId },
          include: taskInclude,
        });
      });
      await audit({
        action: "task updated",
        performedByUserId: req.user!.id,
        newValue: {
          taskId: task.taskId,
          version: task.version,
          status: task.status,
          progress: task.progress,
        },
        ipAddress: req.ip,
      });
      res.json(taskDto(task));
    }),
  );

  app.post(
    "/tasks/:id/logs",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = taskLogSchema.parse(req.body);
      const existing = await prisma.workTask.findUniqueOrThrow({
        where: { taskId: String(req.params.id) },
      });
      const { visibleIds } = await taskScope(req.user!);
      const assignments = await prisma.taskAssignment.findMany({
        where: { taskId: existing.taskId },
        select: { employeeId: true },
      });
      if (visibleIds && !assignments.some(({ employeeId }) => visibleIds.includes(employeeId))) {
        throw new HttpError(403, "Task is outside your organization team");
      }

      const board = existing.boardId
        ? await assertBoardAccess(req.user!, existing.boardId)
        : undefined;
      if (board?.archived) {
        throw new HttpError(409, "Restore this board before changing its tasks");
      }
      let nextStageId: string | null | undefined;
      if (body.status && board) {
        if (body.status === TaskStatus.CANCELLED) {
          nextStageId = null;
        } else {
          const matchingStage = board.stages.find((stage) => stage.status === body.status);
          if (!matchingStage) {
            throw new HttpError(400, "This workspace has no stage for the selected status");
          }
          nextStageId = matchingStage.stageId;
        }
      }
      const effectiveStatus = body.status ?? existing.status;
      const progress = effectiveStatus === TaskStatus.COMPLETED ? 100 : body.progress;
      const activityType = body.status
        ? TaskActivityType.STATUS_CHANGED
        : body.progress !== undefined
          ? TaskActivityType.PROGRESS_UPDATED
          : TaskActivityType.COMMENT;
      const { version: _version, ...logData } = body;
      const task = await prisma.$transaction(async (transaction) => {
        const updated = await transaction.workTask.updateMany({
          where: { taskId: existing.taskId, version: body.version },
          data: {
            progress,
            status: body.status,
            stageId: nextStageId,
            completedAt:
              body.status === TaskStatus.COMPLETED
                ? (existing.completedAt ?? new Date())
                : body.status
                  ? null
                  : undefined,
            version: { increment: 1 },
            lastActivityAt: new Date(),
          },
        });
        if (updated.count !== 1) {
          throw new HttpError(409, "This task changed in another session. Refresh and try again");
        }
        await transaction.taskUpdate.create({
          data: {
            taskId: existing.taskId,
            authorUserId: req.user!.id,
            ...logData,
            progress,
            activityType,
          },
        });
        return transaction.workTask.findUniqueOrThrow({
          where: { taskId: existing.taskId },
          include: taskInclude,
        });
      });
      res.status(201).json(taskDto(task));
    }),
  );

  app.get("/push/public-key", requireAuth, (_req, res) => {
    res.json({ publicKey: isWebPushConfigured() ? config.vapidPublicKey : null });
  });

  app.post(
    "/push/subscriptions",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!isWebPushConfigured()) throw new HttpError(503, "Push notifications are not configured");
      const body = pushSubscriptionSchema.parse(req.body);
      const endpointHash = createHash("sha256").update(body.endpoint).digest("hex");
      await prisma.pushSubscription.upsert({
        where: { endpointHash },
        create: {
          userId: req.user!.id,
          endpoint: body.endpoint,
          endpointHash,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userAgent: req.get("user-agent"),
        },
        update: {
          userId: req.user!.id,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userAgent: req.get("user-agent"),
        },
      });
      res.status(201).json({ ok: true });
    }),
  );

  app.delete(
    "/push/subscriptions",
    requireAuth,
    asyncHandler(async (req, res) => {
      const endpoint = z.object({ endpoint: z.string().url() }).parse(req.body).endpoint;
      const endpointHash = createHash("sha256").update(endpoint).digest("hex");
      await prisma.pushSubscription.deleteMany({
        where: { endpointHash, userId: req.user!.id },
      });
      res.json({ ok: true });
    }),
  );

  app.get(
    "/announcements",
    requireAuth,
    asyncHandler(async (req, res) => {
      const announcementManagerRoles: Role[] = [Role.HR, Role.DEVELOPER_ADMIN];
      const canManage = announcementManagerRoles.includes(req.user!.role);
      const includeInactive = canManage && req.query.includeInactive === "true";
      const now = new Date();
      const announcements = await prisma.announcement.findMany({
        where: includeInactive
          ? {}
          : {
              isActive: true,
              publishAt: { lte: now },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
        include: { createdBy: true },
        orderBy: [{ priority: "desc" }, { publishAt: "desc" }],
        take: listLimit(req, 100, 250),
      });
      res.json(announcements.map(announcementDto));
    }),
  );

  app.get("/notifications/stream", requireAuth, openNotificationStream);

  app.post(
    "/announcements",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = announcementSchema.parse(req.body);
      if (body.expiresAt && body.expiresAt <= new Date()) {
        throw new HttpError(400, "Display-until date and time must be in the future");
      }
      const announcement = await prisma.announcement.create({
        data: {
          ...body,
          publishAt: body.publishAt ?? new Date(),
          expiresAt: body.expiresAt ?? null,
          createdById: req.user!.id,
        },
        include: { createdBy: true },
      });
      await audit({
        action: "announcement created",
        performedByUserId: req.user!.id,
        newValue: { announcementId: announcement.announcementId, title: announcement.title },
        ipAddress: req.ip,
      });
      publishNotificationChange("announcement-created", announcement.announcementId);
      void sendPushToAll({
        title: `New announcement: ${announcement.title}`,
        body:
          announcement.message.length > 180
            ? `${announcement.message.slice(0, 177)}...`
            : announcement.message,
        href: "/notifications",
        tag: `announcement-${announcement.announcementId}`,
        priority: announcement.priority,
      });
      res.status(201).json(announcementDto(announcement));
    }),
  );

  app.patch(
    "/announcements/:id",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = announcementUpdateSchema.parse(req.body);
      const existing = await prisma.announcement.findUniqueOrThrow({
        where: { announcementId: String(req.params.id) },
      });
      const publishAt = body.publishAt ?? existing.publishAt;
      const expiresAt = body.expiresAt === undefined ? existing.expiresAt : body.expiresAt;
      if (expiresAt && expiresAt <= publishAt) {
        throw new HttpError(400, "Expiry must be after the publish date");
      }
      const announcement = await prisma.announcement.update({
        where: { announcementId: existing.announcementId },
        data: body,
        include: { createdBy: true },
      });
      await audit({
        action: "announcement updated",
        performedByUserId: req.user!.id,
        oldValue: { title: existing.title, isActive: existing.isActive },
        newValue: { title: announcement.title, isActive: announcement.isActive },
        ipAddress: req.ip,
      });
      publishNotificationChange("announcement-updated", announcement.announcementId);
      res.json(announcementDto(announcement));
    }),
  );

  app.delete(
    "/announcements/:id",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const announcement = await prisma.announcement.update({
        where: { announcementId: String(req.params.id) },
        data: { isActive: false },
        include: { createdBy: true },
      });
      await audit({
        action: "announcement deactivated",
        performedByUserId: req.user!.id,
        newValue: { announcementId: announcement.announcementId, title: announcement.title },
        ipAddress: req.ip,
      });
      publishNotificationChange("announcement-deactivated", announcement.announcementId);
      res.json(announcementDto(announcement));
    }),
  );

  app.delete(
    "/announcements/:id/permanent",
    requireAuth,
    requireRoles(Role.HR, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      if (req.body?.confirmation !== "DELETE") {
        throw new HttpError(400, "Type DELETE to confirm permanent announcement deletion");
      }
      const announcement = await prisma.announcement.delete({
        where: { announcementId: String(req.params.id) },
      });
      await audit({
        action: "announcement permanently deleted",
        performedByUserId: req.user!.id,
        newValue: { announcementId: announcement.announcementId, title: announcement.title },
        ipAddress: req.ip,
      });
      publishNotificationChange("announcement-deleted", announcement.announcementId);
      res.json({ ok: true });
    }),
  );

  app.get(
    "/notifications",
    requireAuth,
    asyncHandler(async (req, res) => {
      const operationalRoles: Role[] = [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR, Role.CEO];
      const canSeeOperational = operationalRoles.includes(req.user!.role);
      const canSeeTeam = req.user!.role === Role.MANAGER && !!req.user!.employeeId;
      const leaveWhere: Prisma.LeaveRequestWhereInput = canSeeOperational
        ? {}
        : canSeeTeam
          ? {
              status: "PENDING",
              employeeId: { in: await getOrganizationTeamEmployeeIds(req.user!.employeeId!) },
            }
          : req.user!.employeeId
            ? { employeeId: req.user!.employeeId }
            : { employeeId: "__none__" };
      const leaveWorkflowTitle: Record<string, string> = {
        PENDING: "Leave submitted — awaiting organization head",
        APPROVED: "Leave approved by organization head",
        MANAGER_APPROVED: "Leave approved by organization head",
        HR_VERIFIED: "Leave HR verified",
        REJECTED: "Leave rejected by organization head",
        CANCELLED: "Leave cancelled",
      };
      const currentEmployee = req.user!.employeeId
        ? await prisma.employee.findUnique({
            where: { employeeId: req.user!.employeeId },
            select: { homeBranchId: true },
          })
        : null;
      const holidayBranchId = currentEmployee?.homeBranchId;
      const correctionNotifications = req.user!.employeeId
        ? await prisma.attendanceCorrectionRequest.findMany({
            where: {
              OR: [
                { employeeId: req.user!.employeeId },
                { approverId: req.user!.employeeId, status: "PENDING" },
              ],
            },
            include: { employee: { select: { name: true } } },
            orderBy: { updatedAt: "desc" },
            take: 10,
          })
        : [];
      const weeklyOffNotifications = req.user!.employeeId
        ? await prisma.weeklyOffRequest.findMany({
            where: {
              OR: [
                { employeeId: req.user!.employeeId },
                { approverId: req.user!.employeeId, status: "PENDING" },
              ],
            },
            include: { employee: { select: { name: true } } },
            orderBy: { updatedAt: "desc" },
            take: 10,
          })
        : [];
      const attendanceReminders = req.user!.employeeId
        ? await prisma.attendanceReminder.findMany({
            where: { employeeId: req.user!.employeeId, resolvedAt: null },
            orderBy: { createdAt: "desc" },
            take: 5,
          })
        : [];

      const suspensionWindowEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const suspensionManagerRoles: Role[] = [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR];
      const canManageSuspensions = suspensionManagerRoles.includes(req.user!.role);
      const canManageEmployeeServices =
        req.user!.role === Role.HR || req.user!.role === Role.DEVELOPER_ADMIN;
      const [
        pendingLeaves,
        holidays,
        birthdayEmployees,
        upcomingSuspensions,
        assignedTasks,
        expenseNotifications,
        certificateNotifications,
      ] = await Promise.all([
        prisma.leaveRequest.findMany({
          where: leaveWhere,
          include: { employee: true, leaveType: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.holiday.findMany({
          where: {
            status: "ACTIVE",
            date: { gte: new Date() },
            OR: holidayBranchId
              ? [{ branchId: null }, { branchId: holidayBranchId }]
              : [{ branchId: null }],
          },
          orderBy: { date: "asc" },
          take: 5,
        }),
        prisma.employee.findMany({
          where: {
            dateOfBirth: { not: null },
            status: "ACTIVE",
          },
          select: {
            employeeId: true,
            name: true,
            dateOfBirth: true,
          },
        }),
        prisma.user.findMany({
          where: {
            suspensionStartsAt: { gt: new Date(), lte: suspensionWindowEnd },
            suspendedUntil: { gt: new Date() },
            ...(canManageSuspensions ? {} : { id: req.user!.id }),
          },
          select: { id: true, name: true, suspensionStartsAt: true, suspendedUntil: true },
          orderBy: { suspensionStartsAt: "asc" },
          take: canManageSuspensions ? 50 : 1,
        }),
        req.user!.employeeId
          ? prisma.workTask.findMany({
              where: {
                assignments: { some: { employeeId: req.user!.employeeId } },
                status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
              },
              orderBy: { updatedAt: "desc" },
              take: 10,
            })
          : Promise.resolve([]),
        canManageEmployeeServices || req.user!.employeeId
          ? prisma.expenseClaim.findMany({
              where: canManageEmployeeServices ? {} : { employeeId: req.user!.employeeId! },
              include: { employee: { select: { name: true } } },
              orderBy: { updatedAt: "desc" },
              take: 10,
            })
          : Promise.resolve([]),
        canManageEmployeeServices || req.user!.employeeId
          ? prisma.certificateRequest.findMany({
              where: canManageEmployeeServices ? {} : { employeeId: req.user!.employeeId! },
              include: { employee: { select: { name: true } } },
              orderBy: { updatedAt: "desc" },
              take: 10,
            })
          : Promise.resolve([]),
      ]);

      const today = new Date();
      const todayMonth = today.getUTCMonth();
      const todayDate = today.getUTCDate();

      const announcements = await prisma.announcement.findMany({
        where: {
          isActive: true,
          publishAt: { lte: today },
          OR: [{ expiresAt: null }, { expiresAt: { gt: today } }],
        },
        include: { createdBy: true },
        orderBy: { publishAt: "desc" },
        take: 10,
      });

      const birthdayItems = birthdayEmployees
        .filter((emp) => {
          const dob = new Date(emp.dateOfBirth!);
          return dob.getUTCMonth() === todayMonth && dob.getUTCDate() === todayDate;
        })
        .map((emp) => {
          const isCurrentUser = emp.employeeId === req.user!.employeeId;
          return {
            id: `birthday-${emp.employeeId}-${today.toISOString().slice(0, 10)}`,
            title: isCurrentUser ? "Happy Birthday! 🎂" : "Birthday Celebration! 🎉",
            desc: isCurrentUser
              ? `Happy Birthday, ${emp.name}! Wishing you a fantastic day and a wonderful year ahead!`
              : `${emp.name} is celebrating their birthday today! Join us in wishing them a great day.`,
            time: new Date(Date.UTC(today.getUTCFullYear(), todayMonth, todayDate)).toISOString(),
            type: "birthday",
          };
        });

      const items = [
        ...announcements.map((announcement) => ({
          id: `announcement-${announcement.announcementId}-${announcement.updatedAt.toISOString()}`,
          title: announcement.title,
          desc: announcement.message,
          time: announcement.publishAt.toISOString(),
          type: "announcement" as const,
          priority: announcement.priority,
          authorName: announcement.createdBy.name,
        })),
        ...assignedTasks.map((task) => ({
          id: `task-${task.taskId}-${task.updatedAt.toISOString()}`,
          title: task.status === TaskStatus.TODO ? "New task assigned" : "Task progress reminder",
          desc: `${task.title}${task.dueDate ? ` - due ${task.dueDate.toISOString().slice(0, 10)}` : ""}`,
          time: task.updatedAt.toISOString(),
          type: "task" as const,
        })),
        ...upcomingSuspensions.map((account) => {
          const endDate = account.suspendedUntil!.toISOString().slice(0, 10);
          const startDate = account.suspensionStartsAt!.toISOString().slice(0, 10);
          const daysRemaining = Math.max(
            1,
            Math.ceil((account.suspensionStartsAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
          );
          const isOwnAccount = account.id === req.user!.id;
          return {
            id: `suspension-${account.id}-${endDate}`,
            title: isOwnAccount ? "Account suspension notice" : "Upcoming account suspension",
            desc: isOwnAccount
              ? `Your account will be suspended in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}, from ${startDate} through ${endDate}. Contact HR if you need an extension.`
              : `${account.name}'s account will be suspended in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}, from ${startDate} through ${endDate}.`,
            time: new Date().toISOString(),
            type: "system" as const,
          };
        }),
        ...birthdayItems,
        ...attendanceReminders.map((reminder) => ({
          id: `attendance-reminder-${reminder.reminderId}`,
          title: "Attendance is still running",
          desc: `You have been checked in for more than 9 hours since ${reminder.eventTime.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}. Check out when your work is complete.`,
          time: reminder.createdAt.toISOString(),
          type: "attendance" as const,
        })),
        ...pendingLeaves.map((leave) => ({
          id: `leave-${leave.leaveRequestId}`,
          title:
            leave.employeeId === req.user!.employeeId
              ? (leaveWorkflowTitle[leave.status] ?? `Leave ${leave.status.toLowerCase()}`)
              : canSeeOperational
                ? (leaveWorkflowTitle[leave.status] ?? "Leave update")
                : leave.status === "PENDING"
                  ? "Leave approval pending"
                  : (leaveWorkflowTitle[leave.status] ?? "Leave update"),
          desc: `${leave.employee.name} - ${leave.leaveType.name} from ${leave.fromDate
            .toISOString()
            .slice(0, 10)} to ${leave.toDate.toISOString().slice(0, 10)}`,
          time: (leave.updatedAt ?? leave.createdAt).toISOString(),
          type: "leave",
        })),
        ...correctionNotifications.map((request) => ({
          id: `attendance-correction-${request.requestId}-${request.updatedAt.toISOString()}`,
          title:
            request.employeeId === req.user!.employeeId
              ? request.status === "PENDING"
                ? "Punch request awaiting your head"
                : `Punch request ${request.status.toLowerCase()}`
              : "Punch approval pending",
          desc: `${request.employee.name} - ${request.eventType.replaceAll("_", " ").toLowerCase()} on ${request.date.toISOString().slice(0, 10)}`,
          time: request.updatedAt.toISOString(),
          type: "attendance" as const,
        })),
        ...weeklyOffNotifications.map((request) => ({
          id: `weekly-off-${request.weeklyOffRequestId}-${request.updatedAt.toISOString()}`,
          title:
            request.employeeId === req.user!.employeeId
              ? request.status === "PENDING"
                ? "Weekly off awaiting your head"
                : `Weekly off ${request.status.toLowerCase()}`
              : "Weekly-off approval pending",
          desc: `${request.employee.name} - ${request.date.toISOString().slice(0, 10)}`,
          time: request.updatedAt.toISOString(),
          type: "leave" as const,
        })),
        ...expenseNotifications.map((claim) => ({
          id: `expense-${claim.claimId}-${claim.updatedAt.toISOString()}`,
          title:
            claim.employeeId === req.user!.employeeId
              ? `Expense claim ${claim.status.toLowerCase()}`
              : claim.status === "PENDING"
                ? "New expense claim"
                : "Expense claim updated",
          desc: `${claim.employee.name} - ${claim.claimType === "ADVANCE" ? "advance expense" : (claim.title ?? "expense")} - INR ${Number(claim.amount).toLocaleString("en-IN")}`,
          time: claim.updatedAt.toISOString(),
          type: "system" as const,
        })),
        ...certificateNotifications.map((request) => ({
          id: `certificate-${request.certificateRequestId}-${request.updatedAt.toISOString()}`,
          title:
            request.employeeId === req.user!.employeeId
              ? `HR document request ${request.status.replaceAll("_", " ").toLowerCase()}`
              : request.status === "PENDING"
                ? "New HR document request"
                : "HR document request updated",
          desc: `${request.employee.name} - ${request.certificateType.replaceAll("_", " ").toLowerCase()}`,
          time: request.updatedAt.toISOString(),
          type: "system" as const,
        })),
        ...holidays.map((holiday) => ({
          id: `holiday-${holiday.holidayId}`,
          title: "Upcoming holiday",
          desc: `${holiday.name} on ${holiday.date.toISOString().slice(0, 10)}`,
          time: holiday.updatedAt.toISOString(),
          type: "holiday",
        })),
      ]
        .sort((a, b) => +new Date(b.time) - +new Date(a.time))
        .slice(0, 30);

      res.json(items);
    }),
  );

  app.get(
    "/holidays",
    requireAuth,
    asyncHandler(async (req, res) => {
      const activeOnly = req.query.includeInactive !== "true";
      const holidays = await prisma.holiday.findMany({
        where: activeOnly ? { status: "ACTIVE" } : {},
        orderBy: { date: "asc" },
        take: listLimit(req, 500, 1000),
      });
      res.json(holidays.map(holidayDto));
    }),
  );

  async function recalculateHolidayImpact(date: Date, branchId: string | null) {
    const summaries = await prisma.attendanceDailySummary.findMany({
      where: {
        date: startOfDayUtc(date),
        ...(branchId ? { employee: { homeBranchId: branchId } } : {}),
      },
      select: { employeeId: true },
    });
    for (const summary of summaries) {
      await recalculateDailySummary(summary.employeeId, date);
    }
  }

  async function assertNoDuplicateHoliday(input: {
    date: Date;
    branchId?: string | null;
    excludeHolidayId?: string;
  }) {
    const duplicate = await prisma.holiday.findFirst({
      where: {
        date: startOfDayUtc(input.date),
        branchId: input.branchId || null,
        status: "ACTIVE",
        ...(input.excludeHolidayId ? { holidayId: { not: input.excludeHolidayId } } : {}),
      },
      select: { name: true },
    });
    if (duplicate) {
      throw new HttpError(
        409,
        `A holiday named ${duplicate.name} already exists for this date and branch.`,
      );
    }
  }

  app.post(
    "/holidays",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = holidaySchema.parse(req.body);
      await assertNoDuplicateHoliday({ date: body.date, branchId: body.branchId });
      const holiday = await prisma.holiday.create({
        data: { ...body, branchId: body.branchId || null },
      });
      await recalculateHolidayImpact(holiday.date, holiday.branchId);
      await audit({
        action: "holiday created",
        performedByUserId: req.user!.id,
        newValue: { holidayId: holiday.holidayId, name: holiday.name },
        ipAddress: req.ip,
      });
      res.status(201).json(holidayDto(holiday));
    }),
  );

  app.patch(
    "/holidays/:id",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = holidayUpdateSchema.parse(req.body);
      const existing = await prisma.holiday.findUniqueOrThrow({
        where: { holidayId: String(req.params.id) },
      });
      await assertNoDuplicateHoliday({
        date: body.date ?? existing.date,
        branchId: body.branchId === undefined ? existing.branchId : body.branchId,
        excludeHolidayId: existing.holidayId,
      });
      const holiday = await prisma.holiday.update({
        where: { holidayId: String(req.params.id) },
        data: {
          ...body,
          branchId: body.branchId === undefined ? undefined : body.branchId || null,
        },
      });
      await recalculateHolidayImpact(existing.date, existing.branchId);
      if (
        holiday.date.getTime() !== existing.date.getTime() ||
        holiday.branchId !== existing.branchId
      ) {
        await recalculateHolidayImpact(holiday.date, holiday.branchId);
      }
      await audit({
        action: "holiday updated",
        performedByUserId: req.user!.id,
        oldValue: { name: existing.name, date: existing.date, status: existing.status },
        newValue: { name: holiday.name, date: holiday.date, status: holiday.status },
        ipAddress: req.ip,
      });
      res.json(holidayDto(holiday));
    }),
  );

  app.delete(
    "/holidays/:id",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const existing = await prisma.holiday.findUniqueOrThrow({
        where: { holidayId: String(req.params.id) },
      });
      const holiday = await prisma.holiday.update({
        where: { holidayId: String(req.params.id) },
        data: { status: "INACTIVE" },
      });
      await recalculateHolidayImpact(existing.date, existing.branchId);
      await audit({
        action: "holiday deactivated",
        performedByUserId: req.user!.id,
        newValue: { holidayId: holiday.holidayId, status: holiday.status },
        ipAddress: req.ip,
      });
      res.json(holidayDto(holiday));
    }),
  );

  app.use(errorHandler);
  return app;
}
