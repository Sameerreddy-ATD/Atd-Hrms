import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Express } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { asyncHandler, HttpError } from "./errors.js";
import { requireAuth, requireRoles, getOrganizationTeamEmployeeIds } from "./rbac.js";
import { audit } from "./audit.js";
import { config } from "./config.js";
import { ensureChecklistInstance } from "./checklistService.js";

function roleIn(userRole: Role, allowed: Role[]) {
  return allowed.includes(userRole);
}

const attachmentsDir = process.env.TASK_ATTACHMENTS_DIR ?? ".task-attachments";

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

function parseRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function registerHrmsExtensions(app: Express) {
  app.get(
    "/search",
    requireAuth,
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? "")
        .trim()
        .slice(0, 80);
      if (q.length < 2) {
        res.json({ employees: [], boards: [], tasks: [], announcements: [] });
        return;
      }
      const unrestricted = roleIn(req.user!.role, [
        Role.DEVELOPER_ADMIN,
        Role.MAIN_ADMIN,
        Role.CEO,
        Role.HR,
      ]);
      const teamIds = req.user!.employeeId
        ? await getOrganizationTeamEmployeeIds(req.user!.employeeId)
        : [];
      const employeeFilter = unrestricted
        ? {}
        : { employeeId: { in: [...new Set([...(req.user!.employeeId ? [req.user!.employeeId] : []), ...teamIds])] } };

      const [employees, boards, tasks, announcements] = await Promise.all([
        prisma.employee.findMany({
          where: {
            status: "ACTIVE",
            ...employeeFilter,
            OR: [
              { name: { contains: q } },
              { employeeCode: { contains: q } },
              { email: { contains: q } },
            ],
          },
          take: 8,
          select: { employeeId: true, name: true, employeeCode: true, designation: true },
        }),
        prisma.taskBoard.findMany({
          where: { archived: false, name: { contains: q } },
          take: 6,
          select: { boardId: true, name: true },
        }),
        prisma.workTask.findMany({
          where: {
            archivedAt: null,
            title: { contains: q },
            ...(unrestricted
              ? {}
              : {
                  OR: [
                    { assignments: { some: { employeeId: { in: teamIds.length ? teamIds : ["__none__"] } } } },
                    ...(req.user!.employeeId
                      ? [{ assignments: { some: { employeeId: req.user!.employeeId } } }]
                      : []),
                  ],
                }),
          },
          take: 8,
          select: { taskId: true, title: true, boardId: true },
        }),
        prisma.announcement.findMany({
          where: {
            isActive: true,
            OR: [{ title: { contains: q } }, { message: { contains: q } }],
          },
          take: 6,
          select: { announcementId: true, title: true, priority: true },
        }),
      ]);

      res.json({
        employees: employees.map((row) => ({
          id: row.employeeId,
          type: "employee",
          title: row.name,
          subtitle: row.employeeCode,
          href: `/employees`,
        })),
        boards: boards.map((row) => ({
          id: row.boardId,
          type: "board",
          title: row.name,
          href: `/tasks`,
        })),
        tasks: tasks.map((row) => ({
          id: row.taskId,
          type: "task",
          title: row.title,
          href: `/tasks`,
        })),
        announcements: announcements.map((row) => ({
          id: row.announcementId,
          type: "announcement",
          title: row.title,
          subtitle: row.priority,
          href: `/announcements`,
        })),
      });
    }),
  );

  app.get(
    "/notification-preferences",
    requireAuth,
    asyncHandler(async (req, res) => {
      const pref = await prisma.notificationPreference.findUnique({
        where: { userId: req.user!.id },
      });
      res.json(
        pref ?? {
          digestMode: "immediate",
          categories: {
            leave: true,
            tasks: true,
            claims: true,
            checklists: true,
            corrections: true,
          },
        },
      );
    }),
  );

  app.put(
    "/notification-preferences",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          digestMode: z.enum(["off", "immediate", "daily"]),
          categories: z.record(z.boolean()).default({}),
        })
        .parse(req.body);
      const pref = await prisma.notificationPreference.upsert({
        where: { userId: req.user!.id },
        create: {
          userId: req.user!.id,
          digestMode: body.digestMode,
          categories: body.categories,
        },
        update: {
          digestMode: body.digestMode,
          categories: body.categories,
        },
      });
      res.json({
        digestMode: pref.digestMode,
        categories: pref.categories,
      });
    }),
  );

  app.get(
    "/reports/ops-summary",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.CEO, Role.HR, Role.MANAGER),
    asyncHandler(async (req, res) => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const teamIds =
        req.user!.role === Role.MANAGER && req.user!.employeeId
          ? await getOrganizationTeamEmployeeIds(req.user!.employeeId)
          : undefined;

      const employeeWhere = teamIds ? { employeeId: { in: teamIds } } : { status: "ACTIVE" as const };
      const [activeEmployees, presentToday, pendingLeave, overdueTasks, openTasks, paidClaims] =
        await Promise.all([
          prisma.employee.count({ where: { status: "ACTIVE", ...(teamIds ? { employeeId: { in: teamIds } } : {}) } }),
          prisma.attendanceDailySummary.count({
            where: {
              date: today,
              status: { startsWith: "Present" },
              ...(teamIds ? { employeeId: { in: teamIds } } : {}),
            },
          }),
          prisma.leaveRequest.count({
            where: {
              status: "PENDING",
              ...(teamIds ? { employeeId: { in: teamIds } } : {}),
            },
          }),
          prisma.workTask.count({
            where: {
              archivedAt: null,
              dueDate: { lt: today },
              status: { notIn: ["COMPLETED", "CANCELLED"] },
              ...(teamIds
                ? { assignments: { some: { employeeId: { in: teamIds } } } }
                : {}),
            },
          }),
          prisma.workTask.count({
            where: {
              archivedAt: null,
              status: { notIn: ["COMPLETED", "CANCELLED"] },
              ...(teamIds
                ? { assignments: { some: { employeeId: { in: teamIds } } } }
                : {}),
            },
          }),
          prisma.expenseClaim.aggregate({
            where: {
              status: "PAID",
              paidAt: { gte: monthStart },
              ...(teamIds ? { employeeId: { in: teamIds } } : {}),
            },
            _sum: { amount: true },
            _count: true,
          }),
        ]);

      const boards = await prisma.taskBoard.findMany({
        where: { archived: false },
        select: {
          boardId: true,
          name: true,
          tasks: {
            where: {
              archivedAt: null,
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
            select: { taskId: true, dueDate: true, status: true },
          },
        },
        take: 20,
      });

      res.json({
        activeEmployees,
        presentToday,
        attendancePct:
          activeEmployees > 0 ? Math.round((presentToday / activeEmployees) * 1000) / 10 : 0,
        pendingLeave,
        overdueTasks,
        openTasks,
        paidClaimsThisMonth: paidClaims._count,
        paidClaimsAmount: Number(paidClaims._sum.amount ?? 0),
        boards: boards.map((board) => ({
          id: board.boardId,
          name: board.name,
          active: board.tasks.length,
          overdue: board.tasks.filter(
            (task) => task.dueDate && task.dueDate < today && task.status !== "COMPLETED",
          ).length,
        })),
      });
    }),
  );

  app.get(
    "/reports/claims-export",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR, Role.CEO),
    asyncHandler(async (req, res) => {
      const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
      const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
      const claims = await prisma.expenseClaim.findMany({
        where: {
          status: "PAID",
          ...(from || to
            ? {
                paidAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
        include: { employee: { select: { name: true, employeeCode: true } } },
        orderBy: { paidAt: "desc" },
        take: 5000,
      });
      const header = "claimId,employeeCode,employeeName,claimType,amount,paidAt,title\n";
      const rows = claims
        .map((claim) =>
          [
            claim.claimId,
            claim.employee.employeeCode,
            JSON.stringify(claim.employee.name),
            claim.claimType,
            String(claim.amount),
            claim.paidAt?.toISOString() ?? "",
            JSON.stringify(claim.title ?? ""),
          ].join(","),
        )
        .join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="paid-claims.csv"');
      res.send(header + rows);
    }),
  );

  app.get(
    "/reports/ops-export.xlsx",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.CEO, Role.HR, Role.MANAGER),
    asyncHandler(async (req, res) => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const rangeStart = new Date(today);
      rangeStart.setUTCDate(rangeStart.getUTCDate() - 30);
      const teamIds =
        req.user!.role === Role.MANAGER && req.user!.employeeId
          ? await getOrganizationTeamEmployeeIds(req.user!.employeeId)
          : undefined;
      const employeeFilter = teamIds ? { employeeId: { in: teamIds } } : {};

      const [attendance, leaveRows, tasks] = await Promise.all([
        prisma.attendanceDailySummary.findMany({
          where: { date: { gte: rangeStart, lte: today }, ...employeeFilter },
          include: { employee: { select: { name: true, employeeCode: true } } },
          orderBy: [{ date: "desc" }, { employeeId: "asc" }],
          take: 5000,
        }),
        prisma.leaveRequest.findMany({
          where: {
            ...employeeFilter,
            OR: [
              { fromDate: { gte: rangeStart } },
              { toDate: { gte: rangeStart } },
              { status: "PENDING" },
            ],
          },
          include: {
            employee: { select: { name: true, employeeCode: true } },
            leaveType: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 2000,
        }),
        prisma.workTask.findMany({
          where: {
            archivedAt: null,
            ...(teamIds
              ? { assignments: { some: { employeeId: { in: teamIds } } } }
              : {}),
          },
          include: {
            board: { select: { name: true } },
            assignments: { include: { employee: { select: { name: true } } } },
          },
          orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
          take: 2000,
        }),
      ]);

      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      workbook.creator = "Anytime Diesel HRMS";
      workbook.created = new Date();

      const attendanceSheet = workbook.addWorksheet("Attendance");
      attendanceSheet.columns = [
        { header: "Date", key: "date", width: 12 },
        { header: "Employee code", key: "code", width: 14 },
        { header: "Employee", key: "name", width: 28 },
        { header: "Status", key: "status", width: 18 },
        { header: "Total hours", key: "minutes", width: 14 },
      ];
      for (const row of attendance) {
        attendanceSheet.addRow({
          date: row.date.toISOString().slice(0, 10),
          code: row.employee.employeeCode,
          name: row.employee.name,
          status: row.status,
          minutes: Number(row.totalHours ?? 0),
        });
      }

      const leaveSheet = workbook.addWorksheet("Leave");
      leaveSheet.columns = [
        { header: "Employee code", key: "code", width: 14 },
        { header: "Employee", key: "name", width: 28 },
        { header: "Type", key: "type", width: 18 },
        { header: "From", key: "from", width: 12 },
        { header: "To", key: "to", width: 12 },
        { header: "Status", key: "status", width: 16 },
        { header: "Days", key: "days", width: 10 },
      ];
      for (const row of leaveRows) {
        leaveSheet.addRow({
          code: row.employee.employeeCode,
          name: row.employee.name,
          type: row.leaveType.name,
          from: row.fromDate.toISOString().slice(0, 10),
          to: row.toDate.toISOString().slice(0, 10),
          status: row.status,
          days: Number(row.days),
        });
      }

      const plannerSheet = workbook.addWorksheet("Work Planner");
      plannerSheet.columns = [
        { header: "Board", key: "board", width: 22 },
        { header: "Title", key: "title", width: 36 },
        { header: "Status", key: "status", width: 14 },
        { header: "Priority", key: "priority", width: 12 },
        { header: "Progress %", key: "progress", width: 12 },
        { header: "Start", key: "start", width: 12 },
        { header: "Due", key: "due", width: 12 },
        { header: "Assignees", key: "assignees", width: 36 },
      ];
      for (const task of tasks) {
        plannerSheet.addRow({
          board: task.board?.name ?? "",
          title: task.title,
          status: task.status,
          priority: task.priority,
          progress: task.progress,
          start: task.startDate?.toISOString().slice(0, 10) ?? "",
          due: task.dueDate?.toISOString().slice(0, 10) ?? "",
          assignees: task.assignments.map((entry) => entry.employee.name).join(", "),
        });
      }

      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", 'attachment; filename="ops-reports.xlsx"');
      res.send(buffer);
    }),
  );

  // Roster
  app.get(
    "/roster",
    requireAuth,
    asyncHandler(async (req, res) => {
      const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date();
      const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date(from);
      to.setUTCDate(to.getUTCDate() + 6);
      const canManage = roleIn(req.user!.role, [
        Role.DEVELOPER_ADMIN,
        Role.MAIN_ADMIN,
        Role.HR,
        Role.MANAGER,
      ]);
      const teamIds =
        req.user!.role === Role.MANAGER && req.user!.employeeId
          ? await getOrganizationTeamEmployeeIds(req.user!.employeeId)
          : undefined;
      const rows = await prisma.rosterAssignment.findMany({
        where: {
          workDate: { gte: from, lte: to },
          ...(canManage
            ? teamIds
              ? { employeeId: { in: teamIds } }
              : {}
            : { employeeId: req.user!.employeeId ?? "__none__", published: true }),
        },
        include: { employee: { select: { name: true, employeeCode: true } } },
        orderBy: [{ workDate: "asc" }, { employee: { name: "asc" } }],
      });
      res.json(
        rows.map((row) => ({
          id: row.assignmentId,
          employeeId: row.employeeId,
          employeeName: row.employee.name,
          employeeCode: row.employee.employeeCode,
          workDate: row.workDate.toISOString().slice(0, 10),
          shiftPreset: row.shiftPreset,
          startMinutes: row.startMinutes,
          endMinutes: row.endMinutes,
          note: row.note,
          published: row.published,
        })),
      );
    }),
  );

  app.put(
    "/roster",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR, Role.MANAGER),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          employeeId: z.string().min(1),
          workDate: z.coerce.date(),
          shiftPreset: z.enum(["DAY", "NIGHT", "OFF", "CUSTOM"]).default("DAY"),
          startMinutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
          endMinutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
          note: z.string().max(500).nullable().optional(),
          published: z.boolean().optional(),
        })
        .parse(req.body);
      if (req.user!.role === Role.MANAGER && req.user!.employeeId) {
        const team = await getOrganizationTeamEmployeeIds(req.user!.employeeId);
        if (!team.includes(body.employeeId)) throw new HttpError(403, "Outside your team");
      }
      const row = await prisma.rosterAssignment.upsert({
        where: {
          employeeId_workDate: { employeeId: body.employeeId, workDate: body.workDate },
        },
        create: {
          employeeId: body.employeeId,
          workDate: body.workDate,
          shiftPreset: body.shiftPreset,
          startMinutes: body.startMinutes ?? null,
          endMinutes: body.endMinutes ?? null,
          note: body.note ?? null,
          published: body.published ?? false,
        },
        update: {
          shiftPreset: body.shiftPreset,
          startMinutes: body.startMinutes ?? null,
          endMinutes: body.endMinutes ?? null,
          note: body.note ?? null,
          published: body.published ?? undefined,
        },
      });
      res.json({ id: row.assignmentId, ok: true });
    }),
  );

  app.post(
    "/overtime-claims",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(400, "Employee profile required");
      const body = z
        .object({
          workDate: z.coerce.date(),
          minutes: z.number().int().min(15).max(24 * 60),
          reason: z.string().trim().min(3).max(2000),
        })
        .parse(req.body);
      const claim = await prisma.overtimeClaim.create({
        data: {
          employeeId: req.user!.employeeId,
          workDate: body.workDate,
          minutes: body.minutes,
          reason: body.reason,
        },
      });
      res.status(201).json({ id: claim.claimId, status: claim.status });
    }),
  );

  app.get(
    "/overtime-claims",
    requireAuth,
    asyncHandler(async (req, res) => {
      const canReview = roleIn(req.user!.role, [
        Role.DEVELOPER_ADMIN,
        Role.MAIN_ADMIN,
        Role.HR,
        Role.MANAGER,
      ]);
      const teamIds =
        req.user!.role === Role.MANAGER && req.user!.employeeId
          ? await getOrganizationTeamEmployeeIds(req.user!.employeeId)
          : undefined;
      const rows = await prisma.overtimeClaim.findMany({
        where: canReview
          ? teamIds
            ? { employeeId: { in: teamIds } }
            : {}
          : { employeeId: req.user!.employeeId ?? "__none__" },
        include: { employee: { select: { name: true, employeeCode: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      res.json(
        rows.map((row) => ({
          id: row.claimId,
          employeeName: row.employee.name,
          employeeCode: row.employee.employeeCode,
          workDate: row.workDate.toISOString().slice(0, 10),
          minutes: row.minutes,
          reason: row.reason,
          status: row.status,
          reviewNotes: row.reviewNotes,
        })),
      );
    }),
  );

  app.patch(
    "/overtime-claims/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR, Role.MANAGER),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          status: z.enum(["APPROVED", "REJECTED"]),
          reviewNotes: z.string().max(2000).nullable().optional(),
        })
        .parse(req.body);
      const existing = await prisma.overtimeClaim.findUniqueOrThrow({
        where: { claimId: String(req.params.id) },
      });
      if (req.user!.role === Role.MANAGER && req.user!.employeeId) {
        const team = await getOrganizationTeamEmployeeIds(req.user!.employeeId);
        if (!team.includes(existing.employeeId)) throw new HttpError(403, "Outside your team");
      }
      const claim = await prisma.overtimeClaim.update({
        where: { claimId: existing.claimId },
        data: {
          status: body.status,
          reviewNotes: body.reviewNotes ?? null,
          reviewedByUserId: req.user!.id,
          reviewedAt: new Date(),
        },
      });
      res.json({ id: claim.claimId, status: claim.status });
    }),
  );

  // Checklists
  app.get(
    "/checklists",
    requireAuth,
    asyncHandler(async (req, res) => {
      const canManage = roleIn(req.user!.role, [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR]);
      const rows = await prisma.checklistInstance.findMany({
        where: canManage
          ? {}
          : { employeeId: req.user!.employeeId ?? "__none__" },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
          employee: { select: { name: true, employeeCode: true } },
          template: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      res.json(
        rows.map((row) => ({
          id: row.instanceId,
          kind: row.kind,
          status: row.status,
          templateName: row.template.name,
          employeeName: row.employee.name,
          employeeCode: row.employee.employeeCode,
          items: row.items.map((item) => ({
            id: item.stateId,
            title: item.title,
            linkPath: item.linkPath,
            completed: item.completed,
          })),
        })),
      );
    }),
  );

  app.post(
    "/checklists/start",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          employeeId: z.string().min(1),
          kind: z.enum(["ONBOARDING", "OFFBOARDING"]),
        })
        .parse(req.body);
      const instance = await ensureChecklistInstance(body.employeeId, body.kind);
      if (!instance) throw new HttpError(404, "No checklist template found");
      res.status(201).json({ id: instance.instanceId });
    }),
  );

  app.patch(
    "/checklists/items/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = z.object({ completed: z.boolean() }).parse(req.body);
      const item = await prisma.checklistItemState.findUniqueOrThrow({
        where: { stateId: String(req.params.id) },
        include: { instance: true },
      });
      const canManage = roleIn(req.user!.role, [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR]);
      if (!canManage && item.instance.employeeId !== req.user!.employeeId) {
        throw new HttpError(403, "Not your checklist");
      }
      const updated = await prisma.checklistItemState.update({
        where: { stateId: item.stateId },
        data: {
          completed: body.completed,
          completedAt: body.completed ? new Date() : null,
        },
      });
      const remaining = await prisma.checklistItemState.count({
        where: { instanceId: item.instanceId, completed: false },
      });
      if (remaining === 0) {
        await prisma.checklistInstance.update({
          where: { instanceId: item.instanceId },
          data: { status: "COMPLETED" },
        });
      }
      res.json({ id: updated.stateId, completed: updated.completed });
    }),
  );

  // Documents
  app.get(
    "/documents",
    requireAuth,
    asyncHandler(async (req, res) => {
      const canManage = roleIn(req.user!.role, [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR]);
      const docs = await prisma.companyDocument.findMany({
        where: canManage ? {} : { published: true },
        orderBy: { updatedAt: "desc" },
        take: 100,
      });
      const acks = req.user!.employeeId
        ? await prisma.documentAck.findMany({
            where: { employeeId: req.user!.employeeId },
          })
        : [];
      const ackKey = new Set(acks.map((ack) => `${ack.documentId}:${ack.version}`));
      res.json(
        docs
          .filter((doc) => {
            if (canManage) return true;
            const roles = parseRoles(doc.visibilityRoles);
            return roles.length === 0 || roles.includes(req.user!.role);
          })
          .map((doc) => ({
            id: doc.documentId,
            title: doc.title,
            category: doc.category,
            body: doc.body,
            version: doc.version,
            requiresAck: doc.requiresAck,
            published: doc.published,
            acknowledged: ackKey.has(`${doc.documentId}:${doc.version}`),
          })),
      );
    }),
  );

  app.post(
    "/documents",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          title: z.string().trim().min(2).max(200),
          category: z.string().trim().min(2).max(80).default("POLICY"),
          body: z.string().trim().max(50_000).nullable().optional(),
          requiresAck: z.boolean().default(true),
          visibilityRoles: z.array(z.string()).default([]),
          published: z.boolean().default(true),
        })
        .parse(req.body);
      const doc = await prisma.companyDocument.create({
        data: {
          title: body.title,
          category: body.category,
          body: body.body ?? null,
          requiresAck: body.requiresAck,
          visibilityRoles: body.visibilityRoles,
          published: body.published,
          uploadedById: req.user!.id,
        },
      });
      await audit({
        action: "document created",
        performedByUserId: req.user!.id,
        newValue: { documentId: doc.documentId, title: doc.title },
        ipAddress: req.ip,
      });
      res.status(201).json({ id: doc.documentId });
    }),
  );

  app.post(
    "/documents/:id/ack",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(400, "Employee profile required");
      const doc = await prisma.companyDocument.findUniqueOrThrow({
        where: { documentId: String(req.params.id) },
      });
      await prisma.documentAck.upsert({
        where: {
          documentId_employeeId_version: {
            documentId: doc.documentId,
            employeeId: req.user!.employeeId,
            version: doc.version,
          },
        },
        create: {
          documentId: doc.documentId,
          employeeId: req.user!.employeeId,
          version: doc.version,
        },
        update: {},
      });
      res.json({ ok: true });
    }),
  );

  // Appraisals
  app.get(
    "/appraisals/cycles",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR, Role.MANAGER, Role.CEO),
    asyncHandler(async (_req, res) => {
      const cycles = await prisma.appraisalCycle.findMany({
        orderBy: { startsOn: "desc" },
        take: 50,
        include: { _count: { select: { reviews: true } } },
      });
      res.json(
        cycles.map((cycle) => ({
          id: cycle.cycleId,
          name: cycle.name,
          startsOn: cycle.startsOn.toISOString().slice(0, 10),
          endsOn: cycle.endsOn.toISOString().slice(0, 10),
          status: cycle.status,
          reviewCount: cycle._count.reviews,
        })),
      );
    }),
  );

  app.post(
    "/appraisals/cycles",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          name: z.string().trim().min(2).max(120),
          startsOn: z.coerce.date(),
          endsOn: z.coerce.date(),
        })
        .parse(req.body);
      const cycle = await prisma.appraisalCycle.create({
        data: {
          name: body.name,
          startsOn: body.startsOn,
          endsOn: body.endsOn,
        },
      });
      res.status(201).json({ id: cycle.cycleId });
    }),
  );

  app.get(
    "/appraisals/reviews",
    requireAuth,
    asyncHandler(async (req, res) => {
      const cycleId = typeof req.query.cycleId === "string" ? req.query.cycleId : undefined;
      const canHr = roleIn(req.user!.role, [
        Role.DEVELOPER_ADMIN,
        Role.MAIN_ADMIN,
        Role.HR,
        Role.CEO,
      ]);
      const rows = await prisma.appraisalReview.findMany({
        where: {
          ...(cycleId ? { cycleId } : {}),
          ...(canHr
            ? {}
            : {
                OR: [
                  { managerUserId: req.user!.id },
                  ...(req.user!.employeeId ? [{ employeeId: req.user!.employeeId }] : []),
                ],
              }),
        },
        include: {
          employee: { select: { name: true, employeeCode: true } },
          cycle: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      });
      res.json(
        rows.map((row) => ({
          id: row.reviewId,
          cycleName: row.cycle.name,
          employeeName: row.employee.name,
          employeeCode: row.employee.employeeCode,
          rating: row.rating,
          comments: row.comments,
          status: row.status,
        })),
      );
    }),
  );

  app.post(
    "/appraisals/reviews",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR, Role.MANAGER),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          cycleId: z.string().min(1),
          employeeId: z.string().min(1),
          rating: z.number().int().min(1).max(5).optional(),
          comments: z.string().max(5000).nullable().optional(),
          status: z.enum(["DRAFT", "SUBMITTED"]).default("DRAFT"),
        })
        .parse(req.body);
      const review = await prisma.appraisalReview.upsert({
        where: {
          cycleId_employeeId: { cycleId: body.cycleId, employeeId: body.employeeId },
        },
        create: {
          cycleId: body.cycleId,
          employeeId: body.employeeId,
          managerUserId: req.user!.id,
          rating: body.rating,
          comments: body.comments ?? null,
          status: body.status,
          submittedAt: body.status === "SUBMITTED" ? new Date() : null,
        },
        update: {
          rating: body.rating,
          comments: body.comments ?? null,
          status: body.status,
          submittedAt: body.status === "SUBMITTED" ? new Date() : undefined,
        },
      });
      res.status(201).json({ id: review.reviewId, status: review.status });
    }),
  );

  // SOP
  app.get(
    "/sop",
    requireAuth,
    asyncHandler(async (req, res) => {
      const canManage = roleIn(req.user!.role, [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR]);
      const articles = await prisma.sopArticle.findMany({
        where: canManage ? {} : { published: true },
        orderBy: { updatedAt: "desc" },
        take: 100,
      });
      res.json(
        articles
          .filter((article) => {
            if (canManage) return true;
            const roles = parseRoles(article.audienceRoles);
            return roles.length === 0 || roles.includes(req.user!.role);
          })
          .map((article) => ({
            id: article.articleId,
            title: article.title,
            body: article.body,
            published: article.published,
            updatedAt: article.updatedAt.toISOString(),
          })),
      );
    }),
  );

  app.post(
    "/sop",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          title: z.string().trim().min(2).max(200),
          body: z.string().trim().min(2).max(100_000),
          audienceRoles: z.array(z.string()).default([]),
          published: z.boolean().default(false),
        })
        .parse(req.body);
      const article = await prisma.sopArticle.create({
        data: {
          title: body.title,
          body: body.body,
          audienceRoles: body.audienceRoles,
          published: body.published,
          authorUserId: req.user!.id,
        },
      });
      res.status(201).json({ id: article.articleId });
    }),
  );

  app.post(
    "/sop/:id/read",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user!.employeeId) throw new HttpError(400, "Employee profile required");
      await prisma.sopRead.upsert({
        where: {
          articleId_employeeId: {
            articleId: String(req.params.id),
            employeeId: req.user!.employeeId,
          },
        },
        create: {
          articleId: String(req.params.id),
          employeeId: req.user!.employeeId,
        },
        update: { readAt: new Date() },
      });
      res.json({ ok: true });
    }),
  );

  // ATS
  app.get(
    "/recruitment/jobs",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (_req, res) => {
      const jobs = await prisma.recruitmentJob.findMany({
        include: { _count: { select: { candidates: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      res.json(
        jobs.map((job) => ({
          id: job.jobId,
          title: job.title,
          departmentName: job.departmentName,
          description: job.description,
          status: job.status,
          candidateCount: job._count.candidates,
        })),
      );
    }),
  );

  app.post(
    "/recruitment/jobs",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          title: z.string().trim().min(2).max(160),
          departmentName: z.string().trim().max(120).nullable().optional(),
          description: z.string().trim().max(10_000).nullable().optional(),
        })
        .parse(req.body);
      const job = await prisma.recruitmentJob.create({
        data: {
          title: body.title,
          departmentName: body.departmentName ?? null,
          description: body.description ?? null,
          createdByUserId: req.user!.id,
        },
      });
      res.status(201).json({ id: job.jobId });
    }),
  );

  app.get(
    "/recruitment/candidates",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const jobId = typeof req.query.jobId === "string" ? req.query.jobId : undefined;
      const candidates = await prisma.candidate.findMany({
        where: jobId ? { jobId } : {},
        include: { job: { select: { title: true } } },
        orderBy: { updatedAt: "desc" },
        take: 200,
      });
      res.json(
        candidates.map((row) => ({
          id: row.candidateId,
          jobId: row.jobId,
          jobTitle: row.job.title,
          name: row.name,
          email: row.email,
          phone: row.phone,
          stage: row.stage,
          notes: row.notes,
          hiredEmployeeId: row.hiredEmployeeId,
        })),
      );
    }),
  );

  app.post(
    "/recruitment/candidates",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          jobId: z.string().min(1),
          name: z.string().trim().min(2).max(160),
          email: z.string().email().nullable().optional(),
          phone: z.string().max(40).nullable().optional(),
          notes: z.string().max(5000).nullable().optional(),
        })
        .parse(req.body);
      const candidate = await prisma.candidate.create({
        data: {
          jobId: body.jobId,
          name: body.name,
          email: body.email ?? null,
          phone: body.phone ?? null,
          notes: body.notes ?? null,
        },
      });
      res.status(201).json({ id: candidate.candidateId });
    }),
  );

  app.patch(
    "/recruitment/candidates/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          stage: z
            .enum(["APPLIED", "SCREEN", "INTERVIEW", "OFFER", "HIRED", "REJECTED"])
            .optional(),
          notes: z.string().max(5000).nullable().optional(),
          hireEmployeeId: z.string().min(1).optional(),
        })
        .parse(req.body);
      const candidate = await prisma.candidate.update({
        where: { candidateId: String(req.params.id) },
        data: {
          stage: body.stage,
          notes: body.notes === undefined ? undefined : body.notes,
          hiredEmployeeId: body.hireEmployeeId,
          ...(body.stage === "HIRED" || body.hireEmployeeId ? { stage: "HIRED" } : {}),
        },
      });
      if (body.hireEmployeeId || body.stage === "HIRED") {
        const employeeId = body.hireEmployeeId ?? candidate.hiredEmployeeId;
        if (employeeId) await ensureChecklistInstance(employeeId, "ONBOARDING");
      }
      res.json({ id: candidate.candidateId, stage: candidate.stage });
    }),
  );

  // Task attachments + archive helpers (supplement app.ts)
  app.post(
    "/tasks/:id/attachments",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          fileName: z.string().trim().min(1).max(200),
          mimeType: z.string().trim().min(3).max(120),
          contentBase64: z.string().min(8).max(6_000_000),
        })
        .parse(req.body);
      const task = await prisma.workTask.findUniqueOrThrow({
        where: { taskId: String(req.params.id) },
      });
      const raw = body.contentBase64.includes(",")
        ? body.contentBase64.split(",").pop()!
        : body.contentBase64;
      const buffer = Buffer.from(raw, "base64");
      if (buffer.length > 1_500_000) throw new HttpError(400, "Attachment must be under 1.5 MB");
      await ensureDir(attachmentsDir);
      const storageKey = `${task.taskId}-${randomBytes(8).toString("hex")}-${body.fileName.replace(/[^\w.\-]+/g, "_")}`;
      await writeFile(path.join(attachmentsDir, storageKey), buffer, { mode: 0o600 });
      const attachment = await prisma.taskAttachment.create({
        data: {
          taskId: task.taskId,
          fileName: body.fileName,
          mimeType: body.mimeType,
          sizeBytes: buffer.length,
          storageKey,
          uploadedById: req.user!.id,
        },
      });
      res.status(201).json({
        id: attachment.attachmentId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt.toISOString(),
      });
    }),
  );

  app.get(
    "/tasks/:id/attachments",
    requireAuth,
    asyncHandler(async (req, res) => {
      const rows = await prisma.taskAttachment.findMany({
        where: { taskId: String(req.params.id) },
        orderBy: { createdAt: "desc" },
      });
      res.json(
        rows.map((row) => ({
          id: row.attachmentId,
          fileName: row.fileName,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          createdAt: row.createdAt.toISOString(),
        })),
      );
    }),
  );

  app.post(
    "/tasks/:id/archive",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = z
        .object({ version: z.number().int().positive(), archived: z.boolean() })
        .parse(req.body);
      const existing = await prisma.workTask.findUniqueOrThrow({
        where: { taskId: String(req.params.id) },
      });
      if (existing.version !== body.version) {
        throw new HttpError(409, "Task was updated elsewhere. Refresh and try again.");
      }
      const task = await prisma.workTask.update({
        where: { taskId: existing.taskId },
        data: {
          archivedAt: body.archived ? new Date() : null,
          version: { increment: 1 },
          lastActivityAt: new Date(),
        },
      });
      res.json({ id: task.taskId, archivedAt: task.archivedAt?.toISOString() ?? null, version: task.version });
    }),
  );

  void config;
  void Prisma;
}
