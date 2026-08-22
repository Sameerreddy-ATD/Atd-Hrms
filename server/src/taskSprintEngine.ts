/**
 * Sprint and backlog planning — separate from Workflow Engine.
 */
import {
  TaskActivityType,
  TaskIssueType,
  TaskSprintEventType,
  TaskSprintStatus,
  TaskStatusCategory,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type express from "express";
import { HttpError } from "./errors.js";
import { NORMAL_WORK_TYPES } from "./taskHierarchy.js";
import { midpointRank } from "./taskIssueKeys.js";

type Db = PrismaClient | Prisma.TransactionClient;

export const SPRINT_ELIGIBLE_TYPES: TaskIssueType[] = NORMAL_WORK_TYPES;

export function isSprintEligibleType(issueType: TaskIssueType): boolean {
  return SPRINT_ELIGIBLE_TYPES.includes(issueType);
}

export async function activeMembershipForTask(db: Db, taskId: string) {
  return db.taskSprintMembership.findFirst({
    where: { taskId, removedAt: null },
    include: { sprint: true },
    orderBy: { addedAt: "desc" },
  });
}

/** Subtasks inherit parent's active sprint; EPIC never has direct membership. */
export async function resolveEffectiveSprint(
  db: Db,
  task: { taskId: string; issueType: TaskIssueType; parentTaskId?: string | null },
) {
  if (task.issueType === TaskIssueType.EPIC) return null;
  if (task.issueType === TaskIssueType.SUBTASK && task.parentTaskId) {
    const parentMembership = await activeMembershipForTask(db, task.parentTaskId);
    return parentMembership;
  }
  return activeMembershipForTask(db, task.taskId);
}

export async function nextBacklogRank(db: Db, boardId: string) {
  const top = await db.workTask.findFirst({
    where: {
      boardId,
      archivedAt: null,
      sprintMemberships: { none: { removedAt: null } },
      issueType: { in: SPRINT_ELIGIBLE_TYPES },
    },
    orderBy: { backlogRank: "desc" },
    select: { backlogRank: true },
  });
  return (top?.backlogRank ?? 0) + 1000;
}

export async function nextSprintRank(db: Db, sprintId: string) {
  const top = await db.taskSprintMembership.findFirst({
    where: { sprintId, removedAt: null },
    orderBy: { sprintRank: "desc" },
    select: { sprintRank: true },
  });
  return (top?.sprintRank ?? 0) + 1000;
}

async function recordSprintEvent(
  tx: Db,
  input: {
    sprintId: string;
    boardId: string;
    eventType: TaskSprintEventType;
    actorUserId: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await tx.taskSprintEvent.create({
    data: {
      sprintId: input.sprintId,
      boardId: input.boardId,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      metadata: input.metadata ?? undefined,
    },
  });
}

async function recordMembershipActivity(
  tx: Db,
  input: {
    taskId: string;
    actorUserId: string;
    message: string;
    metadata: Prisma.InputJsonValue;
  },
) {
  await tx.taskUpdate.create({
    data: {
      taskId: input.taskId,
      authorUserId: input.actorUserId,
      activityType: TaskActivityType.SPRINT_MEMBERSHIP_CHANGED,
      message: input.message,
      metadata: input.metadata,
    },
  });
  await tx.workTask.update({
    where: { taskId: input.taskId },
    data: { lastActivityAt: new Date() },
  });
}

function assertSprintDates(startDate: Date | null, endDate: Date | null) {
  if (startDate && endDate && endDate < startDate) {
    throw new HttpError(400, "Sprint end date must be on or after the start date");
  }
}

function assertPlannedDatesForStart(startDate: Date | null, endDate: Date | null) {
  if (!startDate || !endDate) {
    throw new HttpError(400, "Start and end dates are required before starting a sprint");
  }
  assertSprintDates(startDate, endDate);
}

export function sprintDto(sprint: {
  sprintId: string;
  boardId: string;
  name: string;
  goal: string | null;
  status: TaskSprintStatus;
  startDate: Date | null;
  endDate: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: sprint.sprintId,
    boardId: sprint.boardId,
    name: sprint.name,
    goal: sprint.goal ?? undefined,
    status: sprint.status,
    startDate: sprint.startDate?.toISOString().slice(0, 10),
    endDate: sprint.endDate?.toISOString().slice(0, 10),
    startedAt: sprint.startedAt?.toISOString(),
    completedAt: sprint.completedAt?.toISOString(),
    createdByUserId: sprint.createdByUserId,
    createdAt: sprint.createdAt.toISOString(),
    updatedAt: sprint.updatedAt.toISOString(),
  };
}

export async function sprintCountsForSprint(db: Db, sprintId: string) {
  const memberships = await db.taskSprintMembership.findMany({
    where: { sprintId, removedAt: null },
    include: {
      task: {
        select: {
          workflowStatus: { select: { category: true } },
          stage: { select: { statusCategory: true } },
        },
      },
    },
  });
  let total = 0;
  let todo = 0;
  let inProgress = 0;
  let done = 0;
  for (const row of memberships) {
    total += 1;
    const category =
      row.task.workflowStatus?.category ??
      row.task.stage?.statusCategory ??
      TaskStatusCategory.TODO;
    if (category === TaskStatusCategory.DONE) done += 1;
    else if (category === TaskStatusCategory.IN_PROGRESS) inProgress += 1;
    else todo += 1;
  }
  return { total, todo, inProgress, done };
}

export async function createSprint(
  db: Db,
  input: {
    boardId: string;
    name: string;
    goal?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    actor: express.Request["user"];
  },
) {
  if (!input.actor) throw new HttpError(401, "Authentication required");
  assertSprintDates(input.startDate ?? null, input.endDate ?? null);
  const sprint = await db.taskSprint.create({
    data: {
      boardId: input.boardId,
      name: input.name.trim(),
      goal: input.goal?.trim() || null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      status: TaskSprintStatus.PLANNED,
      createdByUserId: input.actor.id,
    },
  });
  await recordSprintEvent(db, {
    sprintId: sprint.sprintId,
    boardId: input.boardId,
    eventType: TaskSprintEventType.SPRINT_CREATED,
    actorUserId: input.actor.id,
  });
  return sprint;
}

export async function updateSprint(
  db: Db,
  sprintId: string,
  input: {
    name?: string;
    goal?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
  },
) {
  const existing = await db.taskSprint.findUniqueOrThrow({ where: { sprintId } });
  if (
    existing.status === TaskSprintStatus.COMPLETED ||
    existing.status === TaskSprintStatus.CANCELLED
  ) {
    throw new HttpError(409, "Completed or cancelled sprints cannot be edited");
  }
  const startDate = input.startDate !== undefined ? input.startDate : existing.startDate;
  const endDate = input.endDate !== undefined ? input.endDate : existing.endDate;
  assertSprintDates(startDate, endDate);
  if (existing.status === TaskSprintStatus.ACTIVE && input.startDate !== undefined) {
    throw new HttpError(400, "Start date cannot be changed while a sprint is active");
  }
  return db.taskSprint.update({
    where: { sprintId },
    data: {
      name: input.name?.trim() ?? undefined,
      goal: input.goal !== undefined ? input.goal?.trim() || null : undefined,
      startDate: input.startDate !== undefined ? input.startDate : undefined,
      endDate: input.endDate !== undefined ? input.endDate : undefined,
    },
  });
}

export async function startSprint(
  db: Db,
  sprintId: string,
  actor: express.Request["user"],
) {
  if (!actor) throw new HttpError(401, "Authentication required");
  const sprint = await db.taskSprint.findUniqueOrThrow({ where: { sprintId } });
  if (sprint.status !== TaskSprintStatus.PLANNED) {
    throw new HttpError(409, "Only planned sprints can be started");
  }
  assertPlannedDatesForStart(sprint.startDate, sprint.endDate);

  const active = await db.taskSprint.findFirst({
    where: { boardId: sprint.boardId, status: TaskSprintStatus.ACTIVE },
    select: { sprintId: true },
  });
  if (active && active.sprintId !== sprintId) {
    throw new HttpError(409, "This project already has an active sprint");
  }

  const updated = await db.taskSprint.update({
    where: { sprintId },
    data: {
      status: TaskSprintStatus.ACTIVE,
      startedAt: new Date(),
    },
  });
  await recordSprintEvent(db, {
    sprintId,
    boardId: sprint.boardId,
    eventType: TaskSprintEventType.SPRINT_STARTED,
    actorUserId: actor.id,
  });
  return updated;
}

type IncompleteDisposition = {
  taskId: string;
  target: "backlog" | { sprintId: string };
};

export async function completeSprint(
  db: Db,
  sprintId: string,
  actor: express.Request["user"],
  incompleteItems: IncompleteDisposition[],
) {
  if (!actor) throw new HttpError(401, "Authentication required");
  const sprint = await db.taskSprint.findUniqueOrThrow({ where: { sprintId } });
  if (sprint.status !== TaskSprintStatus.ACTIVE) {
    throw new HttpError(409, "Only active sprints can be completed");
  }

  const activeMemberships = await db.taskSprintMembership.findMany({
    where: { sprintId, removedAt: null },
    include: {
      task: {
        select: {
          taskId: true,
          issueType: true,
          workflowStatus: { select: { category: true } },
          stage: { select: { statusCategory: true } },
        },
      },
    },
  });

  const incomplete = activeMemberships.filter((row) => {
    const category =
      row.task.workflowStatus?.category ??
      row.task.stage?.statusCategory ??
      TaskStatusCategory.TODO;
    return category !== TaskStatusCategory.DONE;
  });

  const dispositionMap = new Map(incompleteItems.map((row) => [row.taskId, row.target]));
  for (const row of incomplete) {
    if (!dispositionMap.has(row.task.taskId)) {
      throw new HttpError(
        400,
        `Choose a destination for every incomplete sprint item (${row.task.taskId})`,
      );
    }
  }

  for (const row of activeMemberships) {
    const category =
      row.task.workflowStatus?.category ??
      row.task.stage?.statusCategory ??
      TaskStatusCategory.TODO;
    const isDone = category === TaskStatusCategory.DONE;
    if (isDone) {
      await db.taskSprintMembership.update({
        where: { membershipId: row.membershipId },
        data: { completedInSprint: true },
      });
      continue;
    }
    const target = dispositionMap.get(row.task.taskId)!;
    await removeTaskFromSprintInTx(db, {
      taskId: row.task.taskId,
      actorUserId: actor.id,
      reason: "sprint_completed",
    });
    if (typeof target === "object" && "sprintId" in target) {
      await assignTaskToSprintInTx(db, {
        taskId: row.task.taskId,
        sprintId: target.sprintId,
        actorUserId: actor.id,
        skipSprintStatusCheck: false,
      });
    } else {
      const rank = await nextBacklogRank(db, sprint.boardId);
      await db.workTask.update({
        where: { taskId: row.task.taskId },
        data: { backlogRank: rank },
      });
    }
  }

  const updated = await db.taskSprint.update({
    where: { sprintId },
    data: {
      status: TaskSprintStatus.COMPLETED,
      completedAt: new Date(),
    },
  });
  await recordSprintEvent(db, {
    sprintId,
    boardId: sprint.boardId,
    eventType: TaskSprintEventType.SPRINT_COMPLETED,
    actorUserId: actor.id,
    metadata: { incompleteCount: incomplete.length },
  });
  return updated;
}

export async function cancelSprint(
  db: Db,
  sprintId: string,
  actor: express.Request["user"],
  returnIncompleteToBacklog = true,
  destinationSprintId?: string,
) {
  if (!actor) throw new HttpError(401, "Authentication required");
  const sprint = await db.taskSprint.findUniqueOrThrow({ where: { sprintId } });
  if (
    sprint.status !== TaskSprintStatus.PLANNED &&
    sprint.status !== TaskSprintStatus.ACTIVE
  ) {
    throw new HttpError(409, "Only planned or active sprints can be cancelled");
  }

  const activeMemberships = await db.taskSprintMembership.findMany({
    where: { sprintId, removedAt: null },
    select: { taskId: true, membershipId: true },
  });

  if (destinationSprintId) {
    const dest = await db.taskSprint.findUniqueOrThrow({ where: { sprintId: destinationSprintId } });
    if (dest.boardId !== sprint.boardId) {
      throw new HttpError(400, "Destination sprint must belong to the same project");
    }
    if (dest.status !== TaskSprintStatus.PLANNED) {
      throw new HttpError(400, "Incomplete items can only move to a planned sprint");
    }
  }

  for (const row of activeMemberships) {
    await removeTaskFromSprintInTx(db, {
      taskId: row.taskId,
      actorUserId: actor.id,
      reason: "sprint_cancelled",
    });
    if (destinationSprintId) {
      await assignTaskToSprintInTx(db, {
        taskId: row.taskId,
        sprintId: destinationSprintId,
        actorUserId: actor.id,
      });
    } else if (returnIncompleteToBacklog) {
      const rank = await nextBacklogRank(db, sprint.boardId);
      await db.workTask.update({
        where: { taskId: row.taskId },
        data: { backlogRank: rank },
      });
    }
  }

  const updated = await db.taskSprint.update({
    where: { sprintId },
    data: { status: TaskSprintStatus.CANCELLED },
  });
  await recordSprintEvent(db, {
    sprintId,
    boardId: sprint.boardId,
    eventType: TaskSprintEventType.SPRINT_CANCELLED,
    actorUserId: actor.id,
  });
  return updated;
}

async function assertAssignableSprint(db: Db, sprintId: string) {
  const sprint = await db.taskSprint.findUniqueOrThrow({ where: { sprintId } });
  if (
    sprint.status === TaskSprintStatus.COMPLETED ||
    sprint.status === TaskSprintStatus.CANCELLED
  ) {
    throw new HttpError(409, "Cannot assign work to a completed or cancelled sprint");
  }
  return sprint;
}

async function assertTaskForSprintAssignment(
  db: Db,
  taskId: string,
  boardId: string,
) {
  const task = await db.workTask.findUniqueOrThrow({
    where: { taskId },
    select: {
      taskId: true,
      boardId: true,
      issueType: true,
      archivedAt: true,
      parentTaskId: true,
    },
  });
  if (task.archivedAt) throw new HttpError(409, "Archived work items cannot join a sprint");
  if (task.boardId !== boardId) {
    throw new HttpError(400, "Work item must belong to the same project as the sprint");
  }
  if (task.issueType === TaskIssueType.EPIC) {
    throw new HttpError(400, "Epics are not assigned to sprints");
  }
  if (task.issueType === TaskIssueType.SUBTASK) {
    throw new HttpError(400, "Subtasks inherit sprint membership from their parent");
  }
  if (!isSprintEligibleType(task.issueType)) {
    throw new HttpError(400, "This work item type cannot be sprint-planned");
  }
  return task;
}

export async function removeTaskFromSprintInTx(
  db: Db,
  input: { taskId: string; actorUserId: string; reason?: string },
) {
  const current = await activeMembershipForTask(db, input.taskId);
  if (!current) return null;
  await db.taskSprintMembership.update({
    where: { membershipId: current.membershipId },
    data: { removedAt: new Date(), removedByUserId: input.actorUserId },
  });
  const rank = await nextBacklogRank(db, current.sprint.boardId);
  await db.workTask.update({
    where: { taskId: input.taskId },
    data: { backlogRank: rank },
  });
  await recordMembershipActivity(db, {
    taskId: input.taskId,
    actorUserId: input.actorUserId,
    message: `Removed from sprint "${current.sprint.name}"`,
    metadata: {
      action: "WORK_ITEM_REMOVED_FROM_SPRINT",
      sprintId: current.sprintId,
      sprintName: current.sprint.name,
      reason: input.reason ?? "manual",
    },
  });
  return current;
}

export async function assignTaskToSprintInTx(
  db: Db,
  input: {
    taskId: string;
    sprintId: string;
    actorUserId: string;
    sprintRank?: number;
    rankBeforeTaskId?: string;
    rankAfterTaskId?: string;
    skipSprintStatusCheck?: boolean;
  },
) {
  const sprint = await assertAssignableSprint(db, input.sprintId);
  await assertTaskForSprintAssignment(db, input.taskId, sprint.boardId);

  const existing = await activeMembershipForTask(db, input.taskId);
  if (existing?.sprintId === input.sprintId) {
    return existing;
  }
  if (existing) {
    await db.taskSprintMembership.update({
      where: { membershipId: existing.membershipId },
      data: { removedAt: new Date(), removedByUserId: input.actorUserId },
    });
    await recordMembershipActivity(db, {
      taskId: input.taskId,
      actorUserId: input.actorUserId,
      message: `Moved from sprint "${existing.sprint.name}" to "${sprint.name}"`,
      metadata: {
        action: "WORK_ITEM_MOVED_BETWEEN_SPRINTS",
        fromSprintId: existing.sprintId,
        toSprintId: input.sprintId,
      },
    });
  }

  let sprintRank = input.sprintRank;
  if (sprintRank == null && (input.rankBeforeTaskId || input.rankAfterTaskId)) {
    const neighbors = await db.taskSprintMembership.findMany({
      where: {
        sprintId: input.sprintId,
        removedAt: null,
        taskId: { in: [input.rankBeforeTaskId, input.rankAfterTaskId].filter(Boolean) as string[] },
      },
      select: { taskId: true, sprintRank: true },
    });
    const before = neighbors.find((n) => n.taskId === input.rankBeforeTaskId)?.sprintRank;
    const after = neighbors.find((n) => n.taskId === input.rankAfterTaskId)?.sprintRank;
    sprintRank = midpointRank(before, after) ?? (await nextSprintRank(db, input.sprintId));
  }
  if (sprintRank == null) sprintRank = await nextSprintRank(db, input.sprintId);

  const membership = await db.taskSprintMembership.create({
    data: {
      sprintId: input.sprintId,
      taskId: input.taskId,
      sprintRank,
      addedByUserId: input.actorUserId,
    },
    include: { sprint: true },
  });

  if (!existing) {
    await recordMembershipActivity(db, {
      taskId: input.taskId,
      actorUserId: input.actorUserId,
      message: `Added to sprint "${sprint.name}"`,
      metadata: {
        action: "WORK_ITEM_ADDED_TO_SPRINT",
        sprintId: input.sprintId,
        sprintName: sprint.name,
      },
    });
  }
  return membership;
}

export async function moveTaskPlanningRank(
  db: Db,
  input: {
    taskId: string;
    actorUserId: string;
    backlogRankBeforeTaskId?: string;
    backlogRankAfterTaskId?: string;
    sprintRankBeforeTaskId?: string;
    sprintRankAfterTaskId?: string;
  },
) {
  const membership = await activeMembershipForTask(db, input.taskId);
  if (membership) {
    const neighbors = await db.taskSprintMembership.findMany({
      where: {
        sprintId: membership.sprintId,
        removedAt: null,
        taskId: {
          in: [input.sprintRankBeforeTaskId, input.sprintRankAfterTaskId].filter(Boolean) as string[],
        },
      },
      select: { taskId: true, sprintRank: true },
    });
    const before = neighbors.find((n) => n.taskId === input.sprintRankBeforeTaskId)?.sprintRank;
    const after = neighbors.find((n) => n.taskId === input.sprintRankAfterTaskId)?.sprintRank;
    const next = midpointRank(before, after);
    if (next == null) return membership;
    return db.taskSprintMembership.update({
      where: { membershipId: membership.membershipId },
      data: { sprintRank: next },
    });
  }

  const task = await db.workTask.findUniqueOrThrow({
    where: { taskId: input.taskId },
    select: { boardId: true },
  });
  if (!task.boardId) throw new HttpError(400, "Work item has no project");
  const neighbors = await db.workTask.findMany({
    where: {
      boardId: task.boardId,
      taskId: {
        in: [input.backlogRankBeforeTaskId, input.backlogRankAfterTaskId].filter(Boolean) as string[],
      },
    },
    select: { taskId: true, backlogRank: true },
  });
  const before = neighbors.find((n) => n.taskId === input.backlogRankBeforeTaskId)?.backlogRank;
  const after = neighbors.find((n) => n.taskId === input.backlogRankAfterTaskId)?.backlogRank;
  const next = midpointRank(before, after);
  if (next == null) return task;
  return db.workTask.update({
    where: { taskId: input.taskId },
    data: { backlogRank: next },
  });
}

export async function clearSprintOnTypeChange(
  db: Db,
  taskId: string,
  actorUserId: string,
  newType: TaskIssueType,
) {
  if (newType === TaskIssueType.EPIC || newType === TaskIssueType.SUBTASK) {
    await removeTaskFromSprintInTx(db, { taskId, actorUserId, reason: "issue_type_change" });
  }
}

export async function sprintSummaryForTask(db: Db, taskId: string) {
  const task = await db.workTask.findUnique({
    where: { taskId },
    select: { taskId: true, issueType: true, parentTaskId: true },
  });
  if (!task) return null;
  const effective = await resolveEffectiveSprint(db, task);
  if (!effective) return null;
  return {
    sprintId: effective.sprint.sprintId,
    name: effective.sprint.name,
    status: effective.sprint.status,
    membershipId: effective.membershipId,
    sprintRank: effective.sprintRank,
    inherited: task.issueType === TaskIssueType.SUBTASK,
  };
}
