import {
  Prisma,
  TaskPriority,
  TaskRelationType,
  TaskStatus,
} from "@prisma/client";
import type express from "express";
import { todayIstDate } from "./attendanceDayRules.js";
import type { TaskFilterConfig, TaskSortConfig } from "./taskFilterSchema.js";
import { boardAccessWhere } from "./taskBoardAccess.js";

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function istDayStart(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000+05:30`);
}

function istDayEndExclusive(isoDate: string) {
  const d = istDayStart(isoDate);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export async function accessibleBoardFilter(
  user: NonNullable<express.Request["user"]>,
  boardIds?: string[],
): Promise<Prisma.WorkTaskWhereInput> {
  const access = await boardAccessWhere(user);
  const boardClause: Prisma.WorkTaskWhereInput = {
    OR: [{ boardId: null }, { board: { is: access } }],
  };
  if (boardIds?.length) {
    return {
      AND: [
        boardClause,
        {
          boardId: { in: boardIds },
          board: { is: access },
        },
      ],
    };
  }
  return boardClause;
}

export function buildSearchTextClause(text: string): Prisma.WorkTaskWhereInput {
  const q = text.trim().slice(0, 120);
  if (!q) return {};
  const upper = q.toUpperCase();
  return {
    OR: [
      { issueKey: { equals: upper } },
      { issueKey: { startsWith: upper } },
      { title: { contains: q } },
      { description: { contains: q } },
      { reporter: { name: { contains: q } } },
      { assignments: { some: { employee: { name: { contains: q } } } } },
      {
        parentTask: {
          OR: [{ title: { contains: q } }, { issueKey: { contains: upper } }],
        },
      },
      { componentLinks: { some: { component: { name: { contains: q } } } } },
      { labelLinks: { some: { label: { name: { contains: q } } } } },
    ],
  };
}

export async function buildTaskFilterWhere(
  user: NonNullable<express.Request["user"]>,
  config: TaskFilterConfig,
  options?: { boardId?: string; mineEmployeeId?: string | null },
): Promise<Prisma.WorkTaskWhereInput> {
  const and: Prisma.WorkTaskWhereInput[] = [];

  const boardScope = options?.boardId
    ? { boardId: options.boardId, board: { is: await boardAccessWhere(user) } }
    : await accessibleBoardFilter(user, config.boardIds);

  and.push(boardScope);

  if (!config.includeArchived) {
    and.push({ archivedAt: null });
  }

  if (config.issueTypes?.length) {
    and.push({ issueType: { in: config.issueTypes } });
  }
  if (config.workflowStatusIds?.length) {
    and.push({ workflowStatusId: { in: config.workflowStatusIds } });
  }
  if (config.statusCategories?.length) {
    and.push({
      OR: [
        { workflowStatus: { category: { in: config.statusCategories } } },
        { stage: { statusCategory: { in: config.statusCategories } } },
      ],
    });
  }
  if (config.statuses?.length) {
    and.push({ status: { in: config.statuses } });
  }
  if (config.priorities?.length) {
    and.push({ priority: { in: config.priorities } });
  }
  if (config.assigneeEmployeeIds?.length) {
    and.push({
      assignments: { some: { employeeId: { in: config.assigneeEmployeeIds } } },
    });
  }
  if (config.reporterUserIds?.length) {
    and.push({ reporterUserId: { in: config.reporterUserIds } });
  }
  if (config.epicId !== undefined) {
    if (config.epicId === null) {
      and.push({
        OR: [
          { parentTaskId: null },
          { parentTask: { issueType: { not: "EPIC" } } },
        ],
      });
    } else {
      and.push({ parentTaskId: config.epicId });
    }
  }
  if (config.componentIds?.length) {
    and.push({
      componentLinks: { some: { componentId: { in: config.componentIds } } },
    });
  }
  if (config.labelIds?.length) {
    and.push({ labelLinks: { some: { labelId: { in: config.labelIds } } } });
  }
  if (config.sprintId !== undefined) {
    if (config.sprintId === null) {
      and.push({
        sprintMemberships: { none: { removedAt: null } },
      });
    } else {
      and.push({
        sprintMemberships: {
          some: { sprintId: config.sprintId, removedAt: null },
        },
      });
    }
  }

  const today = todayIstDate();
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const next7 = new Date(today);
  next7.setUTCDate(next7.getUTCDate() + 7);

  if (config.dueMode === "overdue") {
    and.push({
      dueDate: { lt: today },
      status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
    });
  } else if (config.dueMode === "today") {
    and.push({ dueDate: { gte: today, lt: tomorrow } });
  } else if (config.dueMode === "next7") {
    and.push({ dueDate: { gte: today, lt: next7 } });
  } else if (config.dueMode === "none") {
    and.push({ dueDate: null });
  } else if (config.dueMode === "custom") {
    const range: Prisma.DateTimeNullableFilter = {};
    if (config.dueFrom) range.gte = istDayStart(config.dueFrom);
    if (config.dueTo) range.lt = istDayEndExclusive(config.dueTo);
    if (Object.keys(range).length) and.push({ dueDate: range });
  }

  if (config.createdFrom || config.createdTo) {
    const range: Prisma.DateTimeFilter = {};
    if (config.createdFrom) range.gte = istDayStart(config.createdFrom);
    if (config.createdTo) range.lt = istDayEndExclusive(config.createdTo);
    and.push({ createdAt: range });
  }
  if (config.updatedFrom || config.updatedTo) {
    const range: Prisma.DateTimeFilter = {};
    if (config.updatedFrom) range.gte = istDayStart(config.updatedFrom);
    if (config.updatedTo) range.lt = istDayEndExclusive(config.updatedTo);
    and.push({ updatedAt: range });
  }

  if (config.watchingMe) {
    and.push({ watchers: { some: { userId: user.id } } });
  }
  if (config.blocked === true) {
    and.push({
      incomingRelations: { some: { relationType: TaskRelationType.BLOCKS } },
    });
  } else if (config.blocked === false) {
    and.push({
      incomingRelations: { none: { relationType: TaskRelationType.BLOCKS } },
    });
  }

  if (config.searchText?.trim()) {
    and.push(buildSearchTextClause(config.searchText));
  }

  if (options?.mineEmployeeId) {
    and.push({
      assignments: { some: { employeeId: options.mineEmployeeId } },
    });
  }

  return { AND: and };
}

export function buildTaskOrderBy(
  sort: TaskSortConfig,
  boardScoped: boolean,
): Prisma.WorkTaskOrderByWithRelationInput[] {
  const dir = sort.direction;
  const tie: Prisma.WorkTaskOrderByWithRelationInput[] = [
    { taskId: "asc" },
  ];
  switch (sort.field) {
    case "issueKey":
      return [{ issueKey: dir }, ...tie];
    case "createdAt":
      return [{ createdAt: dir }, ...tie];
    case "updatedAt":
      return [{ updatedAt: dir }, ...tie];
    case "dueDate":
      return [{ dueDate: dir }, { updatedAt: "desc" }, ...tie];
    case "title":
      return [{ title: dir }, ...tie];
    case "status":
      return [{ workflowStatus: { name: dir } }, { status: dir }, ...tie];
    case "priority":
      return boardScoped
        ? [{ priority: dir }, { rank: "asc" }, ...tie]
        : [{ priority: dir }, ...tie];
    default:
      return [{ updatedAt: "desc" }, ...tie];
  }
}

export function compareTasksBySort(
  a: { priority: TaskPriority; issueKey?: string | null; title: string; dueDate?: Date | null; updatedAt: Date; createdAt: Date; status: TaskStatus; workflowStatus?: { name: string } | null },
  b: typeof a,
  sort: TaskSortConfig,
): number {
  const dir = sort.direction === "asc" ? 1 : -1;
  const cmp = (x: number, y: number) => (x === y ? 0 : x < y ? -dir : dir);
  switch (sort.field) {
    case "issueKey":
      return dir * String(a.issueKey ?? "").localeCompare(String(b.issueKey ?? ""));
    case "title":
      return dir * a.title.localeCompare(b.title);
    case "dueDate": {
      const ad = a.dueDate?.getTime() ?? (sort.direction === "asc" ? Infinity : -Infinity);
      const bd = b.dueDate?.getTime() ?? (sort.direction === "asc" ? Infinity : -Infinity);
      return cmp(ad, bd);
    }
    case "createdAt":
      return cmp(a.createdAt.getTime(), b.createdAt.getTime());
    case "updatedAt":
      return cmp(a.updatedAt.getTime(), b.updatedAt.getTime());
    case "status": {
      const an = a.workflowStatus?.name ?? a.status;
      const bn = b.workflowStatus?.name ?? b.status;
      return dir * an.localeCompare(bn);
    }
    case "priority":
      return cmp(PRIORITY_ORDER[a.priority], PRIORITY_ORDER[b.priority]);
    default:
      return cmp(a.updatedAt.getTime(), b.updatedAt.getTime());
  }
}

export function scoreSearchMatch(
  query: string,
  row: {
    issueKey?: string | null;
    title: string;
    description?: string | null;
    boardKeyPrefix?: string | null;
    assigneeNames?: string[];
    reporterName?: string | null;
    epicKey?: string | null;
    epicTitle?: string | null;
    componentNames?: string[];
    labelNames?: string[];
  },
): number {
  const q = query.trim();
  if (!q) return 0;
  const upper = q.toUpperCase();
  const key = (row.issueKey ?? "").toUpperCase();
  if (key === upper) return 1000;
  if (key.startsWith(upper)) return 800;
  const titleLower = row.title.toLowerCase();
  const qLower = q.toLowerCase();
  if (titleLower === qLower) return 600;
  if (titleLower.startsWith(qLower)) return 400;
  if (titleLower.includes(qLower)) return 200;
  if (row.description?.toLowerCase().includes(qLower)) return 120;
  if (row.epicKey?.toUpperCase().includes(upper)) return 100;
  if (row.epicTitle?.toLowerCase().includes(qLower)) return 90;
  if (row.componentNames?.some((n) => n.toLowerCase().includes(qLower))) return 80;
  if (row.labelNames?.some((n) => n.toLowerCase().includes(qLower))) return 80;
  if (row.assigneeNames?.some((n) => n.toLowerCase().includes(qLower))) return 70;
  if (row.reporterName?.toLowerCase().includes(qLower)) return 70;
  return 0;
}
