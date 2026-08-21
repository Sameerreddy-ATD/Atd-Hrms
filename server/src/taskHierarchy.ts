/**
 * Work-item hierarchy rules for Task Planner foundation.
 * Backend authoritative — do not rely on the UI alone.
 *
 * Canonical:
 *   EPIC → STORY | TASK | BUG | IMPROVEMENT → SUBTASK
 */
import {
  TaskIssueType,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { HttpError } from "./errors.js";

export const NORMAL_WORK_TYPES: TaskIssueType[] = [
  TaskIssueType.STORY,
  TaskIssueType.TASK,
  TaskIssueType.BUG,
  TaskIssueType.IMPROVEMENT,
];

export function statusCategoryFromTaskStatus(
  status: string,
  isCompleted = false,
): "TODO" | "IN_PROGRESS" | "DONE" {
  if (isCompleted || status === "COMPLETED" || status === "CANCELLED") return "DONE";
  if (status === "IN_PROGRESS" || status === "BLOCKED" || status === "REVIEW") {
    return "IN_PROGRESS";
  }
  return "TODO";
}

type Db = PrismaClient | Prisma.TransactionClient;

export async function assertWorkItemHierarchy(input: {
  db: Db;
  issueType: TaskIssueType;
  parentTaskId: string | null | undefined;
  boardId: string | null;
  taskId: string | null;
  /** When updating type without changing parent, load existing parent. */
  existingParentTaskId?: string | null;
}) {
  const parentId =
    input.parentTaskId === undefined
      ? (input.existingParentTaskId ?? null)
      : input.parentTaskId;

  if (input.taskId && parentId && parentId === input.taskId) {
    throw new HttpError(400, "A work item cannot be its own parent");
  }

  if (input.issueType === TaskIssueType.SUBTASK) {
    if (!parentId) {
      throw new HttpError(400, "A subtask requires a parent work item");
    }
  }

  if (input.issueType === TaskIssueType.EPIC && parentId) {
    throw new HttpError(400, "An epic cannot be a child of another work item");
  }

  if (!parentId) return;

  const parent = await input.db.workTask.findUnique({
    where: { taskId: parentId },
    select: {
      taskId: true,
      boardId: true,
      parentTaskId: true,
      issueType: true,
      archivedAt: true,
    },
  });
  if (!parent || parent.archivedAt) {
    throw new HttpError(400, "Parent work item was not found");
  }
  if (input.boardId && parent.boardId && parent.boardId !== input.boardId) {
    throw new HttpError(400, "Subtasks must stay on the same project as their parent");
  }

  if (parent.issueType === TaskIssueType.SUBTASK) {
    throw new HttpError(400, "A subtask cannot be the parent of another work item");
  }

  if (input.issueType === TaskIssueType.SUBTASK) {
    if (parent.issueType === TaskIssueType.EPIC) {
      throw new HttpError(
        400,
        "Create a story, task, bug, or improvement under the epic before adding a subtask",
      );
    }
    if (!NORMAL_WORK_TYPES.includes(parent.issueType)) {
      throw new HttpError(400, "Subtasks must belong to a story, task, bug, or improvement");
    }
  }

  if (input.issueType === TaskIssueType.EPIC) {
    throw new HttpError(400, "An epic cannot be a child of another work item");
  }

  if (
    NORMAL_WORK_TYPES.includes(input.issueType) &&
    parent.issueType !== TaskIssueType.EPIC &&
    input.parentTaskId !== undefined
  ) {
    throw new HttpError(
      400,
      "Stories, tasks, bugs, and improvements may only nest under an epic (or stand alone)",
    );
  }

  // Cycle prevention
  let cursor: string | null = parent.parentTaskId;
  let hops = 0;
  while (cursor) {
    if (input.taskId && cursor === input.taskId) {
      throw new HttpError(400, "That parent would create a cycle");
    }
    if (hops >= 20) {
      throw new HttpError(400, "Parent chain is too deep");
    }
    const ancestor = await input.db.workTask.findUnique({
      where: { taskId: cursor },
      select: { parentTaskId: true },
    });
    cursor = ancestor?.parentTaskId ?? null;
    hops += 1;
  }
}
