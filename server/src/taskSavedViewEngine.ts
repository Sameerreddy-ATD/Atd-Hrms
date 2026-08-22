import {
  Prisma,
  TaskSavedViewScope,
  type PrismaClient,
} from "@prisma/client";
import type express from "express";
import { z } from "zod";
import { HttpError } from "./errors.js";
import { assertBoardAccess, boardAccessWhere } from "./taskBoardAccess.js";
import { assertProjectCapability } from "./taskProjectRoles.js";
import {
  parseColumnConfig,
  parseFilterConfig,
  parseSortConfig,
  taskColumnConfigSchema,
  taskFilterConfigSchema,
  taskSortConfigSchema,
  type TaskColumnConfig,
  type TaskFilterConfig,
  type TaskSortConfig,
} from "./taskFilterSchema.js";
import { queryFilteredWorkItems } from "./taskSearchEngine.js";

const savedViewCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  scope: z.nativeEnum(TaskSavedViewScope),
  boardId: z.string().min(1).nullable().optional(),
  filterConfig: taskFilterConfigSchema,
  sortConfig: taskSortConfigSchema,
  columnConfig: taskColumnConfigSchema,
  isDefault: z.boolean().optional(),
});

const savedViewUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  filterConfig: taskFilterConfigSchema.optional(),
  sortConfig: taskSortConfigSchema.optional(),
  columnConfig: taskColumnConfigSchema.optional(),
  isDefault: z.boolean().optional(),
  version: z.number().int().min(1),
});

