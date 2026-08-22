import type { PrismaClient } from "@prisma/client";
import type express from "express";
import { HttpError } from "./errors.js";
import { assertProjectCapability } from "./taskProjectRoles.js";

type AssertBoardAccess = (
  user: NonNullable<express.Request["user"]>,
  boardId: string,
) => Promise<unknown>;

export async function assertWorkItemViewable(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  taskId: string,
  assertBoardAccess: AssertBoardAccess,
) {
  const task = await db.workTask.findUnique({
    where: { taskId },
    select: { taskId: true, boardId: true, archivedAt: true },
  });
  if (!task?.boardId) throw new HttpError(404, "Work item was not found");
  await assertBoardAccess(user, task.boardId);
  await assertProjectCapability(db, user, task.boardId, "VIEW_PROJECT");
  return task;
}

export async function getWatcherState(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  taskId: string,
  assertBoardAccess: AssertBoardAccess,
) {
  await assertWorkItemViewable(db, user, taskId, assertBoardAccess);
  const row = await db.workItemWatcher.findUnique({
    where: { taskId_userId: { taskId, userId: user.id } },
  });
  const count = await db.workItemWatcher.count({ where: { taskId } });
  return { watching: Boolean(row), watcherCount: count };
}

export async function watchWorkItem(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  taskId: string,
  assertBoardAccess: AssertBoardAccess,
) {
  await assertWorkItemViewable(db, user, taskId, assertBoardAccess);
  await db.workItemWatcher.upsert({
    where: { taskId_userId: { taskId, userId: user.id } },
    create: { taskId, userId: user.id },
    update: {},
  });
  const count = await db.workItemWatcher.count({ where: { taskId } });
  return { watching: true, watcherCount: count };
}

export async function unwatchWorkItem(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  taskId: string,
  assertBoardAccess: AssertBoardAccess,
) {
  await assertWorkItemViewable(db, user, taskId, assertBoardAccess);
  await db.workItemWatcher.deleteMany({ where: { taskId, userId: user.id } });
  const count = await db.workItemWatcher.count({ where: { taskId } });
  return { watching: false, watcherCount: count };
}

/** Filter watcher user ids to those who still have project access. */
export async function listAuthorizedWatcherUserIds(
  db: PrismaClient,
  taskId: string,
  assertBoardAccessForUser: (
    user: NonNullable<express.Request["user"]>,
    boardId: string,
  ) => Promise<unknown>,
  loadUser: (userId: string) => Promise<NonNullable<express.Request["user"]> | null>,
) {
  const task = await db.workTask.findUnique({
    where: { taskId },
    select: { boardId: true },
  });
  if (!task?.boardId) return [];

  const watchers = await db.workItemWatcher.findMany({
    where: { taskId },
    select: { userId: true },
  });

  const authorized: string[] = [];
  for (const w of watchers) {
    const u = await loadUser(w.userId);
    if (!u) continue;
    try {
      await assertBoardAccessForUser(u, task.boardId);
      authorized.push(w.userId);
    } catch {
      // lost access — skip
    }
  }
  return authorized;
}
