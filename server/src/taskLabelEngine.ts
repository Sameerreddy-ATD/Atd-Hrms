import {
  TaskActivityType,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type express from "express";
import { HttpError } from "./errors.js";
import { assertProjectCapability } from "./taskProjectRoles.js";
import { assertTaskEditable } from "./taskRelationEngine.js";
import { notifyWorkItemWatchers } from "./taskCollaborationNotify.js";

type Db = PrismaClient | Prisma.TransactionClient;

export function normalizeLabelName(name: string) {
  return name.trim().toLowerCase();
}

export function labelDto(label: {
  labelId: string;
  boardId: string;
  name: string;
  normalizedName: string;
  description: string | null;
  color: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: label.labelId,
    boardId: label.boardId,
    name: label.name,
    description: label.description ?? undefined,
    color: label.color ?? undefined,
    active: label.active,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  };
}

export function labelsFromTaskLinks(
  links: Array<{
    label: {
      labelId: string;
      boardId: string;
      name: string;
      normalizedName: string;
      description: string | null;
      color: string | null;
      active: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
  }>,
) {
  return links.map((link) => labelDto(link.label));
}

export async function listProjectLabels(db: Db, boardId: string, includeInactive = true) {
  return db.taskLabel.findMany({
    where: { boardId, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ name: "asc" }],
  });
}

export async function createProjectLabel(
  db: Db,
  user: NonNullable<express.Request["user"]>,
  boardId: string,
  input: { name: string; description?: string | null; color?: string | null },
) {
  await assertProjectCapability(db, user, boardId, "MANAGE_LABELS");
  const name = input.name.trim();
  if (!name) throw new HttpError(400, "Label name is required");
  const normalizedName = normalizeLabelName(name);

  const existing = await db.taskLabel.findFirst({
    where: { boardId, normalizedName },
  });
  if (existing) throw new HttpError(409, "A label with that name already exists in this project");

  const created = await db.taskLabel.create({
    data: {
      boardId,
      name,
      normalizedName,
      description: input.description?.trim() || null,
      color: input.color?.trim() || null,
      active: true,
    },
  });
  return labelDto(created);
}

export async function updateProjectLabel(
  db: Db,
  user: NonNullable<express.Request["user"]>,
  labelId: string,
  input: { name?: string; description?: string | null; color?: string | null; active?: boolean },
) {
  const label = await db.taskLabel.findUniqueOrThrow({ where: { labelId } });
  await assertProjectCapability(db, user, label.boardId, "MANAGE_LABELS");

  let name = label.name;
  let normalizedName = label.normalizedName;
  if (input.name != null) {
    name = input.name.trim();
    if (!name) throw new HttpError(400, "Label name is required");
    normalizedName = normalizeLabelName(name);
    const dup = await db.taskLabel.findFirst({
      where: { boardId: label.boardId, normalizedName, NOT: { labelId } },
    });
    if (dup) throw new HttpError(409, "A label with that name already exists in this project");
  }

  const updated = await db.taskLabel.update({
    where: { labelId },
    data: {
      ...(input.name != null ? { name, normalizedName } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.color !== undefined ? { color: input.color?.trim() || null } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
  return labelDto(updated);
}

export async function setTaskLabelsInTx(
  tx: Prisma.TransactionClient,
  input: {
    taskId: string;
    boardId: string;
    labelIds: string[];
    authorUserId: string;
  },
) {
  const task = await tx.workTask.findUniqueOrThrow({
    where: { taskId: input.taskId },
    select: { archivedAt: true },
  });
  await assertTaskEditable(task);

  const labels = await tx.taskLabel.findMany({
    where: { boardId: input.boardId, labelId: { in: input.labelIds } },
  });
  if (labels.length !== input.labelIds.length) {
    throw new HttpError(400, "One or more labels were not found in this project");
  }
  const inactive = labels.filter((l) => !l.active);
  if (inactive.length > 0) {
    throw new HttpError(409, "Inactive labels cannot be assigned to work items");
  }

  const existing = await tx.workTaskLabel.findMany({
    where: { taskId: input.taskId },
    include: { label: true },
  });
  const existingIds = new Set(existing.map((e) => e.labelId));
  const nextIds = new Set(input.labelIds);

  const toAdd = input.labelIds.filter((id) => !existingIds.has(id));
  const toRemove = existing.filter((e) => !nextIds.has(e.labelId));

  for (const labelId of toAdd) {
    await tx.workTaskLabel.create({ data: { taskId: input.taskId, labelId } });
    const label = labels.find((l) => l.labelId === labelId)!;
    await tx.taskUpdate.create({
      data: {
        taskId: input.taskId,
        authorUserId: input.authorUserId,
        activityType: TaskActivityType.LABEL_ADDED,
        message: `added label ${label.name}`,
        metadata: { labelId, labelName: label.name },
      },
    });
  }
  for (const link of toRemove) {
    await tx.workTaskLabel.delete({
      where: { taskId_labelId: { taskId: input.taskId, labelId: link.labelId } },
    });
    await tx.taskUpdate.create({
      data: {
        taskId: input.taskId,
        authorUserId: input.authorUserId,
        activityType: TaskActivityType.LABEL_REMOVED,
        message: `removed label ${link.label.name}`,
        metadata: { labelId: link.labelId, labelName: link.label.name },
      },
    });
  }

  if (toAdd.length > 0 || toRemove.length > 0) {
    await tx.workTask.update({
      where: { taskId: input.taskId },
      data: { lastActivityAt: new Date(), version: { increment: 1 } },
    });
  }
}

export async function setTaskLabels(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  taskId: string,
  labelIds: string[],
  expectedVersion: number,
) {
  const task = await db.workTask.findUniqueOrThrow({
    where: { taskId },
    select: { taskId: true, boardId: true, version: true, issueKey: true, title: true },
  });
  if (!task.boardId) throw new HttpError(400, "This work item is not on a project");
  await assertProjectCapability(db, user, task.boardId, "EDIT_WORK_ITEM");
  if (task.version !== expectedVersion) {
    throw new HttpError(409, "This work item was updated elsewhere. Refresh and try again.");
  }

  await db.$transaction((tx) =>
    setTaskLabelsInTx(tx, {
      taskId,
      boardId: task.boardId!,
      labelIds,
      authorUserId: user.id,
    }),
  );

  void notifyWorkItemWatchers(db, {
    taskId,
    actorUserId: user.id,
    kind: "labels",
    title: "Labels updated",
    body: `${user.name} updated labels on ${task.issueKey ?? task.title}`,
  }).catch(() => undefined);

  const links = await db.workTaskLabel.findMany({
    where: { taskId },
    include: { label: true },
  });
  return labelsFromTaskLinks(links);
}
