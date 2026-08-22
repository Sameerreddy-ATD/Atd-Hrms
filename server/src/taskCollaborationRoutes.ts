import type { Express } from "express";
import { TaskRelationType } from "@prisma/client";
import { asyncHandler } from "./errors.js";
import { prisma } from "./prisma.js";
import { requireAuth } from "./rbac.js";
import {
  labelCreateSchema,
  labelUpdateSchema,
  relationCreateSchema,
  taskActivityQuerySchema,
  taskLabelsSchema,
  workLogCreateSchema,
  workLogUpdateSchema,
} from "./schemas.js";
import { listTaskActivity } from "./taskCollaborationNotify.js";
import {
  createProjectLabel,
  labelDto,
  listProjectLabels,
  setTaskLabels,
  updateProjectLabel,
} from "./taskLabelEngine.js";
import {
  createWorkTaskRelation,
  deleteWorkTaskRelation,
  listTaskRelations,
  searchWorkItemsForRelation,
} from "./taskRelationEngine.js";
import {
  getWatcherState,
  unwatchWorkItem,
  watchWorkItem,
} from "./taskWatcherEngine.js";
import {
  createWorkLog,
  deleteWorkLog,
  listWorkLogs,
  updateWorkLog,
} from "./taskWorkLogEngine.js";

export function registerTaskCollaborationRoutes(app: Express, deps: {
  assertBoardAccess: (
    user: NonNullable<Express.Request["user"]>,
    boardId: string,
  ) => Promise<{ boardId: string }>;
}) {
  const { assertBoardAccess: boardAccess } = deps;

  app.get(
    "/task-boards/:id/labels",
    requireAuth,
    asyncHandler(async (req, res) => {
      const board = await boardAccess(req.user!, String(req.params.id));
      const includeInactive = req.query.includeInactive !== "false";
      const rows = await listProjectLabels(prisma, board.boardId, includeInactive);
      res.json({ labels: rows.map(labelDto) });
    }),
  );

  app.post(
    "/task-boards/:id/labels",
    requireAuth,
    asyncHandler(async (req, res) => {
      const board = await boardAccess(req.user!, String(req.params.id));
      const body = labelCreateSchema.parse(req.body);
      const created = await createProjectLabel(prisma, req.user!, board.boardId, body);
      res.status(201).json(created);
    }),
  );

  app.patch(
    "/task-labels/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = labelUpdateSchema.parse(req.body);
      const updated = await updateProjectLabel(prisma, req.user!, String(req.params.id), body);
      res.json(updated);
    }),
  );

  app.put(
    "/tasks/:id/labels",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = taskLabelsSchema.parse(req.body);
      const labels = await setTaskLabels(prisma, req.user!, String(req.params.id), body.labelIds, body.version);
      res.json({ labels });
    }),
  );

  app.get(
    "/tasks/:id/relations",
    requireAuth,
    asyncHandler(async (req, res) => {
      const taskId = String(req.params.id);
      const task = await prisma.workTask.findUniqueOrThrow({
        where: { taskId },
        select: { boardId: true },
      });
      if (task.boardId) await boardAccess(req.user!, task.boardId);
      const relations = await listTaskRelations(prisma, taskId);
      res.json(relations);
    }),
  );

  app.post(
    "/tasks/:id/relations",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = relationCreateSchema.parse(req.body);
      const sourceTaskId = String(req.params.id);
      const created = await createWorkTaskRelation(
        prisma,
        req.user!,
        {
          sourceTaskId,
          targetTaskId: body.targetTaskId,
          relationType: body.relationType as TaskRelationType,
        },
        boardAccess,
      );
      res.status(201).json(created);
    }),
  );

  app.delete(
    "/task-relations/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await deleteWorkTaskRelation(prisma, req.user!, String(req.params.id), boardAccess);
      res.json(result);
    }),
  );

  app.get(
    "/task-boards/:id/work-item-search",
    requireAuth,
    asyncHandler(async (req, res) => {
      const board = await boardAccess(req.user!, String(req.params.id));
      const query = String(req.query.q ?? "");
      const excludeTaskId = typeof req.query.excludeTaskId === "string" ? req.query.excludeTaskId : undefined;
      const items = await searchWorkItemsForRelation(prisma, req.user!, {
        boardId: board.boardId,
        query,
        excludeTaskId,
      }, boardAccess);
      res.json({ items });
    }),
  );

  app.get(
    "/tasks/:id/watchers/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const state = await getWatcherState(prisma, req.user!, String(req.params.id), boardAccess);
      res.json(state);
    }),
  );

  app.post(
    "/tasks/:id/watchers/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const state = await watchWorkItem(prisma, req.user!, String(req.params.id), boardAccess);
      res.json(state);
    }),
  );

  app.delete(
    "/tasks/:id/watchers/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const state = await unwatchWorkItem(prisma, req.user!, String(req.params.id), boardAccess);
      res.json(state);
    }),
  );

  app.get(
    "/tasks/:id/work-logs",
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await listWorkLogs(prisma, req.user!, String(req.params.id), boardAccess);
      res.json(result);
    }),
  );

  app.post(
    "/tasks/:id/work-logs",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = workLogCreateSchema.parse(req.body);
      const created = await createWorkLog(prisma, req.user!, String(req.params.id), body, boardAccess);
      res.status(201).json(created);
    }),
  );

  app.patch(
    "/work-logs/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = workLogUpdateSchema.parse(req.body);
      const updated = await updateWorkLog(prisma, req.user!, String(req.params.id), body, boardAccess);
      res.json(updated);
    }),
  );

  app.delete(
    "/work-logs/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await deleteWorkLog(prisma, req.user!, String(req.params.id), boardAccess);
      res.json(result);
    }),
  );

  app.get(
    "/tasks/:id/activity",
    requireAuth,
    asyncHandler(async (req, res) => {
      const query = taskActivityQuerySchema.parse(req.query);
      const feed = await listTaskActivity(
        prisma,
        req.user!,
        String(req.params.id),
        query,
        boardAccess,
      );
      res.json(feed);
    }),
  );
}
