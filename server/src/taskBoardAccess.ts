import { Prisma, Role, TaskBoardAccessType } from "@prisma/client";
import type express from "express";
import { prisma } from "./prisma.js";
import { HttpError } from "./errors.js";
import { getOrganizationTeamEmployeeIds } from "./rbac.js";

/** Pure board ACL filter — pass the caller's departmentId when known. */
export function boardAccessWhereFor(
  user: NonNullable<express.Request["user"]>,
  departmentId: string | null | undefined,
): Prisma.TaskBoardWhereInput {
  if (user.role === Role.DEVELOPER_ADMIN) return {};

  return {
    OR: [
      { createdByUserId: user.id },
      { accessType: TaskBoardAccessType.OPEN },
      ...(departmentId
        ? [
            {
              accessType: TaskBoardAccessType.DEPARTMENT_GATED,
              departmentAccess: { some: { departmentId } },
            },
          ]
        : []),
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

export async function boardAccessWhere(
  user: NonNullable<express.Request["user"]>,
): Promise<Prisma.TaskBoardWhereInput> {
  if (user.role === Role.DEVELOPER_ADMIN) return {};

  let departmentId: string | null = null;
  if (user.employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { employeeId: user.employeeId },
      select: { departmentId: true },
    });
    departmentId = employee?.departmentId ?? null;
  }

  return boardAccessWhereFor(user, departmentId);
}

export async function assertBoardAccess(
  user: NonNullable<express.Request["user"]>,
  boardId: string,
) {
  const board = await prisma.taskBoard.findFirst({
    where: { boardId, ...(await boardAccessWhere(user)) },
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
  // Board policy is the hard gate. A department head or HR who can see an
  // assignee must not thereby open a MEMBER_GATED board they were excluded
  // from — the board list already hides those boards from them.
  if (task.boardId) {
    await assertBoardAccess(user, task.boardId);
    return task;
  }
  if (user.role === Role.DEVELOPER_ADMIN) return task;
  const unrestrictedRoles: Role[] = [Role.MAIN_ADMIN, Role.CEO, Role.HR];
  if (unrestrictedRoles.includes(user.role)) return task;

  const teamIds = user.employeeId ? await getOrganizationTeamEmployeeIds(user.employeeId) : [];
  const visibleIds = [...new Set([...(user.employeeId ? [user.employeeId] : []), ...teamIds])];
  const assigneeIds = task.assignments.map((entry) => entry.employeeId);
  if (assigneeIds.some((id) => visibleIds.includes(id))) return task;
  throw new HttpError(403, "Task is outside your organization team");
}
