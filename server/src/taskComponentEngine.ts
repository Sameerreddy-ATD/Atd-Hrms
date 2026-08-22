import {
  TaskActivityType,
  TaskIssueType,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type express from "express";
import { HttpError } from "./errors.js";
import { assertProjectCapability } from "./taskProjectRoles.js";

type Db = PrismaClient | Prisma.TransactionClient;

const componentInclude = {
  leadEmployee: {
    select: {
      employeeId: true,
      name: true,
      employeeCode: true,
      designation: true,
    },
  },
} as const;

export function componentDto(component: {
  componentId: string;
  boardId: string;
  name: string;
  description: string | null;
  leadEmployeeId: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  leadEmployee?: {
    employeeId: string;
    name: string;
    employeeCode: string;
    designation: string | null;
  } | null;
}) {
  return {
    id: component.componentId,
    boardId: component.boardId,
    name: component.name,
    description: component.description ?? undefined,
    leadEmployeeId: component.leadEmployeeId ?? undefined,
    lead: component.leadEmployee
      ? {
          id: component.leadEmployee.employeeId,
          name: component.leadEmployee.name,
          employeeCode: component.leadEmployee.employeeCode,
          designation: component.leadEmployee.designation ?? undefined,
        }
      : undefined,
    active: component.active,
    sortOrder: component.sortOrder,
    createdAt: component.createdAt.toISOString(),
    updatedAt: component.updatedAt.toISOString(),
  };
}

export function componentsFromTaskLinks(
  links: Array<{
    component: {
      componentId: string;
      boardId: string;
      name: string;
      description: string | null;
      leadEmployeeId: string | null;
      active: boolean;
      sortOrder: number;
      createdAt: Date;
      updatedAt: Date;
      leadEmployee?: {
        employeeId: string;
        name: string;
        employeeCode: string;
        designation: string | null;
      } | null;
    };
  }>,
) {
  return links.map((link) => componentDto(link.component));
}

export async function listProjectComponents(db: Db, boardId: string, includeInactive = true) {
  return db.taskComponent.findMany({
    where: {
      boardId,
      ...(includeInactive ? {} : { active: true }),
    },
    include: componentInclude,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createProjectComponent(
  db: Db,
  user: NonNullable<express.Request["user"]>,
  boardId: string,
  input: {
    name: string;
    description?: string | null;
    leadEmployeeId?: string | null;
    sortOrder?: number;
  },
) {
  await assertProjectCapability(db, user, boardId, "MANAGE_COMPONENTS");
  const name = input.name.trim();
  if (!name) throw new HttpError(400, "Component name is required");

  const existing = await db.taskComponent.findFirst({
    where: { boardId, name },
    select: { componentId: true },
  });
  if (existing) throw new HttpError(409, "A component with that name already exists in this project");

  if (input.leadEmployeeId) {
    const lead = await db.employee.findFirst({
      where: { employeeId: input.leadEmployeeId, status: "ACTIVE" },
      select: { employeeId: true },
    });
    if (!lead) throw new HttpError(400, "Component lead was not found");
  }

  const maxSort = await db.taskComponent.aggregate({
    where: { boardId },
    _max: { sortOrder: true },
  });

  const created = await db.taskComponent.create({
    data: {
      boardId,
      name,
      description: input.description?.trim() || null,
      leadEmployeeId: input.leadEmployeeId ?? null,
      sortOrder: input.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1000,
      active: true,
    },
    include: componentInclude,
  });
  return componentDto(created);
}

export async function updateProjectComponent(
  db: Db,
  user: NonNullable<express.Request["user"]>,
  componentId: string,
  input: {
    name?: string;
    description?: string | null;
    leadEmployeeId?: string | null;
    active?: boolean;
    sortOrder?: number;
  },
) {
  const existing = await db.taskComponent.findUnique({
    where: { componentId },
    select: { componentId: true, boardId: true, name: true },
  });
  if (!existing) throw new HttpError(404, "Component was not found");

  await assertProjectCapability(db, user, existing.boardId, "MANAGE_COMPONENTS");

  if (input.name && input.name.trim() !== existing.name) {
    const duplicate = await db.taskComponent.findFirst({
      where: {
        boardId: existing.boardId,
        name: input.name.trim(),
        componentId: { not: componentId },
      },
      select: { componentId: true },
    });
    if (duplicate) throw new HttpError(409, "A component with that name already exists in this project");
  }

  if (input.leadEmployeeId) {
    const lead = await db.employee.findFirst({
      where: { employeeId: input.leadEmployeeId, status: "ACTIVE" },
      select: { employeeId: true },
    });
    if (!lead) throw new HttpError(400, "Component lead was not found");
  }

  const updated = await db.taskComponent.update({
    where: { componentId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.leadEmployeeId !== undefined ? { leadEmployeeId: input.leadEmployeeId } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    include: componentInclude,
  });
  return componentDto(updated);
}

export async function reorderProjectComponents(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  boardId: string,
  orderedIds: string[],
) {
  await assertProjectCapability(db, user, boardId, "MANAGE_COMPONENTS");
  const components = await db.taskComponent.findMany({
    where: { boardId },
    select: { componentId: true },
  });
  const valid = new Set(components.map((c) => c.componentId));
  if (orderedIds.some((id) => !valid.has(id))) {
    throw new HttpError(400, "Component order includes unknown ids");
  }
  await db.$transaction(
    orderedIds.map((componentId, index) =>
      db.taskComponent.update({
        where: { componentId },
        data: { sortOrder: (index + 1) * 1000 },
      }),
    ),
  );
}

export async function setTaskComponentsInTx(
  tx: Prisma.TransactionClient,
  input: {
    taskId: string;
    boardId: string;
    componentIds: string[];
    actorUserId: string;
  },
) {
  const uniqueIds = [...new Set(input.componentIds)];
  const components = await tx.taskComponent.findMany({
    where: { componentId: { in: uniqueIds }, boardId: input.boardId },
    select: { componentId: true, name: true, active: true },
  });
  if (components.length !== uniqueIds.length) {
    throw new HttpError(400, "One or more components were not found on this project");
  }
  const inactive = components.filter((c) => !c.active);
  if (inactive.length > 0) {
    throw new HttpError(
      400,
      `Inactive components cannot be assigned: ${inactive.map((c) => c.name).join(", ")}`,
    );
  }

  const existing = await tx.workTaskComponent.findMany({
    where: { taskId: input.taskId },
    include: { component: { select: { componentId: true, name: true } } },
  });
  const existingIds = new Set(existing.map((row) => row.componentId));
  const nextIds = new Set(uniqueIds);

  const toAdd = uniqueIds.filter((id) => !existingIds.has(id));
  const toRemove = existing.filter((row) => !nextIds.has(row.componentId));

  if (toAdd.length === 0 && toRemove.length === 0) return;

  for (const componentId of toAdd) {
    await tx.workTaskComponent.create({
      data: { taskId: input.taskId, componentId },
    });
    const name = components.find((c) => c.componentId === componentId)?.name ?? componentId;
    await tx.taskUpdate.create({
      data: {
        taskId: input.taskId,
        authorUserId: input.actorUserId,
        activityType: TaskActivityType.COMPONENT_ASSIGNED,
        message: `Component assigned: ${name}`,
        metadata: { componentId, componentName: name },
      },
    });
  }

  for (const row of toRemove) {
    await tx.workTaskComponent.delete({
      where: {
        taskId_componentId: { taskId: input.taskId, componentId: row.componentId },
      },
    });
    await tx.taskUpdate.create({
      data: {
        taskId: input.taskId,
        authorUserId: input.actorUserId,
        activityType: TaskActivityType.COMPONENT_REMOVED,
        message: `Component removed: ${row.component.name}`,
        metadata: { componentId: row.componentId, componentName: row.component.name },
      },
    });
  }

  await tx.workTask.update({
    where: { taskId: input.taskId },
    data: { lastActivityAt: new Date() },
  });
}

export async function recordEpicChildActivity(
  tx: Prisma.TransactionClient,
  input: {
    epicTaskId: string;
    childTaskId: string;
    childIssueKey: string | null;
    childTitle: string;
    actorUserId: string;
    added: boolean;
  },
) {
  await tx.taskUpdate.create({
    data: {
      taskId: input.epicTaskId,
      authorUserId: input.actorUserId,
      activityType: input.added
        ? TaskActivityType.EPIC_CHILD_ADDED
        : TaskActivityType.EPIC_CHILD_REMOVED,
      message: input.added
        ? `Child work added: ${input.childIssueKey ?? input.childTitle}`
        : `Child work removed: ${input.childIssueKey ?? input.childTitle}`,
      metadata: {
        childTaskId: input.childTaskId,
        childIssueKey: input.childIssueKey,
        childTitle: input.childTitle,
      },
    },
  });
  await tx.workTask.update({
    where: { taskId: input.epicTaskId },
    data: { lastActivityAt: new Date() },
  });
}

export async function recordEpicDatesChanged(
  tx: Prisma.TransactionClient,
  input: {
    epicTaskId: string;
    actorUserId: string;
    before: { startDate: Date | null; dueDate: Date | null };
    after: { startDate: Date | null; dueDate: Date | null };
  },
) {
  const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  if (
    fmt(input.before.startDate) === fmt(input.after.startDate) &&
    fmt(input.before.dueDate) === fmt(input.after.dueDate)
  ) {
    return;
  }
  await tx.taskUpdate.create({
    data: {
      taskId: input.epicTaskId,
      authorUserId: input.actorUserId,
      activityType: TaskActivityType.EPIC_DATES_CHANGED,
      message: "Epic dates updated",
      metadata: {
        before: {
          startDate: fmt(input.before.startDate),
          targetDate: fmt(input.before.dueDate),
        },
        after: {
          startDate: fmt(input.after.startDate),
          targetDate: fmt(input.after.dueDate),
        },
      },
    },
  });
}

export function assertEpicDateRange(startDate: Date | null | undefined, dueDate: Date | null | undefined) {
  if (startDate && dueDate && dueDate < startDate) {
    throw new HttpError(400, "Target date cannot be before the start date");
  }
}

export async function assertComponentsIndependentOfPlanning(task: {
  issueType: TaskIssueType;
}) {
  if (task.issueType === TaskIssueType.EPIC) return;
  return;
}
