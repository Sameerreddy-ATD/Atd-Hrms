import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Express } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { asyncHandler, HttpError } from "./errors.js";
import { requireAuth, requireRoles, getOrganizationTeamEmployeeIds } from "./rbac.js";
import { ensureChecklistInstance } from "./checklistService.js";
import { assertCanAccessTask, boardAccessWhere } from "./taskBoardAccess.js";
import { readPrivateFile, storePrivateFile, assertCanAccessPrivateFile } from "./privateFiles.js";
import { audit } from "./audit.js";
import { config } from "./config.js";
import rateLimit from "express-rate-limit";

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
        : {
            employeeId: {
              in: [
                ...new Set([...(req.user!.employeeId ? [req.user!.employeeId] : []), ...teamIds]),
              ],
            },
          };

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
                    {
                      assignments: {
                        some: { employeeId: { in: teamIds.length ? teamIds : ["__none__"] } },
                      },
                    },
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
      const dismissedIds = Array.isArray(pref?.dismissedIds)
        ? pref.dismissedIds.filter((id): id is string => typeof id === "string")
        : [];
      res.json({
        digestMode: pref?.digestMode ?? "immediate",
        categories: pref?.categories ?? {
          leave: true,
          tasks: true,
          claims: true,
          checklists: true,
          corrections: true,
        },
        dismissedIds,
        inboxClearedAt: pref?.inboxClearedAt?.toISOString() ?? null,
      });
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

  // Checklists — HR runs instances; Developer Admin owns template CRUD
  const checklistOperators = [Role.DEVELOPER_ADMIN, Role.HR] as const;
  const checklistTemplateAdmins = [Role.DEVELOPER_ADMIN] as const;

  const templateItemSchema = z.object({
    title: z.string().trim().min(2).max(200),
    linkPath: z.string().trim().max(200).nullable().optional(),
  });

  app.get(
    "/checklists",
    requireAuth,
    requireRoles(...checklistOperators),
    asyncHandler(async (req, res) => {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
      const rows = await prisma.checklistInstance.findMany({
        where: {
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
    requireRoles(...checklistOperators),
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
    requireRoles(...checklistOperators),
    asyncHandler(async (req, res) => {
      const body = z.object({ completed: z.boolean() }).parse(req.body);
      const item = await prisma.checklistItemState.findUniqueOrThrow({
        where: { stateId: String(req.params.id) },
        include: { instance: true },
      });
      if (item.instance.status === "CANCELLED" || item.instance.status === "COMPLETED") {
        throw new HttpError(400, "This checklist is locked. Reopen it before changing items.");
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
      res.json({
        id: updated.stateId,
        completed: updated.completed,
        instanceStatus: remaining === 0 ? "COMPLETED" : "OPEN",
      });
    }),
  );

  app.get(
    "/checklists/templates",
    requireAuth,
    requireRoles(...checklistTemplateAdmins),
    asyncHandler(async (_req, res) => {
      const templates = await prisma.checklistTemplate.findMany({
        include: {
          items: { orderBy: { sortOrder: "asc" } },
          _count: { select: { instances: true } },
        },
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

  app.post(
    "/checklists/templates",
    requireAuth,
    requireRoles(...checklistTemplateAdmins),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          name: z.string().trim().min(2).max(120),
          kind: z.enum(["ONBOARDING", "OFFBOARDING"]),
          isActive: z.boolean().default(true),
          items: z.array(templateItemSchema).min(1).max(40),
        })
        .parse(req.body);
      const template = await prisma.$transaction(async (tx) => {
        const created = await tx.checklistTemplate.create({
          data: {
            name: body.name,
            kind: body.kind,
            isActive: body.isActive,
          },
        });
        await tx.checklistTemplateItem.createMany({
          data: body.items.map((item, index) => ({
            templateId: created.templateId,
            title: item.title,
            linkPath: item.linkPath?.trim() || null,
            sortOrder: index,
          })),
        });
        return created;
      });
      res.status(201).json({ id: template.templateId, ok: true });
    }),
  );

  app.put(
    "/checklists/templates/:id",
    requireAuth,
    requireRoles(...checklistTemplateAdmins),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          name: z.string().trim().min(2).max(120),
          isActive: z.boolean(),
          items: z.array(templateItemSchema).min(1).max(40),
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

  app.delete(
    "/checklists/templates/:id",
    requireAuth,
    requireRoles(...checklistTemplateAdmins),
    asyncHandler(async (req, res) => {
      const templateId = String(req.params.id);
      const template = await prisma.checklistTemplate.findUniqueOrThrow({
        where: { templateId },
        include: { _count: { select: { instances: true } } },
      });
      if (template._count.instances > 0) {
        await prisma.checklistTemplate.update({
          where: { templateId },
          data: { isActive: false },
        });
        res.json({ id: templateId, ok: true, deactivated: true });
        return;
      }
      await prisma.checklistTemplate.delete({ where: { templateId } });
      res.json({ id: templateId, ok: true, deleted: true });
    }),
  );

  app.patch(
    "/checklists/:id/status",
    requireAuth,
    requireRoles(...checklistOperators),
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
      const storageKey = `${task.taskId}-${randomBytes(8).toString("hex")}-${body.fileName.replace(/[^\w.-]+/g, "_")}`;
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
        include: { assignments: { select: { employeeId: true } } },
      });
      if (full.boardId) {
        const board = await prisma.taskBoard.findUnique({
          where: { boardId: full.boardId },
          select: { archived: true },
        });
        if (board?.archived) {
          throw new HttpError(409, "Restore this board before changing its tasks");
        }
      }

      const assignmentAdminRoles: Role[] = [
        Role.DEVELOPER_ADMIN,
        Role.MAIN_ADMIN,
        Role.CEO,
        Role.HR,
      ];
      const teamIds = req.user!.employeeId
        ? await getOrganizationTeamEmployeeIds(req.user!.employeeId)
        : [];
      const assignableIds = assignmentAdminRoles.includes(req.user!.role)
        ? undefined
        : [...new Set([...(req.user!.employeeId ? [req.user!.employeeId] : []), ...teamIds])];
      const assigneeIds = full.assignments.map((entry) => entry.employeeId);
      const canManage =
        assignableIds === undefined || assigneeIds.some((id) => assignableIds.includes(id));
      if (!canManage) {
        throw new HttpError(403, "You cannot archive this task");
      }

      const changed = await prisma.workTask.updateMany({
        where: { taskId: full.taskId, version: body.version },
        data: {
          archivedAt: body.archived ? new Date() : null,
          version: { increment: 1 },
          lastActivityAt: new Date(),
        },
      });
      if (changed.count !== 1) {
        throw new HttpError(409, "Task was updated elsewhere. Refresh and try again.");
      }
      const task = await prisma.workTask.findUniqueOrThrow({
        where: { taskId: full.taskId },
        select: { taskId: true, archivedAt: true, version: true },
      });
      await audit({
        action: body.archived ? "task archived" : "task restored",
        performedByUserId: req.user!.id,
        newValue: { taskId: task.taskId, archived: body.archived, version: task.version },
        ipAddress: req.ip,
      });
      res.json({
        id: task.taskId,
        archivedAt: task.archivedAt?.toISOString() ?? null,
        version: task.version,
      });
    }),
  );

  const uploadLimiter = rateLimit({
    windowMs: config.uploadRateLimitWindowMs,
    limit: config.uploadRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many uploads. Please try again shortly." },
  });

  app.post(
    "/expense-claims/receipts",
    requireAuth,
    uploadLimiter,
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
        prefix: req.user!.id,
        fileName: body.fileName,
        contentBase64: body.contentBase64,
        kind: "receipt",
        uploadedByUserId: req.user!.id,
        claimedMimeType: body.mimeType,
      });
      res.status(201).json({
        url: `/expense-claims/receipts/${stored.storageKey}`,
        fileName: body.fileName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
      });
    }),
  );

  app.get(
    "/expense-claims/receipts/:key",
    requireAuth,
    asyncHandler(async (req, res) => {
      const key = String(req.params.key);
      const record = await assertCanAccessPrivateFile({
        storageKey: key,
        kind: "receipt",
        userId: req.user!.id,
        role: req.user!.role,
      });
      const buffer = await readPrivateFile(receiptsDir, key);
      res.setHeader("Content-Type", record?.mimeType ?? "application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", "attachment");
      res.send(buffer);
    }),
  );

  app.post(
    "/leave/medical-files",
    requireAuth,
    uploadLimiter,
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
        prefix: req.user!.id,
        fileName: body.fileName,
        contentBase64: body.contentBase64,
        kind: "medical",
        uploadedByUserId: req.user!.id,
        claimedMimeType: body.mimeType,
      });
      res.status(201).json({
        url: `/leave/medical-files/${stored.storageKey}`,
        fileName: body.fileName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
      });
    }),
  );

  app.get(
    "/leave/medical-files/:key",
    requireAuth,
    asyncHandler(async (req, res) => {
      const key = String(req.params.key);
      let allowManagerMedical = false;
      if (req.user!.role === Role.MANAGER && req.user!.employeeId) {
        const linked = await prisma.leaveRequest.findFirst({
          where: {
            medicalDocumentUrl: `/leave/medical-files/${key}`,
            employeeId: { in: await getOrganizationTeamEmployeeIds(req.user!.employeeId) },
          },
          select: { leaveRequestId: true },
        });
        allowManagerMedical = Boolean(linked);
      }
      const record = await assertCanAccessPrivateFile({
        storageKey: key,
        kind: "medical",
        userId: req.user!.id,
        role: req.user!.role,
        allowManagerMedical,
      });
      const buffer = await readPrivateFile(medicalDir, key);
      res.setHeader("Content-Type", record?.mimeType ?? "application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", "attachment");
      res.send(buffer);
    }),
  );

  void Prisma;
  void randomBytes;
  void writeFile;
  void path;
  void ensureDir;
}
