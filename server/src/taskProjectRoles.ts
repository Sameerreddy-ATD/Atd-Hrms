/**
 * Project roles + capabilities for Task Planner foundation.
 * Access type (OPEN / DEPARTMENT_GATED / MEMBER_GATED) remains the hard board gate.
 * Roles refine what a permitted member may do inside a project.
 */
import {
  Role,
  TaskProjectRole,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type express from "express";
import { HttpError } from "./errors.js";

export type ProjectCapability =
  | "CREATE_WORK_ITEM"
  | "EDIT_WORK_ITEM"
  | "ASSIGN_WORK_ITEM"
  | "TRANSITION_WORK_ITEM"
  | "MANAGE_SPRINT"
  | "MANAGE_COMPONENTS"
  | "MANAGE_PROJECT"
  | "ARCHIVE_PROJECT"
  | "VIEW_REPORTS"
  | "VIEW_PROJECT";

const ROLE_CAPABILITIES: Record<TaskProjectRole, readonly ProjectCapability[]> = {
  PROJECT_ADMIN: [
    "VIEW_PROJECT",
    "CREATE_WORK_ITEM",
    "EDIT_WORK_ITEM",
    "ASSIGN_WORK_ITEM",
    "TRANSITION_WORK_ITEM",
    "MANAGE_SPRINT",
    "MANAGE_COMPONENTS",
    "MANAGE_PROJECT",
    "ARCHIVE_PROJECT",
    "VIEW_REPORTS",
  ],
  PROJECT_LEAD: [
    "VIEW_PROJECT",
    "CREATE_WORK_ITEM",
    "EDIT_WORK_ITEM",
    "ASSIGN_WORK_ITEM",
    "TRANSITION_WORK_ITEM",
    "MANAGE_SPRINT",
    "MANAGE_COMPONENTS",
    "ARCHIVE_PROJECT",
    "VIEW_REPORTS",
  ],
  MEMBER: [
    "VIEW_PROJECT",
    "CREATE_WORK_ITEM",
    "EDIT_WORK_ITEM",
    "ASSIGN_WORK_ITEM",
    "TRANSITION_WORK_ITEM",
  ],
  VIEWER: ["VIEW_PROJECT", "VIEW_REPORTS"],
};

export function capabilitiesForRole(role: TaskProjectRole): readonly ProjectCapability[] {
  return ROLE_CAPABILITIES[role];
}

export function roleHasCapability(
  role: TaskProjectRole,
  capability: ProjectCapability,
): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

type Db = PrismaClient | Prisma.TransactionClient;

export async function resolveProjectRole(
  db: Db,
  user: NonNullable<express.Request["user"]>,
  board: {
    boardId: string;
    createdByUserId: string;
    leadEmployeeId?: string | null;
    accessType: string;
    members: Array<{ employeeId: string; role: TaskProjectRole }>;
  },
): Promise<TaskProjectRole | null> {
  if (user.role === Role.DEVELOPER_ADMIN || user.role === Role.MAIN_ADMIN) {
    return TaskProjectRole.PROJECT_ADMIN;
  }
  if (board.createdByUserId === user.id) {
    return TaskProjectRole.PROJECT_ADMIN;
  }
  if (user.employeeId && board.leadEmployeeId === user.employeeId) {
    return TaskProjectRole.PROJECT_LEAD;
  }
  if (user.employeeId) {
    const membership = board.members.find((m) => m.employeeId === user.employeeId);
    if (membership) return membership.role;
  }
  // OPEN boards: non-members who can view get MEMBER write defaults (legacy behavior).
  if (board.accessType === "OPEN") {
    return TaskProjectRole.MEMBER;
  }
  // Department-gated viewers without membership: treat as VIEWER (read).
  if (board.accessType === "DEPARTMENT_GATED") {
    return TaskProjectRole.VIEWER;
  }
  return null;
}

export async function assertProjectCapability(
  db: Db,
  user: NonNullable<express.Request["user"]>,
  boardId: string,
  capability: ProjectCapability,
) {
  const board = await db.taskBoard.findUnique({
    where: { boardId },
    select: {
      boardId: true,
      createdByUserId: true,
      leadEmployeeId: true,
      accessType: true,
      members: { select: { employeeId: true, role: true } },
    },
  });
  if (!board) throw new HttpError(404, "Project was not found");

  const role = await resolveProjectRole(db, user, board);
  if (!role || !roleHasCapability(role, capability)) {
    throw new HttpError(403, "You do not have permission for this project action");
  }
  return { board, role };
}

export function memberRoleInput(
  role: string | undefined,
): TaskProjectRole {
  if (
    role === TaskProjectRole.PROJECT_ADMIN ||
    role === TaskProjectRole.PROJECT_LEAD ||
    role === TaskProjectRole.MEMBER ||
    role === TaskProjectRole.VIEWER
  ) {
    return role;
  }
  return TaskProjectRole.MEMBER;
}
