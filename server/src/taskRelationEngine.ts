import {
  TaskActivityType,
  TaskRelationType,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type express from "express";
import { HttpError } from "./errors.js";
import { assertProjectCapability } from "./taskProjectRoles.js";
import { notifyWorkItemWatchers } from "./taskCollaborationNotify.js";

type Db = PrismaClient | Prisma.TransactionClient;

const taskSummarySelect = {
  taskId: true,
  title: true,
  issueKey: true,
  boardId: true,
  archivedAt: true,
} as const;

export function relationTaskDto(task: {
  taskId: string;
  title: string;
  issueKey: string | null;
  boardId: string | null;
}) {
  return {
    id: task.taskId,
    title: task.title,
    issueKey: task.issueKey ?? undefined,
    boardId: task.boardId ?? undefined,
  };
}

export function relationDto(relation: {
  relationId: string;
  relationType: TaskRelationType;
  sourceTaskId: string;
  targetTaskId: string;
  createdAt: Date;
  sourceTask: { taskId: string; title: string; issueKey: string | null; boardId: string | null };
  targetTask: { taskId: string; title: string; issueKey: string | null; boardId: string | null };
}) {
  return {
    id: relation.relationId,
    type: relation.relationType,
    source: relationTaskDto(relation.sourceTask),
    target: relationTaskDto(relation.targetTask),
    createdAt: relation.createdAt.toISOString(),
  };
}

/** Canonical endpoints for symmetric RELATES_TO (lexicographic task id order). */
export function canonicalRelatesToEndpoints(sourceTaskId: string, targetTaskId: string) {
  return sourceTaskId < targetTaskId
    ? { sourceTaskId, targetTaskId }
    : { sourceTaskId: targetTaskId, targetTaskId: sourceTaskId };
}

export async function assertTaskEditable(task: { archivedAt: Date | null }) {
  if (task.archivedAt) {
    throw new HttpError(409, "Restore this work item before making changes");
  }
}

async function assertBothTasksAccessible(
  db: Db,
  user: NonNullable<express.Request["user"]>,
  sourceTaskId: string,
  targetTaskId: string,
  assertBoardAccess: (user: NonNullable<express.Request["user"]>, boardId: string) => Promise<unknown>,
) {
  const tasks = await db.workTask.findMany({
    where: { taskId: { in: [sourceTaskId, targetTaskId] } },
    select: taskSummarySelect,
  });
  if (tasks.length !== 2) throw new HttpError(404, "Work item was not found");
  const source = tasks.find((t) => t.taskId === sourceTaskId)!;
  const target = tasks.find((t) => t.taskId === targetTaskId)!;
  if (!source.boardId || !target.boardId) {
    throw new HttpError(400, "Both work items must belong to a project");
  }
  await assertBoardAccess(user, source.boardId);
  if (target.boardId !== source.boardId) {
    await assertBoardAccess(user, target.boardId);
  }
  return { source, target };
}

/** Detect BLOCKS cycle if adding source blocks target. */
export async function wouldCreateBlocksCycle(
  db: Db,
  sourceTaskId: string,
  targetTaskId: string,
): Promise<boolean> {
  const visited = new Set<string>();
  const queue = [targetTaskId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === sourceTaskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const outgoing = await db.workTaskRelation.findMany({
      where: { sourceTaskId: current, relationType: TaskRelationType.BLOCKS },
      select: { targetTaskId: true },
    });
    for (const edge of outgoing) queue.push(edge.targetTaskId);
  }
  return false;
}

async function recordRelationActivity(
  tx: Prisma.TransactionClient,
  input: {
    taskId: string;
    authorUserId: string;
    activityType: TaskActivityType;
    message: string;
    metadata: Record<string, unknown>;
  },
) {
  await tx.taskUpdate.create({
    data: {
      taskId: input.taskId,
      authorUserId: input.authorUserId,
      activityType: input.activityType,
      message: input.message,
      metadata: input.metadata as Prisma.InputJsonValue,
    },
  });
  await tx.workTask.update({
    where: { taskId: input.taskId },
    data: { lastActivityAt: new Date() },
  });
}

export async function listTaskRelations(db: Db, taskId: string) {
  const relations = await db.workTaskRelation.findMany({
    where: {
      OR: [{ sourceTaskId: taskId }, { targetTaskId: taskId }],
    },
    include: {
      sourceTask: { select: taskSummarySelect },
      targetTask: { select: taskSummarySelect },
    },
    orderBy: { createdAt: "desc" },
  });

  const blocks: Array<ReturnType<typeof relationTaskDto>> = [];
  const blockedBy: Array<ReturnType<typeof relationTaskDto>> = [];
  const relatedTo: Array<ReturnType<typeof relationTaskDto>> = [];
  const duplicates: Array<ReturnType<typeof relationTaskDto>> = [];
  const duplicateOf: Array<ReturnType<typeof relationTaskDto>> = [];

  for (const rel of relations) {
    if (rel.relationType === TaskRelationType.BLOCKS) {
      if (rel.sourceTaskId === taskId) blocks.push(relationTaskDto(rel.targetTask));
      else blockedBy.push(relationTaskDto(rel.sourceTask));
    } else if (rel.relationType === TaskRelationType.RELATES_TO) {
      const other = rel.sourceTaskId === taskId ? rel.targetTask : rel.sourceTask;
      relatedTo.push(relationTaskDto(other));
    } else if (rel.relationType === TaskRelationType.DUPLICATES) {
      if (rel.sourceTaskId === taskId) duplicates.push(relationTaskDto(rel.targetTask));
      else duplicateOf.push(relationTaskDto(rel.sourceTask));
    }
  }

  const isBlocked = blockedBy.length > 0;
  return {
    blocks,
    blockedBy,
    relatedTo,
    duplicates,
    duplicateOf,
    isBlocked,
    relations: relations.map(relationDto),
  };
}

export async function createWorkTaskRelation(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  input: {
    sourceTaskId: string;
    targetTaskId: string;
    relationType: TaskRelationType;
  },
  assertBoardAccess: (user: NonNullable<express.Request["user"]>, boardId: string) => Promise<unknown>,
) {
  if (input.sourceTaskId === input.targetTaskId) {
    throw new HttpError(400, "A work item cannot be related to itself");
  }

  const { source, target } = await assertBothTasksAccessible(
    db,
    user,
    input.sourceTaskId,
    input.targetTaskId,
    assertBoardAccess,
  );
  await assertTaskEditable(source);
  await assertTaskEditable(target);

  if (source.boardId) {
    await assertProjectCapability(db, user, source.boardId, "EDIT_WORK_ITEM");
  }

  let sourceTaskId = input.sourceTaskId;
  let targetTaskId = input.targetTaskId;
  if (input.relationType === TaskRelationType.RELATES_TO) {
    const canonical = canonicalRelatesToEndpoints(sourceTaskId, targetTaskId);
    sourceTaskId = canonical.sourceTaskId;
    targetTaskId = canonical.targetTaskId;
  }

  const existing = await db.workTaskRelation.findFirst({
    where: {
      sourceTaskId,
      targetTaskId,
      relationType: input.relationType,
    },
  });
  if (existing) {
    throw new HttpError(409, "This relation already exists");
  }

  if (input.relationType === TaskRelationType.BLOCKS) {
    if (await wouldCreateBlocksCycle(db, sourceTaskId, targetTaskId)) {
      throw new HttpError(
        409,
        "This would create a circular blocking dependency. Remove or change existing blockers first.",
      );
    }
  }

  const sourceTask = await db.workTask.findUniqueOrThrow({
    where: { taskId: sourceTaskId },
    select: { issueKey: true, title: true },
  });
  const targetTask = await db.workTask.findUniqueOrThrow({
    where: { taskId: targetTaskId },
    select: { issueKey: true, title: true },
  });

  const sourceLabel = sourceTask.issueKey ?? sourceTask.title;
  const targetLabel = targetTask.issueKey ?? targetTask.title;

  const created = await db.$transaction(async (tx) => {
    const relation = await tx.workTaskRelation.create({
      data: {
        sourceTaskId,
        targetTaskId,
        relationType: input.relationType,
        createdByUserId: user.id,
      },
      include: {
        sourceTask: { select: taskSummarySelect },
        targetTask: { select: taskSummarySelect },
      },
    });

    const activityMessage =
      input.relationType === TaskRelationType.BLOCKS
        ? `linked ${sourceLabel} blocks ${targetLabel}`
        : input.relationType === TaskRelationType.RELATES_TO
          ? `linked ${sourceLabel} relates to ${targetLabel}`
          : `linked ${sourceLabel} duplicates ${targetLabel}`;

    const metadata = {
      relationId: relation.relationId,
      relationType: input.relationType,
      sourceTaskId,
      targetTaskId,
      sourceIssueKey: sourceTask.issueKey,
      targetIssueKey: targetTask.issueKey,
    };

    await recordRelationActivity(tx, {
      taskId: input.sourceTaskId,
      authorUserId: user.id,
      activityType: TaskActivityType.RELATION_ADDED,
      message: activityMessage,
      metadata,
    });
    if (input.targetTaskId !== input.sourceTaskId) {
      await recordRelationActivity(tx, {
        taskId: input.targetTaskId,
        authorUserId: user.id,
        activityType: TaskActivityType.RELATION_ADDED,
        message: activityMessage,
        metadata,
      });
    }

    return relation;
  });

  void notifyWorkItemWatchers(db, {
    taskId: input.sourceTaskId,
    actorUserId: user.id,
    kind: "relation",
    title: "Relation added",
    body: `${user.name} linked a relation on ${sourceLabel}`,
  }).catch(() => undefined);

  return relationDto(created);
}

export async function deleteWorkTaskRelation(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  relationId: string,
  assertBoardAccess: (user: NonNullable<express.Request["user"]>, boardId: string) => Promise<unknown>,
) {
  const relation = await db.workTaskRelation.findUnique({
    where: { relationId },
    include: {
      sourceTask: { select: taskSummarySelect },
      targetTask: { select: taskSummarySelect },
    },
  });
  if (!relation) throw new HttpError(404, "Relation was not found");

  await assertBothTasksAccessible(
    db,
    user,
    relation.sourceTaskId,
    relation.targetTaskId,
    assertBoardAccess,
  );
  if (relation.sourceTask.boardId) {
    await assertProjectCapability(db, user, relation.sourceTask.boardId, "EDIT_WORK_ITEM");
  }

  const sourceLabel = relation.sourceTask.issueKey ?? relation.sourceTask.title;
  const targetLabel = relation.targetTask.issueKey ?? relation.targetTask.title;

  await db.$transaction(async (tx) => {
    await tx.workTaskRelation.delete({ where: { relationId } });
    const message = `removed relation between ${sourceLabel} and ${targetLabel}`;
    const metadata = {
      relationId,
      relationType: relation.relationType,
      sourceTaskId: relation.sourceTaskId,
      targetTaskId: relation.targetTaskId,
    };
    await recordRelationActivity(tx, {
      taskId: relation.sourceTaskId,
      authorUserId: user.id,
      activityType: TaskActivityType.RELATION_REMOVED,
      message,
      metadata,
    });
    await recordRelationActivity(tx, {
      taskId: relation.targetTaskId,
      authorUserId: user.id,
      activityType: TaskActivityType.RELATION_REMOVED,
      message,
      metadata,
    });
  });

  return { ok: true };
}

/** Open blockers for optional transition validator. */
export async function listOpenBlockers(db: Db, taskId: string) {
  const blockers = await db.workTaskRelation.findMany({
    where: { targetTaskId: taskId, relationType: TaskRelationType.BLOCKS },
    include: {
      sourceTask: {
        select: { taskId: true, issueKey: true, title: true, archivedAt: true, boardId: true },
      },
    },
  });
  return blockers
    .filter((b) => !b.sourceTask.archivedAt)
    .map((b) => relationTaskDto(b.sourceTask));
}

export async function searchWorkItemsForRelation(
  db: Db,
  user: NonNullable<express.Request["user"]>,
  input: { boardId: string; query: string; excludeTaskId?: string; limit?: number },
  assertBoardAccess: (user: NonNullable<express.Request["user"]>, boardId: string) => Promise<unknown>,
) {
  await assertBoardAccess(user, input.boardId);
  const q = input.query.trim();
  if (q.length < 1) return [];
  const limit = Math.min(input.limit ?? 20, 50);
  const items = await db.workTask.findMany({
    where: {
      boardId: input.boardId,
      archivedAt: null,
      ...(input.excludeTaskId ? { taskId: { not: input.excludeTaskId } } : {}),
      OR: [
        { issueKey: { contains: q.toUpperCase() } },
        { title: { contains: q } },
      ],
    },
    select: taskSummarySelect,
    orderBy: { lastActivityAt: "desc" },
    take: limit,
  });
  return items.map(relationTaskDto);
}
