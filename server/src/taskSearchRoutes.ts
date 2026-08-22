import type { Express } from "express";
import { z } from "zod";
import { asyncHandler } from "./errors.js";
import { prisma } from "./prisma.js";
import { requireAuth } from "./rbac.js";
import {
  taskFilterConfigSchema,
  taskSortConfigSchema,
} from "./taskFilterSchema.js";
import { queryFilteredWorkItems, searchWorkItems } from "./taskSearchEngine.js";
import {
  createSavedView,
  deleteSavedView,
  executeSavedView,
  getSavedView,
  listSavedViews,
  savedViewCreateSchema,
  savedViewUpdateSchema,
  updateSavedView,
} from "./taskSavedViewEngine.js";

function listLimit(req: { query: Record<string, unknown> }, fallback = 25, max = 100) {
  const raw = Number(req.query.limit);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.floor(raw), max);
}

function listOffset(req: { query: Record<string, unknown> }) {
  const raw = Number(req.query.offset);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

const filterQuerySchema = z.object({
  filter: taskFilterConfigSchema,
  sort: taskSortConfigSchema.optional(),
  boardId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export function registerTaskSearchRoutes(app: Express) {
  app.get(
    "/tasks/search",
    requireAuth,
    asyncHandler(async (req, res) => {
      const query = typeof req.query.q === "string" ? req.query.q : "";
      const boardId =
        typeof req.query.boardId === "string" ? req.query.boardId : undefined;
      const limit = listLimit(req, 25, 50);
      const offset = listOffset(req);

      const payload = await searchWorkItems(prisma, req.user!, {
        query,
        boardId,
        limit,
        offset,
      });
      res.json(payload);
    }),
  );

  app.post(
    "/tasks/filter",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = filterQuerySchema.parse(req.body);
      const limit = body.limit ?? 50;
      const offset = body.offset ?? 0;
      const payload = await queryFilteredWorkItems(prisma, req.user!, {
        filter: body.filter,
        sort: body.sort,
        boardId: body.boardId,
        limit,
        offset,
      });
      res.json(payload);
    }),
  );

  app.get(
    "/task-saved-views",
    requireAuth,
    asyncHandler(async (req, res) => {
      const boardId =
        typeof req.query.boardId === "string" ? req.query.boardId : undefined;
      const views = await listSavedViews(prisma, req.user!, boardId);
      res.json({ views });
    }),
  );

  app.get(
    "/task-saved-views/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const view = await getSavedView(prisma, req.user!, String(req.params.id));
      res.json(view);
    }),
  );

  app.post(
    "/task-saved-views",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = savedViewCreateSchema.parse(req.body);
      const created = await createSavedView(prisma, req.user!, body);
      res.status(201).json(created);
    }),
  );

  app.patch(
    "/task-saved-views/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const updated = await updateSavedView(
        prisma,
        req.user!,
        String(req.params.id),
        savedViewUpdateSchema.parse(req.body),
      );
      res.json(updated);
    }),
  );

  app.delete(
    "/task-saved-views/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      await deleteSavedView(prisma, req.user!, String(req.params.id));
      res.status(204).end();
    }),
  );

  app.get(
    "/task-saved-views/:id/execute",
    requireAuth,
    asyncHandler(async (req, res) => {
      const limit = listLimit(req, 50, 100);
      const offset = listOffset(req);
      const payload = await executeSavedView(prisma, req.user!, String(req.params.id), {
        limit,
        offset,
      });
      res.json(payload);
    }),
  );
}
