import { TaskActivityType, type PrismaClient } from "@prisma/client";
import type express from "express";
import { HttpError } from "./errors.js";
import { assertProjectCapability, resolveProjectRole } from "./taskProjectRoles.js";
import { formatMinutesAsDuration, parseDurationToMinutes } from "./taskDurationParse.js";
import { assertTaskEditable } from "./taskRelationEngine.js";
import { notifyWorkItemWatchers } from "./taskCollaborationNotify.js";

type AssertBoardAccess = (
  user: NonNullable<express.Request["user"]>,
  boardId: string,
) => Promise<unknown>;

export function workLogDto(log: {
  workLogId: string;
  taskId: string;
  userId: string;
  minutes: number;
  workDate: Date;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string };
  createdBy: { id: string; name: string };
}) {
  return {
    id: log.workLogId,
    taskId: log.taskId,
    userId: log.userId,
    userName: log.user.name,
    minutes: log.minutes,
    durationLabel: formatMinutesAsDuration(log.minutes),
    workDate: log.workDate.toISOString().slice(0, 10),
    description: log.description ?? undefined,
    createdByName: log.createdBy.name,
    createdAt: log.createdAt.toISOString(),
    updatedAt: log.updatedAt.toISOString(),
  };
}

const logInclude = {
  user: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

export async function computeWorkLogTotals(db: PrismaClient, taskId: string, viewerUserId?: string) {
  const all = await db.workLog.aggregate({
    where: { taskId, deletedAt: null },
    _sum: { minutes: true },
  });
  let yourMinutes = 0;
  if (viewerUserId) {
    const yours = await db.workLog.aggregate({
      where: { taskId, userId: viewerUserId, deletedAt: null },
      _sum: { minutes: true },
    });
    yourMinutes = yours._sum.minutes ?? 0;
  }
  const totalMinutes = all._sum.minutes ?? 0;
  return {
    totalMinutes,
    yourMinutes,
    totalLabel: formatMinutesAsDuration(totalMinutes),
    yourLabel: formatMinutesAsDuration(yourMinutes),
  };
}

export async function listWorkLogs(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  taskId: string,
  assertBoardAccess: AssertBoardAccess,
) {
  const task = await db.workTask.findUniqueOrThrow({
    where: { taskId },
    select: { boardId: true },
  });
  if (!task.boardId) throw new HttpError(404, "Work item was not found");
  await assertBoardAccess(user, task.boardId);
  await assertProjectCapability(db, user, task.boardId, "VIEW_PROJECT");

  const logs = await db.workLog.findMany({
    where: { taskId, deletedAt: null },
    include: logInclude,
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
  });
  const totals = await computeWorkLogTotals(db, taskId, user.id);
  return { logs: logs.map(workLogDto), totals };
}

async function canManageWorkLog(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  boardId: string,
  logUserId: string,
) {
  if (logUserId === user.id) return true;
  const board = await db.taskBoard.findUniqueOrThrow({
    where: { boardId },
    select: {
      boardId: true,
      createdByUserId: true,
      leadEmployeeId: true,
      accessType: true,
      members: { select: { employeeId: true, role: true } },
    },
  });
  const role = await resolveProjectRole(db, user, board);
  return role === "PROJECT_ADMIN" || role === "PROJECT_LEAD";
}

export async function createWorkLog(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  taskId: string,
  input: { duration: string; workDate: string; description?: string | null },
  assertBoardAccess: AssertBoardAccess,
) {
  const task = await db.workTask.findUniqueOrThrow({
    where: { taskId },
    select: { taskId: true, boardId: true, archivedAt: true, issueKey: true, title: true },
  });
  if (!task.boardId) throw new HttpError(400, "This work item is not on a project");
  await assertBoardAccess(user, task.boardId);
  await assertProjectCapability(db, user, task.boardId, "EDIT_WORK_ITEM");
  await assertTaskEditable(task);

  const minutes = parseDurationToMinutes(input.duration);
  const workDate = new Date(input.workDate);
  if (Number.isNaN(workDate.getTime())) throw new HttpError(400, "Work date is invalid");

  const created = await db.$transaction(async (tx) => {
    const log = await tx.workLog.create({
      data: {
        taskId,
        userId: user.id,
        minutes,
        workDate,
        description: input.description?.trim() || null,
        createdByUserId: user.id,
      },
      include: logInclude,
    });
    await tx.taskUpdate.create({
      data: {
        taskId,
        authorUserId: user.id,
        activityType: TaskActivityType.WORK_LOG_ADDED,
        message: `logged ${formatMinutesAsDuration(minutes)}`,
        metadata: { workLogId: log.workLogId, minutes, workDate: input.workDate },
        minutesWorked: minutes,
      },
    });
    await tx.workTask.update({
      where: { taskId },
      data: { lastActivityAt: new Date() },
    });
    return log;
  });

  void notifyWorkItemWatchers(db, {
    taskId,
    actorUserId: user.id,
    kind: "worklog",
    title: "Time logged",
    body: `${user.name} logged ${formatMinutesAsDuration(minutes)} on ${task.issueKey ?? task.title}`,
  }).catch(() => undefined);

  return workLogDto(created);
}

export async function updateWorkLog(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  workLogId: string,
  input: { duration?: string; workDate?: string; description?: string | null },
  assertBoardAccess: AssertBoardAccess,
) {
  const existing = await db.workLog.findUnique({
    where: { workLogId },
    include: { task: { select: { taskId: true, boardId: true, archivedAt: true, issueKey: true, title: true } } },
  });
  if (!existing || existing.deletedAt) throw new HttpError(404, "Work log was not found");
  if (!existing.task.boardId) throw new HttpError(400, "This work item is not on a project");
  await assertBoardAccess(user, existing.task.boardId);
  await assertTaskEditable(existing.task);

  const canEdit = await canManageWorkLog(db, user, existing.task.boardId, existing.userId);
  if (!canEdit) throw new HttpError(403, "You do not have permission to edit this work log");

  const nextMinutes = input.duration != null ? parseDurationToMinutes(input.duration) : existing.minutes;
  const nextDate = input.workDate != null ? new Date(input.workDate) : existing.workDate;
  if (Number.isNaN(nextDate.getTime())) throw new HttpError(400, "Work date is invalid");

  const updated = await db.$transaction(async (tx) => {
    const log = await tx.workLog.update({
      where: { workLogId },
      data: {
        minutes: nextMinutes,
        workDate: nextDate,
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        updatedByUserId: user.id,
      },
      include: logInclude,
    });
    await tx.taskUpdate.create({
      data: {
        taskId: existing.taskId,
        authorUserId: user.id,
        activityType: TaskActivityType.WORK_LOG_UPDATED,
        message: `updated time log to ${formatMinutesAsDuration(nextMinutes)}`,
        metadata: {
          workLogId,
          oldMinutes: existing.minutes,
          newMinutes: nextMinutes,
        },
        minutesWorked: nextMinutes,
      },
    });
    await tx.workTask.update({
      where: { taskId: existing.taskId },
      data: { lastActivityAt: new Date() },
    });
    return log;
  });

  return workLogDto(updated);
}

export async function deleteWorkLog(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  workLogId: string,
  assertBoardAccess: AssertBoardAccess,
) {
  const existing = await db.workLog.findUnique({
    where: { workLogId },
    include: { task: { select: { taskId: true, boardId: true, archivedAt: true } } },
  });
  if (!existing || existing.deletedAt) throw new HttpError(404, "Work log was not found");
  if (!existing.task.boardId) throw new HttpError(400, "This work item is not on a project");
  await assertBoardAccess(user, existing.task.boardId);
  await assertTaskEditable(existing.task);

  const canEdit = await canManageWorkLog(db, user, existing.task.boardId, existing.userId);
  if (!canEdit) throw new HttpError(403, "You do not have permission to delete this work log");

  await db.$transaction(async (tx) => {
    await tx.workLog.update({
      where: { workLogId },
      data: { deletedAt: new Date(), updatedByUserId: user.id },
    });
    await tx.taskUpdate.create({
      data: {
        taskId: existing.taskId,
        authorUserId: user.id,
        activityType: TaskActivityType.WORK_LOG_DELETED,
        message: `removed time log of ${formatMinutesAsDuration(existing.minutes)}`,
        metadata: { workLogId, minutes: existing.minutes },
      },
    });
    await tx.workTask.update({
      where: { taskId: existing.taskId },
      data: { lastActivityAt: new Date() },
    });
  });

  return { ok: true };
}
