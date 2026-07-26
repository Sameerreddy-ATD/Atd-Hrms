import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Express } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { asyncHandler, HttpError } from "./errors.js";
import { requireAuth, requireRoles, getOrganizationTeamEmployeeIds } from "./rbac.js";
import { config } from "./config.js";
import { ensureChecklistInstance } from "./checklistService.js";
import { assertCanAccessTask, boardAccessWhere } from "./taskBoardAccess.js";
import { readPrivateFile, storePrivateFile } from "./privateFiles.js";

function roleIn(userRole: Role, allowed: Role[]) {
  return allowed.includes(userRole);
}

const attachmentsDir = process.env.TASK_ATTACHMENTS_DIR ?? ".task-attachments";
const receiptsDir = process.env.EXPENSE_RECEIPTS_DIR ?? ".expense-receipts";
const medicalDir = process.env.LEAVE_MEDICAL_DIR ?? ".leave-medical";

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
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
          where: { archived: false, name: { contains: q }, ...boardAccessWhere(req.user!) },
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
          digestMode: z.enum(["off", "immediate"]),
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

  // Checklists
  app.get(
    "/checklists",
    requireAuth,
    asyncHandler(async (req, res) => {
      const canManage = roleIn(req.user!.role, [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR]);
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
      const rows = await prisma.checklistInstance.findMany({
        where: {
          ...(canManage ? {} : { employeeId: req.user!.employeeId ?? "__none__" }),
          ...(status ? { status } : {}),
          ...(kind ? { kind } : {}),
        },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
          employee: { select: { name: true, employeeCode: true } },
          template: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      res.json(
        rows.map((row) => {
          const completedCount = row.items.filter((item) => item.completed).length;
          return {
            id: row.instanceId,
            kind: row.kind,
            status: row.status,
            templateName: row.template.name,
            employeeId: row.employeeId,
            employeeName: row.employee.name,
            employeeCode: row.employee.employeeCode,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            completedCount,
            totalCount: row.items.length,
            items: row.items.map((item) => ({
              id: item.stateId,
              title: item.title,
              linkPath: item.linkPath,
              completed: item.completed,
              completedAt: item.completedAt?.toISOString() ?? null,
              sortOrder: item.sortOrder,
            })),
          };
        }),
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
      if (!instance) throw new HttpError(404, "No active checklist template found for this kind");
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
      await prisma.checklistInstance.update({
        where: { instanceId: item.instanceId },
        data: { status: remaining === 0 ? "COMPLETED" : "OPEN" },
      });
      res.json({ id: updated.stateId, completed: updated.completed, instanceStatus: remaining === 0 ? "COMPLETED" : "OPEN" });
    }),
  );

  app.get(
    "/checklists/templates",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (_req, res) => {
      const templates = await prisma.checklistTemplate.findMany({
        include: { items: { orderBy: { sortOrder: "asc" } }, _count: { select: { instances: true } } },
        orderBy: [{ kind: "asc" }, { name: "asc" }],
      });
      res.json(
        templates.map((template) => ({
          id: template.templateId,
          name: template.name,
          kind: template.kind,
          isActive: template.isActive,
          instanceCount: template._count.instances,
          items: template.items.map((item) => ({
            id: item.itemId,
            title: item.title,
            linkPath: item.linkPath,
            sortOrder: item.sortOrder,
          })),
        })),
      );
    }),
  );

  app.put(
    "/checklists/templates/:id",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          name: z.string().trim().min(2).max(120),
          isActive: z.boolean(),
          items: z
            .array(
              z.object({
                title: z.string().trim().min(2).max(200),
                linkPath: z.string().trim().max(200).nullable().optional(),
              }),
            )
            .min(1)
            .max(40),
        })
        .parse(req.body);
      const templateId = String(req.params.id);
      await prisma.checklistTemplate.findUniqueOrThrow({ where: { templateId } });
      await prisma.$transaction(async (tx) => {
        await tx.checklistTemplate.update({
          where: { templateId },
          data: { name: body.name, isActive: body.isActive },
        });
        await tx.checklistTemplateItem.deleteMany({ where: { templateId } });
        await tx.checklistTemplateItem.createMany({
          data: body.items.map((item, index) => ({
            templateId,
            title: item.title,
            linkPath: item.linkPath?.trim() || null,
            sortOrder: index,
          })),
        });
      });
      res.json({ id: templateId, ok: true });
    }),
  );

  app.patch(
    "/checklists/:id/status",
    requireAuth,
    requireRoles(Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR),
    asyncHandler(async (req, res) => {
      const body = z.object({ status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]) }).parse(req.body);
      const instance = await prisma.checklistInstance.findUniqueOrThrow({
        where: { instanceId: String(req.params.id) },
      });
      if (body.status === "COMPLETED") {
        await prisma.checklistItemState.updateMany({
          where: { instanceId: instance.instanceId, completed: false },
          data: { completed: true, completedAt: new Date() },
        });
      }
      const updated = await prisma.checklistInstance.update({
        where: { instanceId: instance.instanceId },
        data: { status: body.status },
      });
      res.json({ id: updated.instanceId, status: updated.status });
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
      const task = await assertCanAccessTask(req.user!, String(req.params.id));
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
      await assertCanAccessTask(req.user!, String(req.params.id));
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
      const existing = await assertCanAccessTask(req.user!, String(req.params.id));
      const full = await prisma.workTask.findUniqueOrThrow({
        where: { taskId: existing.taskId },
      });
      if (full.version !== body.version) {
        throw new HttpError(409, "Task was updated elsewhere. Refresh and try again.");
      }
      const task = await prisma.workTask.update({
        where: { taskId: full.taskId },
        data: {
          archivedAt: body.archived ? new Date() : null,
          version: { increment: 1 },
          lastActivityAt: new Date(),
        },
      });
      res.json({
        id: task.taskId,
        archivedAt: task.archivedAt?.toISOString() ?? null,
        version: task.version,
      });
    }),
  );

  app.post(
    "/expense-claims/receipts",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          fileName: z.string().trim().min(1).max(200),
          mimeType: z.string().trim().min(3).max(120),
          contentBase64: z.string().min(8).max(6_000_000),
        })
        .parse(req.body);
      const stored = await storePrivateFile({
        dir: receiptsDir,
        prefix: req.user!.id.slice(0, 8),
        fileName: body.fileName,
        contentBase64: body.contentBase64,
      });
      res.status(201).json({
        url: `/expense-claims/receipts/${stored.storageKey}`,
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: stored.sizeBytes,
      });
    }),
  );

  app.get(
    "/expense-claims/receipts/:key",
    requireAuth,
    asyncHandler(async (req, res) => {
      const key = String(req.params.key);
      const canManage = roleIn(req.user!.role, [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.HR]);
      if (!canManage && !key.startsWith(req.user!.id.slice(0, 8))) {
        // Still allow reviewers/managers who can see claims — HR/admin only for arbitrary keys;
        // employees can only fetch their own upload prefix.
        throw new HttpError(403, "Receipt not available");
      }
      const buffer = await readPrivateFile(receiptsDir, key);
      res.setHeader("Content-Type", "application/octet-stream");
      res.send(buffer);
    }),
  );

  app.post(
    "/leave/medical-files",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          fileName: z.string().trim().min(1).max(200),
          mimeType: z.string().trim().min(3).max(120),
          contentBase64: z.string().min(8).max(6_000_000),
        })
        .parse(req.body);
      const stored = await storePrivateFile({
        dir: medicalDir,
        prefix: req.user!.id.slice(0, 8),
        fileName: body.fileName,
        contentBase64: body.contentBase64,
      });
      res.status(201).json({
        url: `/leave/medical-files/${stored.storageKey}`,
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: stored.sizeBytes,
      });
    }),
  );

  app.get(
    "/leave/medical-files/:key",
    requireAuth,
    asyncHandler(async (req, res) => {
      const key = String(req.params.key);
      const canManage = roleIn(req.user!.role, [
        Role.DEVELOPER_ADMIN,
        Role.MAIN_ADMIN,
        Role.HR,
        Role.MANAGER,
      ]);
      if (!canManage && !key.startsWith(req.user!.id.slice(0, 8))) {
        throw new HttpError(403, "Medical file not available");
      }
      const buffer = await readPrivateFile(medicalDir, key);
      res.setHeader("Content-Type", "application/octet-stream");
      res.send(buffer);
    }),
  );

  void config;
  void Prisma;
  void randomBytes;
  void writeFile;
  void path;
  void ensureDir;
}
