/**
 * Canonical Task Planner workflow engine.
 * All status changes go through transitionWorkItem — no arbitrary status writes.
 */
import {
  TaskIssueType,
  TaskProjectRole,
  TaskStatus,
  TaskStatusCategory,
  TaskWorkflowKind,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type express from "express";
import { HttpError } from "./errors.js";
import { midpointRank, nextRankInStage } from "./taskIssueKeys.js";
import { assertProjectCapability } from "./taskProjectRoles.js";
import {
  DEFAULT_WORKFLOWS,
  catalogForIssueType,
  legacyTaskStatusForCategory,
} from "./taskWorkflowCatalog.js";

type Db = PrismaClient | Prisma.TransactionClient;
type Actor = NonNullable<express.Request["user"]>;

const workflowInclude = {
  statuses: { orderBy: { sortOrder: "asc" as const } },
  transitions: true,
} as const;

export type TransitionInput = {
  workItemId: string;
  transitionId: string;
  actor: Actor;
  comment?: string | null;
  expectedVersion?: number;
  rankBeforeTaskId?: string;
  rankAfterTaskId?: string;
  fieldValues?: Record<string, string | number | boolean | null>;
};

export function parseRoleList(value: Prisma.JsonValue | null | undefined): TaskProjectRole[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.filter(
    (entry): entry is TaskProjectRole =>
      entry === "PROJECT_ADMIN" ||
      entry === "PROJECT_LEAD" ||
      entry === "MEMBER" ||
      entry === "VIEWER",
  );
}

function parseStringList(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

export function friendlyInvalidTransition(fromName: string, toName: string) {
  return `This work item cannot move directly from ${fromName} to ${toName}.`;
}

export async function workflowForIssueType(
  db: Db,
  boardId: string,
  issueType: TaskIssueType,
) {
  const mapping = await db.taskWorkflowTypeMapping.findUnique({
    where: { boardId_issueType: { boardId, issueType } },
    include: { workflow: { include: workflowInclude } },
  });
  if (mapping?.workflow) return mapping.workflow;
  const fallback = await db.taskWorkflow.findFirst({
    where: { boardId, isDefault: true, active: true },
    include: workflowInclude,
  });
  if (fallback) return fallback;
  throw new HttpError(409, "This project has no workflow configured");
}

export function initialStatusOf(
  workflow: { statuses: Array<{ statusId: string; isInitial: boolean; active: boolean; sortOrder: number }> },
) {
  const initial = workflow.statuses.find((status) => status.isInitial && status.active);
  if (!initial) {
    throw new HttpError(409, "This workflow needs exactly one initial status");
  }
  return initial;
}

export function roleMayExecuteTransition(
  actorRole: TaskProjectRole,
  allowed: TaskProjectRole[] | null,
): boolean {
  if (actorRole === TaskProjectRole.PROJECT_ADMIN) return true;
  if (!allowed || allowed.length === 0) {
    return actorRole !== TaskProjectRole.VIEWER;
  }
  return allowed.includes(actorRole);
}

function roleMayExecute(actorRole: TaskProjectRole, allowed: TaskProjectRole[] | null): boolean {
  return roleMayExecuteTransition(actorRole, allowed);
}

async function fieldValueOnTask(
  task: {
    title: string;
    description: string | null;
    resolution: string | null;
    customFields: Prisma.JsonValue | null;
  },
  field: string,
  extras?: Record<string, string | number | boolean | null>,
) {
  if (extras && extras[field] != null && String(extras[field]).trim() !== "") return extras[field];
  if (field === "title") return task.title;
  if (field === "description") return task.description;
  if (field === "resolution") return task.resolution;
  const custom =
    task.customFields && typeof task.customFields === "object" && !Array.isArray(task.customFields)
      ? (task.customFields as Record<string, unknown>)
      : {};
  return custom[field] as string | number | boolean | null | undefined;
}

function roleHasTransition(role: TaskProjectRole) {
  return role !== TaskProjectRole.VIEWER;
}

export async function listAvailableTransitions(
  db: Db,
  actor: Actor,
  task: {
    taskId: string;
    boardId: string | null;
    archivedAt: Date | null;
    workflowStatusId: string | null;
    issueType: TaskIssueType;
  },
) {
  if (!task.boardId || task.archivedAt) return [];
  const { role } = await assertProjectCapability(db, actor, task.boardId, "VIEW_PROJECT");
  if (!roleHasTransition(role)) return [];
  const statusId = task.workflowStatusId;
  if (!statusId) return [];
  const transitions = await db.taskWorkflowTransition.findMany({
    where: { fromStatusId: statusId, active: true, workflow: { active: true } },
    include: { toStatus: true, fromStatus: true },
    orderBy: { name: "asc" },
  });
  return transitions.filter((transition) =>
    roleMayExecute(role, parseRoleList(transition.allowedProjectRoles)),
  );
}

export async function transitionWorkItem(db: PrismaClient, input: TransitionInput) {
  return db.$transaction((tx) => transitionWorkItemInTx(tx, input));
}

export async function transitionWorkItemInTx(tx: Prisma.TransactionClient, input: TransitionInput) {
  const existing = await tx.workTask.findUnique({
    where: { taskId: input.workItemId },
    include: {
      workflowStatus: true,
      board: { select: { boardId: true, archived: true } },
    },
  });
  if (!existing) throw new HttpError(404, "Work item was not found");
  if (!existing.boardId) throw new HttpError(400, "This work item is not on a project");
  if (existing.archivedAt) {
    throw new HttpError(409, "Restore this work item before changing its status");
  }
  if (existing.board?.archived) {
    throw new HttpError(409, "Restore this project before changing work items");
  }

  const { role } = await assertProjectCapability(
    tx,
    input.actor,
    existing.boardId,
    "TRANSITION_WORK_ITEM",
  );

  const transition = await tx.taskWorkflowTransition.findUnique({
    where: { transitionId: input.transitionId },
    include: { fromStatus: true, toStatus: true, workflow: true },
  });
  if (!transition || !transition.active || !transition.workflow.active) {
    throw new HttpError(404, "That transition is not available");
  }
  if (transition.workflow.boardId !== existing.boardId) {
    throw new HttpError(400, "That transition does not belong to this project");
  }
  if (transition.fromStatusId === transition.toStatusId) {
    throw new HttpError(400, "A transition cannot start and end on the same status");
  }
  if (!existing.workflowStatusId || existing.workflowStatusId !== transition.fromStatusId) {
    throw new HttpError(
      409,
      friendlyInvalidTransition(
        existing.workflowStatus?.name ?? "the current status",
        transition.toStatus.name,
      ),
    );
  }
  if (!roleMayExecute(role, parseRoleList(transition.allowedProjectRoles))) {
    throw new HttpError(403, "You do not have permission to use this transition");
  }
  if (transition.commentRequired && !input.comment?.trim()) {
    throw new HttpError(400, "This transition requires a comment");
  }
  if (transition.resolutionRequired) {
    const resolution = await fieldValueOnTask(existing, "resolution", input.fieldValues);
    if (resolution == null || String(resolution).trim() === "") {
      throw new HttpError(400, "This transition requires a resolution");
    }
  }
  for (const field of parseStringList(transition.requiredFields)) {
    const value = await fieldValueOnTask(existing, field, input.fieldValues);
    if (value == null || String(value).trim() === "") {
      throw new HttpError(400, `This transition requires ${field}`);
    }
  }

  const toStatus = transition.toStatus;
  const nextStageId = toStatus.stageId ?? existing.stageId;
  const nextLegacyStatus = legacyTaskStatusForCategory(toStatus.category, toStatus.name) as TaskStatus;
  const isDone = toStatus.category === TaskStatusCategory.DONE;
  const expectedVersion = input.expectedVersion ?? existing.version;

  let nextRank = existing.rank;
  if (nextStageId && nextStageId !== existing.stageId) {
    if (input.rankBeforeTaskId || input.rankAfterTaskId) {
      nextRank =
        (await rankFromNeighbors(
          tx,
          input.rankBeforeTaskId,
          input.rankAfterTaskId,
          existing.rank,
        )) ?? existing.rank;
      if (nextRank === existing.rank) {
        nextRank = await nextRankInStage(tx, existing.boardId, nextStageId);
      }
    } else {
      nextRank = await nextRankInStage(tx, existing.boardId, nextStageId);
    }
  } else if (input.rankBeforeTaskId || input.rankAfterTaskId) {
    nextRank =
      (await rankFromNeighbors(
        tx,
        input.rankBeforeTaskId,
        input.rankAfterTaskId,
        existing.rank,
      )) ?? existing.rank;
  }

  const nextResolution =
    input.fieldValues?.resolution != null ? String(input.fieldValues.resolution) : existing.resolution;

  const changed = await tx.workTask.updateMany({
    where: { taskId: existing.taskId, version: expectedVersion },
    data: {
      workflowStatusId: toStatus.statusId,
      stageId: nextStageId,
      status: nextLegacyStatus,
      rank: nextRank,
      progress: isDone ? 100 : existing.progress === 100 && !isDone ? 0 : existing.progress,
      completedAt: isDone ? existing.completedAt ?? new Date() : null,
      resolution: nextResolution,
      version: { increment: 1 },
      lastActivityAt: new Date(),
    },
  });
  if (changed.count !== 1) {
    throw new HttpError(409, "This task was updated elsewhere. Refresh and try again");
  }

  const actorName = input.actor.name || "Someone";
  const message = `${actorName} moved this item\n${transition.fromStatus.name} → ${transition.toStatus.name}`;
  await tx.taskTransitionHistory.create({
    data: {
      taskId: existing.taskId,
      fromStatusId: transition.fromStatusId,
      toStatusId: transition.toStatusId,
      fromStatusName: transition.fromStatus.name,
      toStatusName: transition.toStatus.name,
      transitionId: transition.transitionId,
      transitionName: transition.name,
      actorUserId: input.actor.id,
      comment: input.comment?.trim() || null,
      metadata: { workflowId: transition.workflowId },
    },
  });
  await tx.taskUpdate.create({
    data: {
      taskId: existing.taskId,
      authorUserId: input.actor.id,
      activityType: "STATUS_CHANGED",
      message: input.comment?.trim() ? `${message}\n${input.comment.trim()}` : message,
      status: nextLegacyStatus,
      progress: isDone ? 100 : existing.progress,
      metadata: {
        fromStatus: transition.fromStatus.name,
        toStatus: transition.toStatus.name,
        transition: transition.name,
        comment: input.comment?.trim() || undefined,
      },
    },
  });

  return tx.workTask.findUniqueOrThrow({ where: { taskId: existing.taskId } });
}

async function rankFromNeighbors(
  tx: Prisma.TransactionClient,
  beforeId: string | undefined,
  afterId: string | undefined,
  fallback: number,
) {
  const neighbors = await tx.workTask.findMany({
    where: { taskId: { in: [beforeId, afterId].filter(Boolean) as string[] } },
    select: { taskId: true, rank: true },
  });
  const before = neighbors.find((row) => row.taskId === beforeId)?.rank;
  const after = neighbors.find((row) => row.taskId === afterId)?.rank;
  if (before != null && after != null) return midpointRank(before, after) ?? fallback;
  if (before != null) return before + 1000;
  if (after != null) return after / 2;
  return fallback;
}

export async function resolveTransitionForStageMove(
  db: Db,
  actor: Actor,
  task: {
    taskId: string;
    boardId: string | null;
    archivedAt: Date | null;
    workflowStatusId: string | null;
    stageId: string | null;
    issueType: TaskIssueType;
  },
  targetStageId: string,
) {
  if (!task.boardId) throw new HttpError(400, "This work item is not on a project");
  if (task.stageId === targetStageId) return null;
  const available = await listAvailableTransitions(db, actor, task);
  const matching = available.filter((transition) => transition.toStatus.stageId === targetStageId);
  if (matching.length === 0) {
    const fromRow = task.workflowStatusId
      ? await db.taskWorkflowStatus.findUnique({ where: { statusId: task.workflowStatusId } })
      : null;
    const fromName = available[0]?.fromStatus.name ?? fromRow?.name ?? "the current status";
    const stage = await db.taskStage.findUnique({ where: { stageId: targetStageId } });
    throw new HttpError(409, friendlyInvalidTransition(fromName, stage?.name ?? "that column"));
  }
  matching.sort((left, right) => left.toStatus.sortOrder - right.toStatus.sortOrder);
  return matching[0]!;
}

export function mapStatusForTypeChange(input: {
  fromCategory: TaskStatusCategory;
  fromName: string;
  targetStatuses: Array<{
    statusId: string;
    name: string;
    category: TaskStatusCategory;
    active: boolean;
    isInitial: boolean;
    sortOrder: number;
    stageId?: string | null;
  }>;
}) {
  const active = input.targetStatuses.filter((status) => status.active);
  const sameName = active.find((status) => normalizeName(status.name) === normalizeName(input.fromName));
  if (sameName) return sameName;
  const sameCategory = active
    .filter((status) => status.category === input.fromCategory)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  if (sameCategory[0]) return sameCategory[0];
  const initial = active.find((status) => status.isInitial);
  if (initial) return initial;
  throw new HttpError(
    409,
    "This work type uses a different workflow. Choose a valid destination status.",
  );
}

function columnForStageName(
  stages: Array<{
    stageId: string;
    name: string;
    statusCategory: TaskStatusCategory;
    isCompleted: boolean;
    sortOrder: number;
  }>,
  preferredName: string,
  category: TaskStatusCategory,
) {
  const byName = stages.find((stage) => normalizeName(stage.name) === normalizeName(preferredName));
  if (byName) return byName;
  const byCategory = [...stages]
    .filter((stage) =>
      category === TaskStatusCategory.DONE
        ? stage.isCompleted || stage.statusCategory === TaskStatusCategory.DONE
        : stage.statusCategory === category,
    )
    .sort((left, right) => left.sortOrder - right.sortOrder);
  return byCategory[0] ?? stages[0] ?? null;
}

async function createWorkflowFromCatalog(
  tx: Prisma.TransactionClient,
  boardId: string,
  catalog: CatalogWorkflowLike,
  stages: Array<{
    stageId: string;
    name: string;
    statusCategory: TaskStatusCategory;
    isCompleted: boolean;
    sortOrder: number;
  }>,
  isDefault: boolean,
) {
  const workflow = await tx.taskWorkflow.create({
    data: {
      boardId,
      name: catalog.name,
      description: catalog.description,
      kind: catalog.kind as TaskWorkflowKind,
      active: true,
      isDefault,
    },
  });
  const statusIds = new Map<string, string>();
  for (const [index, status] of catalog.statuses.entries()) {
    const column = columnForStageName(stages, status.column, status.category);
    const row = await tx.taskWorkflowStatus.create({
      data: {
        workflowId: workflow.workflowId,
        name: status.name,
        category: status.category,
        sortOrder: index,
        color: status.color,
        isInitial: Boolean(status.isInitial),
        isTerminal: Boolean(status.isTerminal),
        active: true,
        stageId: column?.stageId ?? null,
      },
    });
    statusIds.set(status.key, row.statusId);
  }
  for (const edge of catalog.transitions) {
    const fromStatusId = statusIds.get(edge.from);
    const toStatusId = statusIds.get(edge.to);
    if (!fromStatusId || !toStatusId) continue;
    await tx.taskWorkflowTransition.create({
      data: {
        workflowId: workflow.workflowId,
        name: edge.name,
        fromStatusId,
        toStatusId,
        active: true,
        allowedProjectRoles: edge.allowedProjectRoles ?? undefined,
        requiredFields: edge.requiredFields ?? undefined,
        commentRequired: Boolean(edge.commentRequired),
        resolutionRequired: false,
      },
    });
  }
  for (const issueType of catalog.issueTypes) {
    await tx.taskWorkflowTypeMapping.upsert({
      where: { boardId_issueType: { boardId, issueType } },
      create: { boardId, issueType, workflowId: workflow.workflowId },
      update: { workflowId: workflow.workflowId },
    });
  }
  return workflow;
}

type CatalogWorkflowLike = (typeof DEFAULT_WORKFLOWS)[number];

async function createMigratedStandardWorkflow(
  tx: Prisma.TransactionClient,
  boardId: string,
  stages: Array<{
    stageId: string;
    name: string;
    color: string;
    sortOrder: number;
    isCompleted: boolean;
    statusCategory: TaskStatusCategory;
  }>,
) {
  const workflow = await tx.taskWorkflow.create({
    data: {
      boardId,
      name: "Project workflow",
      description: "Preserved from existing board columns.",
      kind: TaskWorkflowKind.STANDARD,
      active: true,
      isDefault: true,
    },
  });
  const ordered = [...stages].sort((left, right) => left.sortOrder - right.sortOrder);
  const created: Array<{ statusId: string; stageId: string; category: TaskStatusCategory; name: string }> =
    [];
  for (const [index, stage] of ordered.entries()) {
    const category = stage.isCompleted ? TaskStatusCategory.DONE : stage.statusCategory;
    const row = await tx.taskWorkflowStatus.create({
      data: {
        workflowId: workflow.workflowId,
        name: stage.name,
        category,
        sortOrder: index,
        color: stage.color,
        isInitial: index === 0,
        isTerminal: category === TaskStatusCategory.DONE,
        active: true,
        stageId: stage.stageId,
      },
    });
    created.push({ statusId: row.statusId, stageId: stage.stageId, category, name: stage.name });
  }
  for (let index = 0; index < created.length - 1; index += 1) {
    const from = created[index]!;
    const to = created[index + 1]!;
    await tx.taskWorkflowTransition.create({
      data: {
        workflowId: workflow.workflowId,
        name: `${from.name} → ${to.name}`,
        fromStatusId: from.statusId,
        toStatusId: to.statusId,
        active: true,
      },
    });
  }
  const inProgress = [...created].reverse().find((row) => row.category === TaskStatusCategory.IN_PROGRESS);
  const terminal = [...created].reverse().find((row) => row.category === TaskStatusCategory.DONE);
  if (inProgress && terminal) {
    await tx.taskWorkflowTransition.create({
      data: {
        workflowId: workflow.workflowId,
        name: "Reopen",
        fromStatusId: terminal.statusId,
        toStatusId: inProgress.statusId,
        active: true,
        allowedProjectRoles: [TaskProjectRole.PROJECT_LEAD, TaskProjectRole.PROJECT_ADMIN],
      },
    });
  }
  const blocked = created.find((row) => /block/i.test(row.name));
  const progress = created.find((row) => row.category === TaskStatusCategory.IN_PROGRESS && row !== blocked);
  if (blocked && progress) {
    await tx.taskWorkflowTransition.create({
      data: {
        workflowId: workflow.workflowId,
        name: "Block",
        fromStatusId: progress.statusId,
        toStatusId: blocked.statusId,
        active: true,
      },
    });
    await tx.taskWorkflowTransition.create({
      data: {
        workflowId: workflow.workflowId,
        name: "Unblock",
        fromStatusId: blocked.statusId,
        toStatusId: progress.statusId,
        active: true,
      },
    });
  }
  for (const status of created) {
    await tx.workTask.updateMany({
      where: { boardId, stageId: status.stageId },
      data: { workflowStatusId: status.statusId },
    });
  }
  for (const issueType of [
    TaskIssueType.STORY,
    TaskIssueType.TASK,
    TaskIssueType.IMPROVEMENT,
    TaskIssueType.BUG,
    TaskIssueType.SUBTASK,
    TaskIssueType.EPIC,
  ]) {
    await tx.taskWorkflowTypeMapping.upsert({
      where: { boardId_issueType: { boardId, issueType } },
      create: { boardId, issueType, workflowId: workflow.workflowId },
      update: {},
    });
  }
  return workflow;
}

export async function ensureProjectWorkflows(
  tx: Prisma.TransactionClient,
  boardId: string,
  options?: { preferCatalog?: boolean },
) {
  const existingCount = await tx.taskWorkflow.count({ where: { boardId } });
  const stages = await tx.taskStage.findMany({
    where: { boardId },
    orderBy: { sortOrder: "asc" },
  });
  if (stages.length === 0) return;

  if (existingCount === 0) {
    const looksLikeCatalog =
      Boolean(options?.preferCatalog) || stages.some((stage) => normalizeName(stage.name) === "backlog");
    if (looksLikeCatalog) {
      for (const catalog of DEFAULT_WORKFLOWS) {
        await createWorkflowFromCatalog(tx, boardId, catalog, stages, catalog.kind === "STANDARD");
      }
      const standard = await tx.taskWorkflow.findFirst({
        where: { boardId, kind: TaskWorkflowKind.STANDARD },
        include: { statuses: true },
      });
      if (standard) {
        for (const status of standard.statuses) {
          if (!status.stageId) continue;
          await tx.workTask.updateMany({
            where: { boardId, stageId: status.stageId, workflowStatusId: null },
            data: { workflowStatusId: status.statusId },
          });
        }
      }
    } else {
      await createMigratedStandardWorkflow(tx, boardId, stages);
      for (const catalog of DEFAULT_WORKFLOWS.filter((entry) => entry.kind !== "STANDARD")) {
        await createWorkflowFromCatalog(tx, boardId, catalog, stages, false);
      }
    }
    return;
  }

  const kinds = new Set(
    (await tx.taskWorkflow.findMany({ where: { boardId }, select: { kind: true } })).map((row) => row.kind),
  );
  for (const catalog of DEFAULT_WORKFLOWS) {
    if (kinds.has(catalog.kind as TaskWorkflowKind)) continue;
    await createWorkflowFromCatalog(tx, boardId, catalog, stages, false);
  }
}

export async function availableTransitionsDto(
  db: Db,
  actor: Actor,
  task: {
    taskId: string;
    boardId: string | null;
    archivedAt: Date | null;
    workflowStatusId: string | null;
    issueType: TaskIssueType;
  },
) {
  const rows = await listAvailableTransitions(db, actor, task);
  return rows.map((transition) => ({
    id: transition.transitionId,
    name: transition.name,
    toStatusId: transition.toStatusId,
    toStatusName: transition.toStatus.name,
    toStageId: transition.toStatus.stageId ?? undefined,
    commentRequired: transition.commentRequired,
    requiredFields: parseStringList(transition.requiredFields),
    resolutionRequired: transition.resolutionRequired,
  }));
}

export { catalogForIssueType };
