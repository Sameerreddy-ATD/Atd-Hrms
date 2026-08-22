import type { Express } from "express";
import { asyncHandler, HttpError } from "./errors.js";
import { prisma } from "./prisma.js";
import { requireAuth } from "./rbac.js";
import {
  componentCreateSchema,
  componentReorderSchema,
  componentUpdateSchema,
  taskComponentsSchema,
} from "./schemas.js";
import { assertProjectCapability } from "./taskProjectRoles.js";
import {
  componentDto,
  createProjectComponent,
  listProjectComponents,
  reorderProjectComponents,
  setTaskComponentsInTx,
  updateProjectComponent,
} from "./taskComponentEngine.js";
import { computeEpicProgress } from "./taskEpicProgress.js";
import { buildProjectRoadmap, listEpicChildren } from "./taskRoadmapEngine.js";

export function registerTaskRoadmapRoutes(app: Express, deps: {
  assertBoardAccess: (
    user: NonNullable<Express.Request["user"]>,
    boardId: string,
  ) => Promise<{ boardId: string }>;
}) {
  const { assertBoardAccess: boardAccess } = deps;

  app.get(
    "/task-boards/:id/components",
    requireAuth,
    asyncHandler(async (req, res) => {
      const board = await boardAccess(req.user!, String(req.params.id));
      const includeInactive = req.query.includeInactive !== "false";
      const rows = await listProjectComponents(prisma, board.boardId, includeInactive);
      res.json({ components: rows.map(componentDto) });
    }),
  );

  app.post(
    "/task-boards/:id/components",
    requireAuth,
    asyncHandler(async (req, res) => {
      const board = await boardAccess(req.user!, String(req.params.id));
      const body = componentCreateSchema.parse(req.body);
      const created = await createProjectComponent(prisma, req.user!, board.boardId, body);
      res.status(201).json(created);
    }),
  );

  app.patch(
    "/task-components/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = componentUpdateSchema.parse(req.body);
      const updated = await updateProjectComponent(prisma, req.user!, String(req.params.id), body);
      res.json(updated);
    }),
  );

  app.post(
    "/task-boards/:id/components/reorder",
    requireAuth,
    asyncHandler(async (req, res) => {
      const board = await boardAccess(req.user!, String(req.params.id));
      const body = componentReorderSchema.parse(req.body);
      await reorderProjectComponents(prisma, req.user!, board.boardId, body.orderedIds);
      const rows = await listProjectComponents(prisma, board.boardId, true);
      res.json({ components: rows.map(componentDto) });
    }),
  );

  app.get(
    "/task-boards/:id/roadmap",
    requireAuth,
    asyncHandler(async (req, res) => {
      const board = await boardAccess(req.user!, String(req.params.id));
      await assertProjectCapability(prisma, req.user!, board.boardId, "VIEW_PROJECT");
      const includeArchived = req.query.includeArchived === "true";
      const roadmap = await buildProjectRoadmap(prisma, board.boardId, includeArchived);
      res.json(roadmap);
    }),
  );

  app.get(
    "/tasks/:id/epic-children",
    requireAuth,
    asyncHandler(async (req, res) => {
      const task = await prisma.workTask.findUniqueOrThrow({
        where: { taskId: String(req.params.id) },
        select: { taskId: true, boardId: true, issueType: true },
      });
      if (task.boardId) await boardAccess(req.user!, task.boardId);
      const children = await listEpicChildren(prisma, task.taskId);
      const progress = await computeEpicProgress(prisma, task.taskId);
      res.json({ children, progress });
    }),
  );

  app.put(
    "/tasks/:id/components",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = taskComponentsSchema.parse(req.body);
      const task = await prisma.workTask.findUniqueOrThrow({
        where: { taskId: String(req.params.id) },
        select: { taskId: true, boardId: true, version: true },
      });
      if (!task.boardId) throw new Error("Task has no project");
      await assertProjectCapability(prisma, req.user!, task.boardId, "EDIT_WORK_ITEM");
      if (body.version !== task.version) {
        throw new HttpError(409, "This work item was updated elsewhere. Refresh and try again.");
      }
      await prisma.$transaction(async (tx) => {
        await setTaskComponentsInTx(tx, {
          taskId: task.taskId,
          boardId: task.boardId!,
          componentIds: body.componentIds,
          actorUserId: req.user!.id,
        });
        await tx.workTask.update({
          where: { taskId: task.taskId },
          data: { version: { increment: 1 } },
        });
      });
      const links = await prisma.workTaskComponent.findMany({
        where: { taskId: task.taskId },
        include: {
          component: {
            include: {
              leadEmployee: {
                select: {
                  employeeId: true,
                  name: true,
                  employeeCode: true,
                  designation: true,
                },
              },
            },
          },
        },
      });
      res.json({ components: links.map((link) => componentDto(link.component)) });
    }),
  );
}
