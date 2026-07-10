import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { EventSource, EventType, Prisma, Role, UserStatus, WorkType } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { audit } from "./audit.js";
import { birthdayMessage } from "./birthdayMessages.js";
import { isUpcomingBirthday } from "./birthdays.js";
import { ensureDailySummariesForRange, recalculateLeaveDateRange } from "./attendanceDayRules.js";
import { createAttendanceEvent, recalculateDailySummary } from "./attendanceEngine.js";
import { config } from "./config.js";
import { asyncHandler, errorHandler, HttpError } from "./errors.js";
import {
  attendanceRecordDto,
  biometricMappingDto,
  branchDto,
  deviceDto,
  employeeDto,
  eventDto,
  holidayDto,
  userDto,
} from "./mapper.js";
import { prisma } from "./prisma.js";
import { assertEmployeeAccess, canCreateRole, requireAuth, requireRoles } from "./rbac.js";
import {
  clearCookies,
  hashPassword,
  issueCookies,
  verifyPassword,
  verifyRefreshToken,
} from "./security.js";
import {
  biometricMappingSchema,
  biometricMappingUpdateSchema,
  biometricDeviceSchema,
  biometricDeviceUpdateSchema,
  branchSchema,
  branchUpdateSchema,
  changePasswordSchema,
  clientEventSchema,
  correctionSchema,
  createUserSchema,
  departmentSchema,
  departmentUpdateSchema,
  holidaySchema,
  holidayUpdateSchema,
  leaveRequestSchema,
  leaveTypeSchema,
  leaveTypeUpdateSchema,
  loginSchema,
  mobileEventSchema,
  profileEditSchema,
  predefinedPasswordSchema,
  resetPasswordSchema,
  thumbEventSchema,
  updateEmployeeSchema,
  updateUserSchema,
} from "./schemas.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
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
  app.use(express.json({ limit: "1mb" }));
  app.use(express.text({ type: "text/csv", limit: "5mb" }));
  app.use(cookieParser());
  app.use(cors({ origin: config.frontendOrigin, credentials: true }));
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

  function dateFromQuery(value: unknown) {
    if (!value || Array.isArray(value)) return undefined;
    return new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  }

  function employeeAttendanceVisibilityFilter(
    extra: Prisma.EmployeeWhereInput = {},
  ): Prisma.EmployeeWhereInput {
    const hasExtra = Object.keys(extra).length > 0;
    const excludeDeveloperAdmin: Prisma.EmployeeWhereInput = {
      OR: [{ user: null }, { user: { role: { not: Role.DEVELOPER_ADMIN } } }],
    };
    return hasExtra ? { AND: [extra, excludeDeveloperAdmin] } : excludeDeveloperAdmin;
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
    const manager = await prisma.employee.findUnique({
      where: { employeeId: managerId },
      include: { user: true },
    });
    if (!manager || manager.status !== "ACTIVE" || manager.user?.status !== "ACTIVE") {
      throw new HttpError(400, "Reporting manager must be active");
    }
    if (
      !manager.user ||
      !([Role.MANAGER, Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN] as Role[]).includes(
        manager.user.role,
      )
    ) {
      throw new HttpError(400, "Reporting manager must have Manager, HR, or Admin role");
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
    if (
      !head.user ||
      !([Role.MANAGER, Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN] as Role[]).includes(
        head.user.role,
      )
    ) {
      throw new HttpError(400, "Department head must have Manager, HR, or Admin role");
    }
  }

  function departmentDto(department: {
    departmentId: string;
    name: string;
    headEmployeeId: string | null;
    headEmployee?: { name: string } | null;
  }) {
    return {
      id: department.departmentId,
      name: department.name,
      headEmployeeId: department.headEmployeeId ?? undefined,
      head: department.headEmployee?.name ?? undefined,
    };
  }

  function leaveRequestDto(row: {
    leaveRequestId: string;
    employeeId: string;
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
  }) {
    const employeeStatusMap: Record<string, string> = {
      PENDING: "Pending",
      MANAGER_APPROVED: "Approved",
      HR_VERIFIED: "Approved",
      APPROVED: "Approved",
      REJECTED: "Rejected",
      CANCELLED: "Cancelled",
    };
    const workflowStatusMap: Record<string, string> = {
      PENDING: "Submitted — awaiting reporting manager",
      MANAGER_APPROVED: "Approved by reporting manager",
      HR_VERIFIED: "HR verified",
      APPROVED: "Approved by reporting manager",
      REJECTED: "Rejected by reporting manager",
      CANCELLED: "Cancelled",
    };
    return {
      id: row.leaveRequestId,
      employeeId: row.employeeId,
      employeeName: row.employee?.name ?? row.employeeId,
      managerName: row.employee?.manager?.name,
      type: row.leaveType?.name ?? "-",
      from: row.fromDate.toISOString().slice(0, 10),
      to: row.toDate.toISOString().slice(0, 10),
      days: Number(row.days),
      reason: row.reason,
      status: employeeStatusMap[row.status] ?? row.status,
      workflowStatus: workflowStatusMap[row.status] ?? row.status,
      appliedOn: row.createdAt.toISOString().slice(0, 10),
      updatedOn: row.updatedAt?.toISOString().slice(0, 10),
    };
  }

  function assertReportingManagerForLeave(
    user: { employeeId?: string | null },
    leave: { managerId?: string | null; employee: { managerId?: string | null } },
  ) {
    if (!user.employeeId) {
      throw new HttpError(403, "Only the assigned reporting manager can approve or reject leave.");
    }
    const isReportingManager =
      leave.managerId === user.employeeId || leave.employee.managerId === user.employeeId;
    if (!isReportingManager) {
      throw new HttpError(403, "Only the assigned reporting manager can approve or reject leave.");
    }
  }

  function leaveTypeDto(row: { leaveTypeId: string; name: string; paid: boolean }) {
    return { id: row.leaveTypeId, name: row.name, paid: row.paid };
  }

  async function nextEmployeeCode(tx: Prisma.TransactionClient) {
    const latest = await tx.employee.findFirst({
      orderBy: { employeeCode: "desc" },
      select: { employeeCode: true },
    });
    const current = Number(latest?.employeeCode.match(/\d+$/)?.[0] ?? "0");
    return `EMP-${String(current + 1).padStart(4, "0")}`;
  }

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get(
    "/health/db",
    asyncHandler(async (_req, res) => {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, provider: "mysql", database: "reachable" });
    }),
  );

  app.post(
    "/auth/login",
    authLimiter,
    asyncHandler(async (req, res) => {
      const body = loginSchema.parse(req.body);
      const user = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase() },
        include: { employee: true },
      });
      if (!user) throw new HttpError(401, "Invalid credentials");

      if (user.status === UserStatus.LOCKED) {
        throw new HttpError(403, "Account blocked. Please contact HR to reset your password.");
      }

      if (user.status !== UserStatus.ACTIVE) {
        throw new HttpError(401, "Invalid credentials");
      }

      const suspensionIsActive =
        user.suspensionStartsAt &&
        user.suspendedUntil &&
        user.suspensionStartsAt.getTime() <= Date.now() &&
        user.suspendedUntil.getTime() > Date.now();
      if (suspensionIsActive) {
        throw new HttpError(
          403,
          `Account suspended until ${user.suspendedUntil!.toISOString().slice(0, 10)}`,
        );
      }
      const ok = await verifyPassword(body.password, user.passwordHash);
      if (!ok) {
        const nextAttempts = user.failedLoginAttempts + 1;
        const isLocked = nextAttempts >= 5;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: nextAttempts,
            status: isLocked ? UserStatus.LOCKED : undefined,
          },
        });
        if (isLocked) {
          throw new HttpError(403, "Account blocked. Please contact HR to reset your password.");
        }
        const attemptsLeft = 5 - nextAttempts;
        throw new HttpError(
          401,
          `Invalid credentials. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left before your account is blocked.`,
        );
      }
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lastLoginAt: new Date(),
          ...(user.suspendedUntil && user.suspendedUntil.getTime() <= Date.now()
            ? { suspendedUntil: null, suspensionStartsAt: null }
            : {}),
        },
        include: { employee: true },
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
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
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
      const updated = await prisma.user.update({
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
        },
        include: { employee: true },
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
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
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
      if (existing.role === Role.DEVELOPER_ADMIN && req.user!.role !== Role.DEVELOPER_ADMIN) {
        throw new HttpError(403, "Only Developer Admin can suspend Developer Admin");
      }
      const updated = await prisma.user.update({
        where: { id },
        data: { suspensionStartsAt, suspendedUntil },
        include: { employee: true },
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
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const existing = await prisma.user.findUniqueOrThrow({ where: { id } });
      if (existing.id === req.user!.id) throw new HttpError(400, "You cannot deactivate yourself");
      if (existing.role === Role.DEVELOPER_ADMIN && req.user!.role !== Role.DEVELOPER_ADMIN) {
        throw new HttpError(403, "Only Developer Admin can deactivate Developer Admin");
      }
      const updated = await prisma.user.update({
        where: { id },
        data: { status: UserStatus.INACTIVE },
        include: { employee: true },
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
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const existing = await prisma.user.findUniqueOrThrow({
        where: { id },
        include: { employee: true },
      });
      if (existing.id === req.user!.id) {
        throw new HttpError(400, "You cannot delete your own account");
      }
      if (existing.role === Role.DEVELOPER_ADMIN && req.user!.role !== Role.DEVELOPER_ADMIN) {
        throw new HttpError(403, "Only Developer Admin can delete Developer Admin");
      }

      const employeeId = existing.employeeId;
      await prisma.$transaction(async (tx) => {
        await tx.user.updateMany({
          where: { createdByUserId: id },
          data: { createdByUserId: null },
        });
        await tx.auditLog.updateMany({
          where: { performedByUserId: id },
          data: { performedByUserId: null },
        });
        await tx.auditLog.updateMany({
          where: { affectedUserId: id },
          data: { affectedUserId: null },
        });
        if (employeeId) {
          await tx.department.updateMany({
            where: { headEmployeeId: employeeId },
            data: { headEmployeeId: null },
          });
          await tx.employee.updateMany({
            where: { managerId: employeeId },
            data: { managerId: null },
          });
          await tx.profileEditRequest.deleteMany({ where: { employeeId } });
          await tx.attendanceCorrectionRequest.deleteMany({ where: { employeeId } });
          await tx.leaveBalance.deleteMany({ where: { employeeId } });
          await tx.leaveRequest.deleteMany({ where: { employeeId } });
          await tx.biometricEmployeeMapping.deleteMany({ where: { employeeId } });
          await tx.fieldAttendance.deleteMany({ where: { employeeId } });
          await tx.attendanceDailySummary.deleteMany({ where: { employeeId } });
          await tx.attendanceEvent.deleteMany({ where: { employeeId } });
          await tx.employeeBranchSchedule.deleteMany({ where: { employeeId } });
          await tx.emergencyContact.deleteMany({ where: { employeeId } });
        }
        await tx.user.delete({ where: { id } });
        if (employeeId) await tx.employee.delete({ where: { employeeId } });
      });

      await audit({
        action: "user deleted",
        performedByUserId: req.user!.id,
        ipAddress: req.ip,
        newValue: {
          deletedUserId: id,
          deletedEmployeeId: employeeId,
          name: existing.name,
          email: existing.email,
          employeeDataPermanentlyDeleted: Boolean(employeeId),
        },
      });

      res.json({ ok: true });
    }),
  );

  app.post(
    "/users/:id/reset-password",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
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

  app.post("/auth/logout", (_req, res) => {
    clearCookies(res);
    res.json({ ok: true });
  });

  app.get(
    "/auth/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user!.id },
        include: { employee: true },
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
      const ok = await verifyPassword(body.oldPassword, user.passwordHash);
      if (!ok) throw new HttpError(401, "Current password is incorrect");
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(body.nextPassword),
          firstLoginPasswordChangeRequired: false,
          failedLoginAttempts: 0,
        },
        include: { employee: true },
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

  app.post("/auth/forgot-password", authLimiter, (_req, res) =>
    res.json({
      ok: true,
      message: "Password reset workflow is ready for mail/SMS provider integration.",
    }),
  );
  app.post("/auth/reset-password", authLimiter, (_req, res) =>
    res.json({ ok: true, message: "Reset token verification placeholder." }),
  );

  app.get(
    "/users",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const users = await prisma.user.findMany({
        include: { employee: true },
        orderBy: { createdAt: "desc" },
        take: listLimit(req, 750, 1000),
      });
      res.json(users.map(userDto));
    }),
  );

  app.post(
    "/users",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = createUserSchema.parse(req.body);
      if (!canCreateRole(req.user!.role, body.role))
        throw new HttpError(403, "This role cannot create the requested login");
      const employeeRoles = [
        Role.HR,
        Role.MANAGER,
        Role.EMPLOYEE,
        Role.SALES,
        Role.DRIVER,
        Role.FIELD_STAFF,
      ] as Role[];
      const shouldCreateEmployee = employeeRoles.includes(body.role) && !body.employeeId;
      if (shouldCreateEmployee) await assertValidManager("new-employee", body.managerId);
      const predefinedPassword = body.password
        ? null
        : await prisma.systemSetting.findUnique({ where: { key: "PREDEFINED_PASSWORD_HASH" } });
      if (!body.password && !predefinedPassword) {
        throw new HttpError(
          400,
          "No predefined password is configured. Ask HR or Admin to configure it in System Settings.",
        );
      }
      const passwordHash = body.password
        ? await hashPassword(body.password)
        : predefinedPassword!.value;
      const user = await prisma.$transaction(async (tx) => {
        const employee = shouldCreateEmployee
          ? await tx.employee.create({
              data: {
                employeeCode: body.employeeCode || (await nextEmployeeCode(tx)),
                name: body.name,
                email: body.email.toLowerCase(),
                phone: body.phone,
                departmentId: body.departmentId ?? undefined,
                designation: body.designation ?? undefined,
                homeBranchId: body.homeBranchId ?? undefined,
                managerId: body.managerId ?? undefined,
                attendanceMode: "BOTH",
                isFieldEmployee:
                  body.isFieldEmployee ??
                  ([Role.SALES, Role.DRIVER, Role.FIELD_STAFF] as Role[]).includes(body.role),
                joiningDate: body.joiningDate ?? undefined,
                dateOfBirth: body.dateOfBirth ?? undefined,
                gender: body.gender ?? undefined,
                employmentType: body.employmentType ?? "FULL_TIME",
              },
            })
          : null;
        return tx.user.create({
          data: {
            name: body.name,
            email: body.email.toLowerCase(),
            phone: body.phone,
            passwordHash,
            role: body.role,
            employeeId: body.employeeId ?? employee?.employeeId,
            createdByUserId: req.user!.id,
          },
          include: { employee: true },
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
    "/settings/security",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (_req, res) => {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: "PREDEFINED_PASSWORD_HASH" },
      });
      res.json({ predefinedPasswordConfigured: Boolean(setting) });
    }),
  );

  app.put(
    "/settings/security/predefined-password",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = predefinedPasswordSchema.parse(req.body);
      await prisma.systemSetting.upsert({
        where: { key: "PREDEFINED_PASSWORD_HASH" },
        create: {
          key: "PREDEFINED_PASSWORD_HASH",
          value: await hashPassword(body.password),
          updatedById: req.user!.id,
        },
        update: {
          value: await hashPassword(body.password),
          updatedById: req.user!.id,
        },
      });
      await audit({
        action: "predefined temporary password updated",
        performedByUserId: req.user!.id,
        ipAddress: req.ip,
      });
      res.json({ ok: true, predefinedPasswordConfigured: true });
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
      const teamCount = await prisma.employee.count({
        where: { managerId: req.user!.employeeId, status: "ACTIVE" },
      });
      res.json({ isReportingManager: teamCount > 0, teamCount });
    }),
  );

  app.get(
    "/employees",
    requireAuth,
    asyncHandler(async (req, res) => {
      const where =
        req.user!.role === Role.MANAGER && req.user!.employeeId
          ? { managerId: req.user!.employeeId }
          : {};
      const employees = await prisma.employee.findMany({
        where,
        include: { user: true, department: true, homeBranch: true, manager: true },
        orderBy: { employeeCode: "asc" },
        take: listLimit(req, 750, 1000),
      });
      res.json(employees.map((emp) => employeeDto(emp, req.user!)));
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
      res.json(employeeDto(employee, req.user!));
    }),
  );

  app.patch(
    "/employees/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const employeeId = String(req.params.id);
      const body = updateEmployeeSchema.parse(req.body);
      const existing = await prisma.employee.findUniqueOrThrow({ where: { employeeId } });
      await assertValidManager(employeeId, body.managerId);
      const employee = await prisma.employee.update({
        where: { employeeId },
        data: body,
        include: { user: true, department: true, homeBranch: true, manager: true },
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
      res.json(employeeDto(employee, req.user!));
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

  app.post(
    "/branches",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = branchSchema.parse(req.body);
      const branch = await prisma.branch.create({
        data: {
          branchName: body.name,
          branchCode: body.code,
          address: body.address,
          city: body.city ?? undefined,
          status: body.status ?? "ACTIVE",
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
      const branch = await prisma.branch.update({
        where: { branchId: String(req.params.id) },
        data: {
          branchName: body.name,
          branchCode: body.code,
          address: body.address,
          city: body.city,
          status: body.status,
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
    asyncHandler(async (_req, res) => {
      const departments = await prisma.department.findMany({
        include: { headEmployee: true },
        orderBy: { name: "asc" },
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
      const department = await prisma.department.create({
        data: { name: body.name, headEmployeeId: body.headEmployeeId ?? undefined },
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
      const department = await prisma.department.update({
        where: { departmentId: String(req.params.id) },
        data: { name: body.name, headEmployeeId: body.headEmployeeId },
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
    await assertEmployeeAccess(req.user, employeeId);
    const eventDate = new Date(new Date().toISOString().slice(0, 10));
    const latestEvent = await prisma.attendanceEvent.findFirst({
      where: { employeeId, eventDate },
      orderBy: { eventTime: "desc" },
    });
    const openInTypes = new Set<EventType>([
      EventType.OFFICE_IN,
      EventType.BRANCH_IN,
      EventType.FIELD_CHECK_IN,
      EventType.CLIENT_CHECK_IN,
      EventType.BREAK_IN,
    ]);
    const latestIsOpen = latestEvent ? openInTypes.has(latestEvent.eventType) : false;
    const isCheckOut = type === EventType.FIELD_CHECK_OUT || type === EventType.CLIENT_CHECK_OUT;
    if (!isCheckOut && latestIsOpen) {
      throw new HttpError(409, "You are already checked in. Refresh to see the latest punch.");
    }
    if (isCheckOut && !latestIsOpen) {
      throw new HttpError(409, "No active check-in was found. Refresh to see the latest punch.");
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
    const event = await createAttendanceEvent({
      employeeId,
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

  app.get(
    "/attendance/my/today",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(404, "No employee profile");
      const today = new Date().toISOString().slice(0, 10);
      await recalculateDailySummary(req.user!.employeeId, today);
      const summary = await prisma.attendanceDailySummary.findUnique({
        where: {
          employeeId_date: {
            employeeId: req.user!.employeeId,
            date: new Date(`${today}T00:00:00.000Z`),
          },
        },
        include: { employee: true },
      });
      res.json(summary ? attendanceRecordDto(summary) : null);
    }),
  );

  app.get(
    "/attendance/my/timeline",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(404, "No employee profile");
      const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
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
      const rows = await prisma.attendanceDailySummary.findMany({
        where: { employeeId: req.user!.employeeId },
        include: { employee: true },
        orderBy: { date: "desc" },
        take: listLimit(req, 120, 366),
      });
      res.json(rows.map(attendanceRecordDto));
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
              employee: employeeAttendanceVisibilityFilter({ managerId: req.user!.employeeId }),
            }
          : { date, employee: employeeAttendanceVisibilityFilter() };
      const rows = await prisma.attendanceDailySummary.findMany({
        where,
        include: { employee: true },
        orderBy: { employeeId: "asc" },
        take: listLimit(req, 750, 1000),
      });
      res.json(rows.map(attendanceRecordDto));
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
          managerId: req.user!.employeeId,
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
        take: req.query.limit === "none" ? undefined : listLimit(req, 500, 1000),
      });
      res.json(rows.map(attendanceRecordDto));
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
            managerId: req.user!.employeeId,
            ...(departmentId ? { departmentId } : {}),
          });
        }
        const rows = await prisma.attendanceDailySummary.findMany({
          where,
          include: { employee: true },
          orderBy: { date: "desc" },
          take: listLimit(req, 500, 1000),
        });
        res.json(rows.map(attendanceRecordDto));
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
        where.employee = { managerId: req.user!.employeeId };
      }
      const rows = await prisma.leaveRequest.findMany({
        where,
        include: { leaveType: true, employee: { include: { manager: true } } },
        orderBy: { createdAt: "desc" },
        take: listLimit(req, 500, 1000),
      });
      res.json(rows.map(leaveRequestDto));
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
          managerId: req.user!.employeeId,
          ...(departmentId ? { departmentId } : {}),
        });
      }
      const rows = await prisma.attendanceDailySummary.findMany({
        where,
        include: { employee: true },
        orderBy: [{ date: "desc" }, { employeeId: "asc" }],
        take: listLimit(req, 500, 1000),
      });
      res.json(rows.map(attendanceRecordDto));
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
          managerId: req.user!.employeeId,
          ...(departmentId ? { departmentId } : {}),
        });
      }
      const events = await prisma.attendanceEvent.findMany({
        where,
        include: { branch: true, device: true, employee: true },
        orderBy: [{ eventTime: "desc" }],
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
      res.json(attendanceRecordDto(refreshed));
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

      const request = await prisma.attendanceCorrectionRequest.create({
        data: {
          employeeId: body.employeeId,
          date: body.date,
          punchTime: body.punchTime,
          eventType: body.eventType,
          remarks: body.remarks,
          status: "PENDING",
        },
      });

      await audit({
        action: "attendance correction requested",
        performedByUserId: req.user!.id,
        newValue: body as never,
        ipAddress: req.ip,
      });

      res.status(201).json({
        ok: true,
        requestId: request.requestId,
        status: request.status,
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
      const isManager = req.user!.role === Role.MANAGER;

      const where: Prisma.AttendanceCorrectionRequestWhereInput = {};
      if (isManager && req.user!.employeeId) {
        where.employee = { managerId: req.user!.employeeId };
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

      res.json(
        requests.map((req) => ({
          id: req.requestId,
          employeeId: req.employeeId,
          employeeName: req.employee?.name ?? req.employeeId,
          employeeCode: req.employee?.employeeCode,
          date: req.date.toISOString().slice(0, 10),
          punchTime: req.punchTime.toISOString(),
          eventType: req.eventType,
          remarks: req.remarks,
          status: req.status,
          createdAt: req.createdAt.toISOString(),
        })),
      );
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
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const request = await prisma.attendanceCorrectionRequest.findUniqueOrThrow({
        where: { requestId: id },
      });

      if (request.status !== "PENDING") {
        throw new HttpError(400, "Only pending requests can be approved");
      }

      await prisma.$transaction([
        prisma.attendanceCorrectionRequest.update({
          where: { requestId: id },
          data: { status: "APPROVED", reviewedBy: req.user!.id },
        }),
      ]);

      // Create attendance event (this will trigger recalculateDailySummary internally)
      await createAttendanceEvent({
        employeeId: request.employeeId,
        eventTime: request.punchTime,
        eventSource: EventSource.MANUAL_CORRECTION,
        eventType: request.eventType,
        remarks: `Correction Approved: ${request.remarks}`,
        createdByUserId: req.user!.id,
      });

      await audit({
        action: "attendance corrected",
        performedByUserId: req.user!.id,
        newValue: { requestId: id, employeeId: request.employeeId, punchTime: request.punchTime },
        ipAddress: req.ip,
      });

      res.json({ ok: true, status: "APPROVED" });
    }),
  );

  app.post(
    "/attendance/correction-requests/:id/reject",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const request = await prisma.attendanceCorrectionRequest.findUniqueOrThrow({
        where: { requestId: id },
      });

      if (request.status !== "PENDING") {
        throw new HttpError(400, "Only pending requests can be rejected");
      }

      await prisma.attendanceCorrectionRequest.update({
        where: { requestId: id },
        data: { status: "REJECTED", reviewedBy: req.user!.id },
      });

      await audit({
        action: "attendance correction rejected",
        performedByUserId: req.user!.id,
        newValue: { requestId: id, employeeId: request.employeeId },
        ipAddress: req.ip,
      });

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
        branch: employee.homeBranch?.branchName ?? "-",
        email: employee.email,
        status: employee.status,
      });
    }),
  );

  app.get(
    "/leave/types",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const types = await prisma.leaveType.findMany({ orderBy: { name: "asc" } });
      res.json(types.map(leaveTypeDto));
    }),
  );
  app.post(
    "/leave/types",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = leaveTypeSchema.parse(req.body);
      const type = await prisma.leaveType.create({
        data: { name: body.name, paid: body.paid ?? true },
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
      const balances = await prisma.leaveBalance.findMany({
        where: { employeeId: req.user!.employeeId },
        include: { leaveType: true },
      });
      res.json(
        balances.map((balance) => ({
          type: balance.leaveType.name,
          entitled: Number(balance.entitled),
          used: Number(balance.used),
          balance: Number(balance.balance),
        })),
      );
    }),
  );
  app.get(
    "/leave/balances",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const balances = await prisma.leaveBalance.findMany({
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
        orderBy: { employee: { name: "asc" } },
      });
      res.json(
        balances.map((b) => ({
          id: b.leaveBalanceId,
          employeeId: b.employeeId,
          employeeCode: b.employee.employeeCode,
          employeeName: b.employee.name,
          department: b.employee.department?.name ?? "-",
          leaveType: b.leaveType.name,
          entitled: Number(b.entitled),
          used: Number(b.used),
          balance: Number(b.balance),
        })),
      );
    }),
  );
  app.get(
    "/leave/requests",
    requireAuth,
    asyncHandler(async (req, res) => {
      const operationalRoles: Role[] = [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR, Role.CEO];
      const where: Prisma.LeaveRequestWhereInput = operationalRoles.includes(req.user!.role)
        ? {}
        : req.user!.role === Role.MANAGER && req.user!.employeeId
          ? {
              OR: [
                { managerId: req.user!.employeeId },
                { employee: { managerId: req.user!.employeeId } },
              ],
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
      res.json(rows.map(leaveRequestDto));
    }),
  );
  app.post(
    "/leave/requests",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(400, "No employee profile");
      const body = leaveRequestSchema.parse(req.body);
      const employee = await prisma.employee.findUniqueOrThrow({
        where: { employeeId: req.user!.employeeId },
        select: { managerId: true },
      });
      if (!employee.managerId) {
        throw new HttpError(
          400,
          "Reporting manager is not assigned. Contact HR to set your reporting manager before applying for leave.",
        );
      }
      const request = await prisma.leaveRequest.create({
        data: {
          ...body,
          employeeId: req.user!.employeeId,
          managerId: employee.managerId,
          status: "PENDING",
        },
        include: { leaveType: true, employee: { include: { manager: true } } },
      });
      await audit({
        action: "leave requested",
        performedByUserId: req.user!.id,
        newValue: { leaveRequestId: request.leaveRequestId },
        ipAddress: req.ip,
      });
      res.status(201).json(leaveRequestDto(request));
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
      assertReportingManagerForLeave(req.user!, existing);
      if (existing.status !== "PENDING") {
        throw new HttpError(400, "Only pending leave requests can be approved.");
      }
      const leave = await prisma.leaveRequest.update({
        where: { leaveRequestId: String(req.params.id) },
        data: { status: "APPROVED" },
        include: { leaveType: true, employee: { include: { manager: true } } },
      });
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
      res.json(leaveRequestDto(leave));
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
      assertReportingManagerForLeave(req.user!, existing);
      if (existing.status !== "PENDING") {
        throw new HttpError(400, "Only pending leave requests can be rejected.");
      }
      const leave = await prisma.leaveRequest.update({
        where: { leaveRequestId: String(req.params.id) },
        data: { status: "REJECTED" },
        include: { leaveType: true, employee: { include: { manager: true } } },
      });
      await audit({
        action: "leave rejected",
        performedByUserId: req.user!.id,
        newValue: { leaveRequestId: leave.leaveRequestId },
        ipAddress: req.ip,
      });
      res.json(leaveRequestDto(leave));
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
        companyName: "Anytime Diesel",
        employeeName: employee.name,
        employeeCode: employee.employeeCode,
        department: employee.department?.name,
        designation: employee.designation,
        branch: employee.homeBranch?.branchName,
        bloodGroup: employee.emergencyContact?.bloodGroup,
        emergencyContact: employee.emergencyContact,
        status: employee.status,
      });
    }),
  );

  app.get(
    "/audit-logs",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN, Role.CEO),
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
        })),
      );
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
              OR: [
                { managerId: req.user!.employeeId },
                { employee: { managerId: req.user!.employeeId } },
              ],
            }
          : req.user!.employeeId
            ? { employeeId: req.user!.employeeId }
            : { employeeId: "__none__" };
      const leaveWorkflowTitle: Record<string, string> = {
        PENDING: "Leave submitted — awaiting manager",
        APPROVED: "Leave approved by reporting manager",
        MANAGER_APPROVED: "Leave approved by reporting manager",
        HR_VERIFIED: "Leave HR verified",
        REJECTED: "Leave rejected by reporting manager",
        CANCELLED: "Leave cancelled",
      };
      const currentEmployee = req.user!.employeeId
        ? await prisma.employee.findUnique({
            where: { employeeId: req.user!.employeeId },
            select: { homeBranchId: true },
          })
        : null;
      const holidayBranchId = currentEmployee?.homeBranchId;

      const suspensionWindowEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const suspensionManagerRoles: Role[] = [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR];
      const canManageSuspensions = suspensionManagerRoles.includes(req.user!.role);
      const [audits, pendingLeaves, holidays, birthdayEmployees, upcomingSuspensions] =
        await Promise.all([
          canSeeOperational
            ? prisma.auditLog.findMany({
                include: { performedBy: true, affectedUser: true },
                orderBy: { createdAt: "desc" },
                take: 15,
              })
            : Promise.resolve([]),
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
        ]);

      const today = new Date();
      const todayMonth = today.getUTCMonth();
      const todayDate = today.getUTCDate();

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
        ...holidays.map((holiday) => ({
          id: `holiday-${holiday.holidayId}`,
          title: "Upcoming holiday",
          desc: `${holiday.name} on ${holiday.date.toISOString().slice(0, 10)}`,
          time: holiday.updatedAt.toISOString(),
          type: "holiday",
        })),
        ...audits.map((log) => ({
          id: `audit-${log.auditId}`,
          title: log.action,
          desc: `${log.performedBy?.name ?? "System"}${log.affectedUser ? ` - ${log.affectedUser.name}` : ""}`,
          time: log.createdAt.toISOString(),
          type: "system",
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

  app.post(
    "/holidays",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const body = holidaySchema.parse(req.body);
      const holiday = await prisma.holiday.create({
        data: { ...body, branchId: body.branchId || null },
      });
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
      const holiday = await prisma.holiday.update({
        where: { holidayId: String(req.params.id) },
        data: {
          ...body,
          branchId: body.branchId === undefined ? undefined : body.branchId || null,
        },
      });
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
      const holiday = await prisma.holiday.update({
        where: { holidayId: String(req.params.id) },
        data: { status: "INACTIVE" },
      });
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
