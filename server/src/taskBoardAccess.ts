import { Prisma, Role, TaskBoardAccessType } from "@prisma/client";
import type express from "express";
import { prisma } from "./prisma.js";
import { HttpError } from "./errors.js";
import { getOrganizationTeamEmployeeIds } from "./rbac.js";

export function boardAccessWhere(
  user: NonNullable<express.Request["user"]>,
): Prisma.TaskBoardWhereInput {
  if (user.role === Role.DEVELOPER_ADMIN) return {};
  return {
    OR: [
      { createdByUserId: user.id },
      { accessType: TaskBoardAccessType.OPEN },
      { accessType: TaskBoardAccessType.ROLE_GATED, roleAccess: { some: { role: user.role } } },
      ...(user.employeeId
        ? [
            {
              accessType: TaskBoardAccessType.MEMBER_GATED,
              members: { some: { employeeId: user.employeeId } },
            },
          ]
        : []),
    ],
  };
}

export async function assertBoardAccess(
  user: NonNullable<express.Request["user"]>,
  boardId: string,
) {
  const board = await prisma.taskBoard.findFirst({
    where: { boardId, ...boardAccessWhere(user) },
    select: { boardId: true },
  });
  if (!board) throw new HttpError(403, "This board is not available to your account");
  return board;
}

export async function assertCanAccessTask(
  user: NonNullable<express.Request["user"]>,
  taskId: string,
) {
  const task = await prisma.workTask.findUniqueOrThrow({
    where: { taskId },
    select: {
      taskId: true,
      boardId: true,
      assignments: { select: { employeeId: true } },
    },
  });
  const unrestrictedRoles: Role[] = [Role.DEVELOPER_ADMIN, Role.MAIN_ADMIN, Role.CEO, Role.HR];
  if (unrestrictedRoles.includes(user.role)) return task;

  const teamIds = user.employeeId ? await getOrganizationTeamEmployeeIds(user.employeeId) : [];
  const visibleIds = [
    ...new Set([...(user.employeeId ? [user.employeeId] : []), ...teamIds]),
  ];
  const assigneeIds = task.assignments.map((entry) => entry.employeeId);
  if (assigneeIds.some((id) => visibleIds.includes(id))) return task;
  if (task.boardId) {
    await assertBoardAccess(user, task.boardId);
    return task;
  }
  throw new HttpError(403, "Task is outside your organization team");
}
