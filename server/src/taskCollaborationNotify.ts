import { TaskActivityType, type PrismaClient } from "@prisma/client";
import type express from "express";
import { publishNotificationChange } from "./notificationLive.js";
import { sendPushToUsers } from "./push.js";
import { listAuthorizedWatcherUserIds } from "./taskWatcherEngine.js";

type Db = PrismaClient;

export async function listTaskActivity(
  db: Db,
  user: NonNullable<express.Request["user"]>,
  taskId: string,
  input: { cursor?: string; limit?: number; filter?: "all" | "comments" | "history" },
  assertBoardAccess: (user: NonNullable<express.Request["user"]>, boardId: string) => Promise<unknown>,
) {
  const task = await db.workTask.findUniqueOrThrow({
    where: { taskId },
    select: { boardId: true },
  });
  if (!task.boardId) throw new Error("Work item has no project");
  await assertBoardAccess(user, task.boardId);

  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const filter = input.filter ?? "all";

  const activityTypes =
    filter === "comments"
      ? [TaskActivityType.COMMENT]
      : filter === "history"
        ? Object.values(TaskActivityType).filter((t) => t !== TaskActivityType.COMMENT)
        : undefined;

  const cursorRow = input.cursor
    ? await db.taskUpdate.findUnique({
        where: { updateId: input.cursor },
        select: { createdAt: true, updateId: true },
      })
    : null;

  const rows = await db.taskUpdate.findMany({
    where: {
      taskId,
      ...(activityTypes ? { activityType: { in: activityTypes } } : {}),
      ...(cursorRow
        ? {
            OR: [
              { createdAt: { lt: cursorRow.createdAt } },
              { createdAt: cursorRow.createdAt, updateId: { lt: cursorRow.updateId } },
            ],
          }
        : {}),
    },
    include: { author: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: "desc" }, { updateId: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.updateId : undefined;

  return {
    items: items.map((entry) => ({
      id: entry.updateId,
      authorName: entry.author.name,
      authorUserId: entry.author.id,
      activityType: entry.activityType,
      message: entry.message,
      metadata: entry.metadata ?? undefined,
      progress: entry.progress ?? undefined,
      status: entry.status ?? undefined,
      minutesWorked: entry.minutesWorked ?? undefined,
      createdAt: entry.createdAt.toISOString(),
    })),
    nextCursor,
    hasMore,
  };
}

export async function notifyWorkItemWatchers(
  db: Db,
  input: {
    taskId: string;
    actorUserId: string;
    kind: string;
    title: string;
    body: string;
    href?: string;
  },
) {
  const task = await db.workTask.findUnique({
    where: { taskId: input.taskId },
    select: { boardId: true, issueKey: true },
  });
  if (!task?.boardId) return;

  const loadUser = async (userId: string) => {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        employeeId: true,
        status: true,
      },
    });
    if (!u || u.status !== "ACTIVE") return null;
    return {
      ...u,
      mustChangePassword: false,
      sessionVersion: 0,
    } as NonNullable<express.Request["user"]>;
  };

  const assertBoardAccessForUser = async (
    u: NonNullable<express.Request["user"]>,
    boardId: string,
  ) => {
    const board = await db.taskBoard.findFirst({
      where: { boardId },
      select: { boardId: true },
    });
    if (!board) throw new Error("no access");
    // Full access check happens in app layer; here we use simplified membership query
    if (u.role === "DEVELOPER_ADMIN" || u.role === "MAIN_ADMIN") return;
    const member = u.employeeId
      ? await db.taskBoardMember.findFirst({
          where: { boardId, employeeId: u.employeeId },
        })
      : null;
    const boardMeta = await db.taskBoard.findUnique({
      where: { boardId },
      select: { accessType: true, createdByUserId: true },
    });
    if (!boardMeta) throw new Error("no access");
    if (boardMeta.createdByUserId === u.id) return;
    if (boardMeta.accessType === "OPEN") return;
    if (!member) throw new Error("no access");
  };

  const watcherIds = await listAuthorizedWatcherUserIds(
    db,
    input.taskId,
    assertBoardAccessForUser,
    loadUser,
  );

  const recipients = watcherIds.filter((id) => id !== input.actorUserId);
  if (recipients.length === 0) return;

  publishNotificationChange("task-watcher", input.taskId, recipients);
  await sendPushToUsers(recipients, {
    title: input.title,
    body: input.body,
    href: input.href ?? `/tasks?task=${input.taskId}`,
    tag: `task-watcher-${input.taskId}-${input.kind}`,
  });
}
