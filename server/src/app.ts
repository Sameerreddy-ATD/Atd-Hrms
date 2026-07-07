import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { EventSource, EventType, Role, UserStatus, WorkType } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { audit } from "./audit.js";
import { createAttendanceEvent, recalculateDailySummary } from "./attendanceEngine.js";
import { config } from "./config.js";
import { asyncHandler, errorHandler, HttpError } from "./errors.js";
import { attendanceRecordDto, branchDto, deviceDto, eventDto, userDto } from "./mapper.js";
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
  clientEventSchema,
  correctionSchema,
  createUserSchema,
  leaveRequestSchema,
  loginSchema,
  mobileEventSchema,
  profileEditSchema,
  thumbEventSchema,
} from "./schemas.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(compression());
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
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.post(
    "/auth/login",
    authLimiter,
    asyncHandler(async (req, res) => {
      const body = loginSchema.parse(req.body);
      const user = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase() },
        include: { employee: true },
      });
      if (!user || user.status !== UserStatus.ACTIVE)
        throw new HttpError(401, "Invalid credentials");
      const ok = await verifyPassword(body.password, user.passwordHash);
      if (!ok) {
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: { increment: 1 } },
        });
        throw new HttpError(401, "Invalid credentials");
      }
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lastLoginAt: new Date() },
        include: { employee: true },
      });
      issueCookies(res, updated);
      await audit({
        action: "login succeeded",
        performedByUserId: user.id,
        affectedUserId: user.id,
        ipAddress: req.ip,
      });
      res.json({ user: userDto(updated) });
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
      issueCookies(res, user);
      res.json({ ok: true });
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
    asyncHandler(async (_req, res) => {
      const users = await prisma.user.findMany({
        include: { employee: true },
        orderBy: { createdAt: "desc" },
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
      const user = await prisma.user.create({
        data: {
          name: body.name,
          email: body.email.toLowerCase(),
          phone: body.phone,
          passwordHash: await hashPassword(body.password),
          role: body.role,
          employeeId: body.employeeId,
          createdByUserId: req.user!.id,
        },
        include: { employee: true },
      });
      await audit({
        action: "login created",
        performedByUserId: req.user!.id,
        affectedUserId: user.id,
        newValue: { role: user.role, email: user.email },
        ipAddress: req.ip,
      });
      res.status(201).json(userDto(user));
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
      const employees = await prisma.employee.findMany({ where, orderBy: { employeeCode: "asc" } });
      res.json(employees);
    }),
  );

  app.get(
    "/branches",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const branches = await prisma.branch.findMany({ orderBy: { branchName: "asc" } });
      res.json(branches.map(branchDto));
    }),
  );

  app.get(
    "/departments",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });
      res.json(
        departments.map((department) => ({ id: department.departmentId, name: department.name })),
      );
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
    const clientBody = body as Partial<{
      clientName: string;
      clientLocationName: string;
      photoUrl: string;
    }>;
    const event = await createAttendanceEvent({
      employeeId,
      eventSource: EventSource.MOBILE_GPS,
      eventType: type,
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
      const where =
        req.user!.role === Role.MANAGER && req.user!.employeeId
          ? { date, employee: { managerId: req.user!.employeeId } }
          : { date };
      const rows = await prisma.attendanceDailySummary.findMany({
        where,
        include: { employee: true },
        orderBy: { employeeId: "asc" },
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
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN, Role.CEO),
    asyncHandler(async (_req, res) => {
      const rows = await prisma.attendanceDailySummary.findMany({
        include: { employee: true },
        orderBy: { date: "desc" },
        take: 200,
      });
      res.json(rows.map(attendanceRecordDto));
    }),
  );

  app.get(
    "/reports/attendance",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN, Role.CEO),
    asyncHandler(async (_req, res) => {
      const [totalEmployees, present, absent, onLeave] = await Promise.all([
        prisma.employee.count({ where: { status: "ACTIVE" } }),
        prisma.attendanceDailySummary.count({ where: { status: { startsWith: "Present" } } }),
        prisma.attendanceDailySummary.count({ where: { status: "Absent" } }),
        prisma.attendanceDailySummary.count({ where: { status: { contains: "Leave" } } }),
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
    "/reports/leave",
    "/reports/late",
    "/reports/absent",
    "/reports/payroll",
  ]) {
    app.get(
      path,
      requireAuth,
      requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN, Role.CEO),
      asyncHandler(async (_req, res) => {
        const rows = await prisma.attendanceDailySummary.findMany({
          include: { employee: true },
          orderBy: { date: "desc" },
          take: 200,
        });
        res.json(rows.map(attendanceRecordDto));
      }),
    );
  }

  app.post(
    "/attendance/recalculate/:employeeId/:date",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const employeeId = String(req.params.employeeId);
      const date = String(req.params.date);
      const summary = await recalculateDailySummary(employeeId, date);
      await audit({
        action: "attendance corrected",
        performedByUserId: req.user!.id,
        newValue: { employeeId, date },
        ipAddress: req.ip,
      });
      res.json(summary);
    }),
  );

  app.post(
    "/attendance/correction-request",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = correctionSchema.parse(req.body);
      await assertEmployeeAccess(req.user, body.employeeId);
      await audit({
        action: "attendance correction requested",
        performedByUserId: req.user!.id,
        newValue: body as never,
        ipAddress: req.ip,
      });
      res.status(201).json({ ok: true, status: "PENDING" });
    }),
  );
  app.post(
    "/attendance/correction-approve",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      await audit({
        action: "attendance corrected",
        performedByUserId: req.user!.id,
        newValue: req.body,
        ipAddress: req.ip,
      });
      res.json({ ok: true, status: "APPROVED" });
    }),
  );
  app.post(
    "/attendance/correction-reject",
    requireAuth,
    requireRoles(Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      await audit({
        action: "attendance correction rejected",
        performedByUserId: req.user!.id,
        newValue: req.body,
        ipAddress: req.ip,
      });
      res.json({ ok: true, status: "REJECTED" });
    }),
  );

  app.get(
    "/leave/types",
    requireAuth,
    asyncHandler(async (_req, res) => res.json(await prisma.leaveType.findMany())),
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
    "/leave/requests",
    requireAuth,
    asyncHandler(async (req, res) => {
      const where =
        req.user!.role === Role.EMPLOYEE ||
        req.user!.role === Role.SALES ||
        req.user!.role === Role.DRIVER ||
        req.user!.role === Role.FIELD_STAFF
          ? { employeeId: req.user!.employeeId ?? "" }
          : {};
      res.json(
        await prisma.leaveRequest.findMany({
          where,
          include: { leaveType: true, employee: true },
          orderBy: { createdAt: "desc" },
        }),
      );
    }),
  );
  app.post(
    "/leave/requests",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(400, "No employee profile");
      const body = leaveRequestSchema.parse(req.body);
      const request = await prisma.leaveRequest.create({
        data: { ...body, employeeId: req.user!.employeeId },
      });
      await audit({
        action: "leave requested",
        performedByUserId: req.user!.id,
        newValue: { leaveRequestId: request.leaveRequestId },
        ipAddress: req.ip,
      });
      res.status(201).json(request);
    }),
  );
  app.post(
    "/leave/requests/:id/approve",
    requireAuth,
    requireRoles(Role.MANAGER, Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const leave = await prisma.leaveRequest.update({
        where: { leaveRequestId: String(req.params.id) },
        data: { status: req.user!.role === Role.MANAGER ? "MANAGER_APPROVED" : "APPROVED" },
      });
      if (leave.status === "APPROVED")
        await recalculateDailySummary(leave.employeeId, leave.fromDate);
      await audit({
        action: "leave approved",
        performedByUserId: req.user!.id,
        newValue: { leaveRequestId: leave.leaveRequestId },
        ipAddress: req.ip,
      });
      res.json(leave);
    }),
  );
  app.post(
    "/leave/requests/:id/reject",
    requireAuth,
    requireRoles(Role.MANAGER, Role.HR, Role.MAIN_ADMIN, Role.DEVELOPER_ADMIN),
    asyncHandler(async (req, res) => {
      const leave = await prisma.leaveRequest.update({
        where: { leaveRequestId: String(req.params.id) },
        data: { status: "REJECTED" },
      });
      await audit({
        action: "leave rejected",
        performedByUserId: req.user!.id,
        newValue: { leaveRequestId: leave.leaveRequestId },
        ipAddress: req.ip,
      });
      res.json(leave);
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
        companyName: "AnytimeDiesel",
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
    asyncHandler(async (_req, res) => {
      const logs = await prisma.auditLog.findMany({
        include: { performedBy: true, affectedUser: true },
        orderBy: { createdAt: "desc" },
        take: 250,
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

  app.get("/holidays", requireAuth, (_req, res) => res.json([]));

  app.use(errorHandler);
  return app;
}
