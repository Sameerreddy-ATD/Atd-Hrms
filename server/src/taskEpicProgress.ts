/**
 * Epic progress from direct child work items using Workflow Status Category.
 *
 * Rules:
 * - Only direct children with issue types STORY | TASK | BUG | IMPROVEMENT count.
 * - SUBTASK never counts toward epic progress (must nest under a normal item).
 * - Archived children are excluded (active roadmap/epic semantics).
 * - DONE category = completed child; TODO and IN_PROGRESS = incomplete.
 * - progressPercent = round(done / total * 100), or 0% when total is 0.
 */
import { TaskIssueType, TaskStatusCategory, type Prisma, type PrismaClient } from "@prisma/client";
import { HttpError } from "./errors.js";
import { NORMAL_WORK_TYPES } from "./taskHierarchy.js";

type Db = PrismaClient | Prisma.TransactionClient;

export type EpicProgress = {
  progressPercent: number;
  doneCount: number;
  totalCount: number;
};

export async function computeEpicProgress(db: Db, epicTaskId: string): Promise<EpicProgress> {
  const epic = await db.workTask.findUnique({
    where: { taskId: epicTaskId },
    select: { issueType: true, archivedAt: true },
  });
  if (!epic) throw new HttpError(404, "Work item was not found");
  if (epic.issueType !== TaskIssueType.EPIC) {
    throw new HttpError(400, "Progress is only defined for epics");
  }

  const children = await db.workTask.findMany({
    where: {
      parentTaskId: epicTaskId,
      archivedAt: null,
      issueType: { in: NORMAL_WORK_TYPES },
    },
    select: {
      workflowStatus: { select: { category: true } },
    },
  });

  const totalCount = children.length;
  const doneCount = children.filter(
    (child) => child.workflowStatus?.category === TaskStatusCategory.DONE,
  ).length;
  const progressPercent =
    totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  return { progressPercent, doneCount, totalCount };
}

export async function computeEpicProgressBatch(
  db: Db,
  epicTaskIds: string[],
): Promise<Map<string, EpicProgress>> {
  if (epicTaskIds.length === 0) return new Map();

  const children = await db.workTask.findMany({
    where: {
      parentTaskId: { in: epicTaskIds },
      archivedAt: null,
      issueType: { in: NORMAL_WORK_TYPES },
    },
    select: {
      parentTaskId: true,
      workflowStatus: { select: { category: true } },
    },
  });

  const byEpic = new Map<string, { done: number; total: number }>();
  for (const epicId of epicTaskIds) {
    byEpic.set(epicId, { done: 0, total: 0 });
  }
  for (const child of children) {
    if (!child.parentTaskId) continue;
    const bucket = byEpic.get(child.parentTaskId);
    if (!bucket) continue;
    bucket.total += 1;
    if (child.workflowStatus?.category === TaskStatusCategory.DONE) bucket.done += 1;
  }

  const result = new Map<string, EpicProgress>();
  for (const [epicId, { done, total }] of byEpic) {
    result.set(epicId, {
      progressPercent: total === 0 ? 0 : Math.round((done / total) * 100),
      doneCount: done,
      totalCount: total,
    });
  }
  return result;
}