export type SavedViewDto = {
  id: string;
  name: string;
  description?: string;
  scope: TaskSavedViewScope;
  boardId?: string;
  boardName?: string;
  ownerUserId: string;
  ownerName?: string;
  filterConfig: TaskFilterConfig;
  sortConfig: TaskSortConfig;
  columnConfig: TaskColumnConfig;
  isDefault: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

function savedViewDto(
  row: {
    savedViewId: string;
    name: string;
    description: string | null;
    scope: TaskSavedViewScope;
    boardId: string | null;
    ownerUserId: string;
    filterConfig: unknown;
    sortConfig: unknown;
    columnConfig: unknown;
    isDefault: boolean;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    board?: { name: string } | null;
    owner?: { name: string } | null;
  },
): SavedViewDto {
  return {
    id: row.savedViewId,
    name: row.name,
    description: row.description ?? undefined,
    scope: row.scope,
    boardId: row.boardId ?? undefined,
    boardName: row.board?.name,
    ownerUserId: row.ownerUserId,
    ownerName: row.owner?.name,
    filterConfig: parseFilterConfig(row.filterConfig),
    sortConfig: parseSortConfig(row.sortConfig),
    columnConfig: parseColumnConfig(row.columnConfig),
    isDefault: row.isDefault,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertCanReadSavedView(
  user: NonNullable<express.Request["user"]>,
  view: { scope: TaskSavedViewScope; ownerUserId: string; boardId: string | null },
) {
  if (view.scope === TaskSavedViewScope.PERSONAL) {
    if (view.ownerUserId !== user.id) {
      throw new HttpError(403, "This saved view is not available to your account");
    }
    return;
  }
  if (!view.boardId) throw new HttpError(404, "Saved view was not found");
  await assertBoardAccess(user, view.boardId);
}

async function assertCanManageSavedView(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  view: {
    scope: TaskSavedViewScope;
    ownerUserId: string;
    boardId: string | null;
  },
) {
  if (view.scope === TaskSavedViewScope.PERSONAL) {
    if (view.ownerUserId !== user.id) {
      throw new HttpError(403, "You cannot modify this saved view");
    }
    return;
  }
  if (!view.boardId) throw new HttpError(404, "Saved view was not found");
  await assertProjectCapability(db, user, view.boardId, "MANAGE_PROJECT");
}

async function clearDefaultForOwner(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  boardId: string | null,
  exceptId?: string,
) {
  await tx.taskSavedView.updateMany({
    where: {
      ownerUserId,
      isDefault: true,
      boardId,
      ...(exceptId ? { savedViewId: { not: exceptId } } : {}),
    },
    data: { isDefault: false },
  });
}

export async function listSavedViews(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  boardId?: string,
): Promise<SavedViewDto[]> {
  const personal = await db.taskSavedView.findMany({
    where: { ownerUserId: user.id, scope: TaskSavedViewScope.PERSONAL },
    include: { board: { select: { name: true } }, owner: { select: { name: true } } },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });

  let project: typeof personal = [];
  if (boardId) {
    await assertBoardAccess(user, boardId);
    project = await db.taskSavedView.findMany({
      where: { boardId, scope: TaskSavedViewScope.PROJECT },
      include: { board: { select: { name: true } }, owner: { select: { name: true } } },
      orderBy: [{ updatedAt: "desc" }],
    });
  } else {
    const accessibleBoards = await db.taskBoard.findMany({
      where: await boardAccessWhere(user),
      select: { boardId: true },
    });
    const boardIds = accessibleBoards.map((b) => b.boardId);
    if (boardIds.length) {
      project = await db.taskSavedView.findMany({
        where: { boardId: { in: boardIds }, scope: TaskSavedViewScope.PROJECT },
        include: { board: { select: { name: true } }, owner: { select: { name: true } } },
        orderBy: [{ updatedAt: "desc" }],
      });
    }
  }

  return [...personal, ...project].map(savedViewDto);
}

export async function getSavedView(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  savedViewId: string,
): Promise<SavedViewDto> {
  const row = await db.taskSavedView.findUnique({
    where: { savedViewId },
    include: { board: { select: { name: true } }, owner: { select: { name: true } } },
  });
  if (!row) throw new HttpError(404, "Saved view was not found");
  await assertCanReadSavedView(user, row);
  return savedViewDto(row);
}

export async function createSavedView(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  input: z.infer<typeof savedViewCreateSchema>,
): Promise<SavedViewDto> {
  const body = savedViewCreateSchema.parse(input);
  const filterConfig = parseFilterConfig(body.filterConfig);
  const sortConfig = parseSortConfig(body.sortConfig);
  const columnConfig = parseColumnConfig(body.columnConfig);

  if (body.scope === TaskSavedViewScope.PROJECT) {
    if (!body.boardId) throw new HttpError(400, "Project saved views require a project");
    await assertProjectCapability(db, user, body.boardId, "MANAGE_PROJECT");
  } else if (body.boardId) {
    await assertBoardAccess(user, body.boardId);
  }

  const created = await db.$transaction(async (tx) => {
    if (body.isDefault) {
      await clearDefaultForOwner(tx, user.id, body.boardId ?? null);
    }
    return tx.taskSavedView.create({
      data: {
        ownerUserId: user.id,
        boardId: body.boardId ?? null,
        name: body.name,
        description: body.description ?? null,
        scope: body.scope,
        filterConfig: filterConfig as Prisma.InputJsonValue,
        sortConfig: sortConfig as Prisma.InputJsonValue,
        columnConfig: columnConfig as Prisma.InputJsonValue,
        isDefault: body.isDefault ?? false,
      },
      include: { board: { select: { name: true } }, owner: { select: { name: true } } },
    });
  });

  return savedViewDto(created);
}

export async function updateSavedView(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  savedViewId: string,
  input: z.infer<typeof savedViewUpdateSchema>,
): Promise<SavedViewDto> {
  const body = savedViewUpdateSchema.parse(input);
  const existing = await db.taskSavedView.findUnique({ where: { savedViewId } });
  if (!existing) throw new HttpError(404, "Saved view was not found");
  await assertCanManageSavedView(db, user, existing);
  if (existing.version !== body.version) {
    throw new HttpError(409, "Saved view was updated elsewhere. Refresh and try again.");
  }

  const updated = await db.$transaction(async (tx) => {
    if (body.isDefault) {
      await clearDefaultForOwner(tx, existing.ownerUserId, existing.boardId, savedViewId);
    }
    return tx.taskSavedView.update({
      where: { savedViewId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.filterConfig !== undefined
          ? { filterConfig: parseFilterConfig(body.filterConfig) as Prisma.InputJsonValue }
          : {}),
        ...(body.sortConfig !== undefined
          ? { sortConfig: parseSortConfig(body.sortConfig) as Prisma.InputJsonValue }
          : {}),
        ...(body.columnConfig !== undefined
          ? { columnConfig: parseColumnConfig(body.columnConfig) as Prisma.InputJsonValue }
          : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        version: { increment: 1 },
      },
      include: { board: { select: { name: true } }, owner: { select: { name: true } } },
    });
  });

  return savedViewDto(updated);
}

export async function deleteSavedView(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  savedViewId: string,
): Promise<void> {
  const existing = await db.taskSavedView.findUnique({ where: { savedViewId } });
  if (!existing) throw new HttpError(404, "Saved view was not found");
  await assertCanManageSavedView(db, user, existing);
  await db.taskSavedView.delete({ where: { savedViewId } });
}

export async function executeSavedView(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  savedViewId: string,
  params: { limit: number; offset: number },
) {
  const view = await getSavedView(db, user, savedViewId);
  const filter = view.filterConfig;
  const sort = view.sortConfig;
  const boardId = view.boardId ?? filter.boardIds?.[0];
  return queryFilteredWorkItems(db, user, {
    filter,
    sort,
    boardId,
    limit: params.limit,
    offset: params.offset,
  });
}

export { savedViewCreateSchema, savedViewUpdateSchema };
