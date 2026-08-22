/**
 * Project-admin workflow configuration (statuses + transitions).
 */
import {
  TaskStatusCategory,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { HttpError } from "./errors.js";
import { legacyTaskStatusForCategory } from "./taskWorkflowCatalog.js";

type Db = PrismaClient | Prisma.TransactionClient;

export async function addWorkflowStatus(
  db: Db,
  workflowId: string,
  input: {
    name: string;
    category: TaskStatusCategory;
    color?: string;
    sortOrder?: number;
    isInitial?: boolean;
    isTerminal?: boolean;
    stageId?: string | null;
  },
) {
  const workflow = await db.taskWorkflow.findUniqueOrThrow({
    where: { workflowId },
    include: { statuses: true, board: { select: { boardId: true, stages: true } } },
  });
  if (input.isInitial) {
    await db.taskWorkflowStatus.updateMany({
      where: { workflowId, isInitial: true },
      data: { isInitial: false },
    });
  } else if (!workflow.statuses.some((status) => status.isInitial && status.active) && !input.isInitial) {
    // first status becomes initial
  }
  const sortOrder =
    input.sortOrder ?? (Math.max(0, ...workflow.statuses.map((status) => status.sortOrder)) + 1);
  const stageId =
    input.stageId === undefined
      ? workflow.board.stages.find((stage) =>
          input.category === TaskStatusCategory.DONE
            ? stage.isCompleted
            : stage.statusCategory === input.category,
        )?.stageId ?? null
      : input.stageId;
  return db.taskWorkflowStatus.create({
    data: {
      workflowId,
      name: input.name,
      category: input.category,
      color: input.color ?? "SLATE",
      sortOrder,
      isInitial: Boolean(input.isInitial) || workflow.statuses.filter((s) => s.active).length === 0,
      isTerminal: input.isTerminal ?? input.category === TaskStatusCategory.DONE,
      stageId,
      active: true,
    },
  });
}

export async function updateWorkflowStatus(
  db: Db,
  statusId: string,
  input: {
    name?: string;
    category?: TaskStatusCategory;
    color?: string;
    sortOrder?: number;
    isInitial?: boolean;
    isTerminal?: boolean;
    stageId?: string | null;
    active?: boolean;
  },
) {
  const existing = await db.taskWorkflowStatus.findUniqueOrThrow({
    where: { statusId },
    include: { workflow: { include: { statuses: true } } },
  });
  if (input.active === false) {
    const inUse = await db.workTask.count({ where: { workflowStatusId: statusId } });
    if (inUse > 0 && input.active === false) {
      // deactivate only — never hard delete referenced statuses
    }
    const remainingInitial = existing.workflow.statuses.filter(
      (status) => status.active && status.isInitial && status.statusId !== statusId,
    );
    if (existing.isInitial && remainingInitial.length === 0 && input.isInitial !== true) {
      throw new HttpError(409, "Keep exactly one initial status on this workflow");
    }
  }
  if (input.isInitial) {
    await db.taskWorkflowStatus.updateMany({
      where: { workflowId: existing.workflowId, isInitial: true, NOT: { statusId } },
      data: { isInitial: false },
    });
  }
  return db.taskWorkflowStatus.update({
    where: { statusId },
    data: {
      name: input.name,
      category: input.category,
      color: input.color,
      sortOrder: input.sortOrder,
      isInitial: input.isInitial,
      isTerminal: input.isTerminal,
      stageId: input.stageId,
      active: input.active,
    },
  });
}

export async function deactivateWorkflowStatus(db: Db, statusId: string) {
  const referenced =
    (await db.workTask.count({ where: { workflowStatusId: statusId } })) +
    (await db.taskTransitionHistory.count({
      where: { OR: [{ fromStatusId: statusId }, { toStatusId: statusId }] },
    }));
  if (referenced > 0) {
    return updateWorkflowStatus(db, statusId, { active: false });
  }
  const existing = await db.taskWorkflowStatus.findUniqueOrThrow({ where: { statusId } });
  if (existing.isInitial) {
    throw new HttpError(409, "Keep exactly one initial status on this workflow");
  }
  await db.taskWorkflowTransition.deleteMany({
    where: { OR: [{ fromStatusId: statusId }, { toStatusId: statusId }] },
  });
  return db.taskWorkflowStatus.delete({ where: { statusId } });
}

export async function addWorkflowTransition(
  db: Db,
  workflowId: string,
  input: {
    name: string;
    fromStatusId: string;
    toStatusId: string;
    allowedProjectRoles?: string[] | null;
    requiredFields?: string[] | null;
    commentRequired?: boolean;
    resolutionRequired?: boolean;
  },
) {
  if (input.fromStatusId === input.toStatusId) {
    throw new HttpError(400, "A transition cannot start and end on the same status");
  }
  const [from, to] = await Promise.all([
    db.taskWorkflowStatus.findUnique({ where: { statusId: input.fromStatusId } }),
    db.taskWorkflowStatus.findUnique({ where: { statusId: input.toStatusId } }),
  ]);
  if (!from || from.workflowId !== workflowId || !to || to.workflowId !== workflowId) {
    throw new HttpError(400, "Select statuses from this workflow");
  }
  return db.taskWorkflowTransition.create({
    data: {
      workflowId,
      name: input.name,
      fromStatusId: input.fromStatusId,
      toStatusId: input.toStatusId,
      allowedProjectRoles: input.allowedProjectRoles ?? undefined,
      requiredFields: input.requiredFields ?? undefined,
      commentRequired: Boolean(input.commentRequired),
      resolutionRequired: Boolean(input.resolutionRequired),
      active: true,
    },
  });
}

export function workflowDto(workflow: {
  workflowId: string;
  boardId: string;
  name: string;
  description: string | null;
  kind: string;
  active: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  statuses: Array<{
    statusId: string;
    name: string;
    category: TaskStatusCategory;
    sortOrder: number;
    color: string;
    isInitial: boolean;
    isTerminal: boolean;
    active: boolean;
    stageId: string | null;
  }>;
  transitions: Array<{
    transitionId: string;
    name: string;
    fromStatusId: string;
    toStatusId: string;
    active: boolean;
    allowedProjectRoles: Prisma.JsonValue | null;
    requiredFields: Prisma.JsonValue | null;
    commentRequired: boolean;
    resolutionRequired: boolean;
  }>;
}) {
  return {
    id: workflow.workflowId,
    boardId: workflow.boardId,
    name: workflow.name,
    description: workflow.description ?? undefined,
    kind: workflow.kind,
    active: workflow.active,
    isDefault: workflow.isDefault,
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString(),
    statuses: workflow.statuses.map((status) => ({
      id: status.statusId,
      name: status.name,
      category: status.category,
      sortOrder: status.sortOrder,
      color: status.color,
      isInitial: status.isInitial,
      isTerminal: status.isTerminal,
      active: status.active,
      stageId: status.stageId ?? undefined,
      legacyStatus: legacyTaskStatusForCategory(status.category, status.name),
    })),
    transitions: workflow.transitions.map((transition) => ({
      id: transition.transitionId,
      name: transition.name,
      fromStatusId: transition.fromStatusId,
      toStatusId: transition.toStatusId,
      active: transition.active,
      allowedProjectRoles: Array.isArray(transition.allowedProjectRoles)
        ? transition.allowedProjectRoles
        : [],
      requiredFields: Array.isArray(transition.requiredFields) ? transition.requiredFields : [],
      commentRequired: transition.commentRequired,
      resolutionRequired: transition.resolutionRequired,
    })),
  };
}
