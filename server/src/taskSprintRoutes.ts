import type { Express } from "express";
import { TaskIssueType, TaskSprintStatus } from "@prisma/client";
import { asyncHandler, HttpError } from "./errors.js";
import { prisma } from "./prisma.js";
import { requireAuth } from "./rbac.js";
import {
  sprintCancelSchema,
  sprintCompleteSchema,
  sprintCreateSchema,
  sprintMembershipSchema,
  sprintUpdateSchema,
} from "./schemas.js";
import { assertProjectCapability } from "./taskProjectRoles.js";
import {
  assignTaskToSprintInTx,
  cancelSprint,
  completeSprint,
  createSprint,
  removeTaskFromSprintInTx,
  sprintCountsForSprint,
  sprintDto,
  startSprint,
  updateSprint,
} from "./taskSprintEngine.js";

export function registerTaskSprintRoutes(app: Express, deps: {
  assertBoardAccess: (user: NonNullable<Express.Request["user"]>, boardId: string) => Promise<{ boardId: string }>;
  taskDto: (task: object, options?: { summary?: boolean }) => unknown;
  taskInclude: object;
}) {
  const { assertBoardAccess: boardAccess, taskDto, taskInclude } = deps;

  app.get(
    "/task-boards/:id/sprints",
    requireAuth,
    asyncHandler(async (req, res) => {
      const board = await boardAccess(req.user!, String(req.params.id));
      const sprints = await prisma.taskSprint.findMany({
        where: { boardId: board.boardId },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      });
      const enriched = await Promise.all(
        sprints.map(async (sprint) => ({
          ...sprintDto(sprint),
          counts: await sprintCountsForSprint(prisma, sprint.sprintId),
        })),
      );
      res.json({ sprints: enriched });
    }),
  );

  app.get(
    "/task-boards/:id/backlog-plan",
    requireAuth,
    asyncHandler(async (req, res) => {
      const board = await boardAccess(req.user!, String(req.params.id));
      const sprints = await prisma.taskSprint.findMany({
        where: {
          boardId: board.boardId,
          status: { in: [TaskSprintStatus.PLANNED, TaskSprintStatus.ACTIVE] },
        },
        orderBy: [{ status: "desc" }, { createdAt: "asc" }],
      });
      const activeSprint = sprints.find((s) => s.status === TaskSprintStatus.ACTIVE) ?? null;

      async function itemsForSprint(sprintId: string) {
        const memberships = await prisma.taskSprintMembership.findMany({
          where: { sprintId, removedAt: null },
          include: { task: { include: taskInclude as never } },
          orderBy: { sprintRank: "asc" },
        });
        return memberships.map((m) => ({
          ...(taskDto(m.task) as Record<string, unknown>),
          sprintRank: m.sprintRank,
          membershipId: m.membershipId,
        }));
      }

      const planned = await Promise.all(
        sprints
          .filter((s) => s.status === TaskSprintStatus.PLANNED)
          .map(async (sprint) => ({
            sprint: {
              ...sprintDto(sprint),
              counts: await sprintCountsForSprint(prisma, sprint.sprintId),
            },
            items: await itemsForSprint(sprint.sprintId),
          })),
      );

      const backlogTasks = await prisma.workTask.findMany({
        where: {
          boardId: board.boardId,
          archivedAt: null,
          issueType: { in: [TaskIssueType.STORY, TaskIssueType.TASK, TaskIssueType.BUG, TaskIssueType.IMPROVEMENT] },
          sprintMemberships: { none: { removedAt: null } },
        },
        include: taskInclude as never,
        orderBy: { backlogRank: "asc" },
      });

      res.json({
        activeSprint: activeSprint
          ? {
              sprint: {
                ...sprintDto(activeSprint),
                counts: await sprintCountsForSprint(prisma, activeSprint.sprintId),
              },
              items: await itemsForSprint(activeSprint.sprintId),
            }
          : null,
        plannedSprints: planned,
        backlogItems: backlogTasks.map((task) => taskDto(task)),
      });
    }),
  );

  app.post(
    "/task-boards/:id/sprints",
    requireAuth,
    asyncHandler(async (req, res) => {
      const board = await boardAccess(req.user!, String(req.params.id));
      await assertProjectCapability(prisma, req.user!, board.boardId, "MANAGE_SPRINT");
      const body = sprintCreateSchema.parse(req.body);
      const sprint = await createSprint(prisma, {
        boardId: board.boardId,
        name: body.name,
        goal: body.goal,
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        actor: req.user,
      });
      res.status(201).json({
        ...sprintDto(sprint),
        counts: await sprintCountsForSprint(prisma, sprint.sprintId),
      });
    }),
  );

  app.patch(
    "/task-sprints/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const existing = await prisma.taskSprint.findUniqueOrThrow({
        where: { sprintId: String(req.params.id) },
      });
      await assertProjectCapability(prisma, req.user!, existing.boardId, "MANAGE_SPRINT");
      const body = sprintUpdateSchema.parse(req.body);
      const sprint = await updateSprint(prisma, existing.sprintId, body);
      res.json({
        ...sprintDto(sprint),
        counts: await sprintCountsForSprint(prisma, sprint.sprintId),
      });
    }),
  );

  app.post(
    "/task-sprints/:id/start",
    requireAuth,
    asyncHandler(async (req, res) => {
      const existing = await prisma.taskSprint.findUniqueOrThrow({
        where: { sprintId: String(req.params.id) },
      });
      await assertProjectCapability(prisma, req.user!, existing.boardId, "MANAGE_SPRINT");
      const sprint = await startSprint(prisma, existing.sprintId, req.user);
      res.json({
        ...sprintDto(sprint),
        counts: await sprintCountsForSprint(prisma, sprint.sprintId),
      });
    }),
  );

  app.post(
    "/task-sprints/:id/complete",
    requireAuth,
    asyncHandler(async (req, res) => {
      const existing = await prisma.taskSprint.findUniqueOrThrow({
        where: { sprintId: String(req.params.id) },
      });
      await assertProjectCapability(prisma, req.user!, existing.boardId, "MANAGE_SPRINT");
      const body = sprintCompleteSchema.parse(req.body);
      const sprint = await completeSprint(
        prisma,
        existing.sprintId,
        req.user,
        body.incompleteItems.map((row) => ({
          taskId: row.taskId,
          target: row.target === "backlog" ? "backlog" : row.target,
        })),
      );
      res.json({
        ...sprintDto(sprint),
        counts: await sprintCountsForSprint(prisma, sprint.sprintId),
      });
    }),
  );

  app.post(
    "/task-sprints/:id/cancel",
    requireAuth,
    asyncHandler(async (req, res) => {
      const existing = await prisma.taskSprint.findUniqueOrThrow({
        where: { sprintId: String(req.params.id) },
      });
      await assertProjectCapability(prisma, req.user!, existing.boardId, "MANAGE_SPRINT");
      const body = sprintCancelSchema.parse(req.body);
      const sprint = await cancelSprint(
        prisma,
        existing.sprintId,
        req.user,
        body.returnToBacklog,
        body.destinationSprintId,
      );
      res.json({
        ...sprintDto(sprint),
        counts: await sprintCountsForSprint(prisma, sprint.sprintId),
      });
    }),
  );

  app.post(
    "/tasks/:id/sprint-membership",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = sprintMembershipSchema.parse(req.body);
      const task = await prisma.workTask.findUniqueOrThrow({
        where: { taskId: String(req.params.id) },
      });
      if (!task.boardId) throw new HttpError(400, "Work item has no project");
      const capability = body.sprintId ? "MANAGE_SPRINT" : "EDIT_WORK_ITEM";
      await assertProjectCapability(prisma, req.user!, task.boardId, capability);

      if (body.sprintId === null) {
        await removeTaskFromSprintInTx(prisma, {
          taskId: task.taskId,
          actorUserId: req.user!.id,
        });
      } else {
        await assignTaskToSprintInTx(prisma, {
          taskId: task.taskId,
          sprintId: body.sprintId,
          actorUserId: req.user!.id,
          rankBeforeTaskId: body.rankBeforeTaskId,
          rankAfterTaskId: body.rankAfterTaskId,
        });
      }

      const updated = await prisma.workTask.findUniqueOrThrow({
        where: { taskId: task.taskId },
        include: taskInclude as never,
      });
      res.json(taskDto(updated));
    }),
  );
}
