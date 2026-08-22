import type { PrismaClient } from "@prisma/client";
import { TaskIssueType, TaskPriority, TaskStatus } from "@prisma/client";
import type express from "express";
import { assertBoardAccess } from "./taskBoardAccess.js";
import { sprintSummaryForTask } from "./taskSprintEngine.js";
import {
  buildTaskFilterWhere,
  buildTaskOrderBy,
  compareTasksBySort,
  scoreSearchMatch,
} from "./taskFilterEngine.js";
import type { TaskFilterConfig, TaskSortConfig } from "./taskFilterSchema.js";
import { defaultSortConfig, parseFilterConfig } from "./taskFilterSchema.js";

const searchInclude = {
  assignments: {
    include: {
      employee: { select: { employeeId: true, name: true } },
    },
    orderBy: { assignedAt: "asc" as const },
  },
  reporter: { select: { id: true, name: true } },
  board: { select: { boardId: true, name: true, keyPrefix: true } },
  workflowStatus: {
    select: { statusId: true, name: true, category: true, color: true },
  },
  stage: { select: { statusCategory: true } },
  parentTask: {
    select: { taskId: true, issueKey: true, title: true, issueType: true },
  },
  componentLinks: { include: { component: { select: { componentId: true, name: true } } } },
  labelLinks: { include: { label: { select: { labelId: true, name: true } } } },
} as const;

type SearchRow = {
  taskId: string;
  issueKey: string | null;
  title: string;
  description: string | null;
  issueType: TaskIssueType;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  updatedAt: Date;
  createdAt: Date;
  assignments: Array<{ employee: { employeeId: string; name: string } }>;
  reporter: { id: string; name: string } | null;
  board: { boardId: string; name: string; keyPrefix: string | null } | null;
  workflowStatus: {
    statusId: string;
    name: string;
    category: string;
    color: string;
  } | null;
  stage: { statusCategory: string } | null;
  parentTask: {
    taskId: string;
    issueKey: string | null;
    title: string;
    issueType: TaskIssueType;
  } | null;
  componentLinks: Array<{ component: { componentId: string; name: string } }>;
  labelLinks: Array<{ label: { labelId: string; name: string } }>;
};

export type TaskSearchResult = {
  workItemId: string;
  issueKey?: string;
  title: string;
  workType: TaskIssueType;
  project?: { id: string; name: string; keyPrefix?: string };
  status: string;
  statusCategory?: string;
  priority: string;
  assignees: Array<{ id: string; name: string }>;
  reporter?: { id: string; name: string };
  epic?: { id: string; issueKey?: string; title: string };
  components: Array<{ id: string; name: string }>;
  labels: Array<{ id: string; name: string }>;
  dueDate?: string;
  sprint?: {
    sprintId: string;
    name: string;
    status: string;
    inherited?: boolean;
  };
};

function epicFromRow(row: SearchRow) {
  if (row.parentTask?.issueType === TaskIssueType.EPIC) {
    return {
      id: row.parentTask.taskId,
      issueKey: row.parentTask.issueKey ?? undefined,
      title: row.parentTask.title,
    };
  }
  return undefined;
}

function rowToSearchResult(row: SearchRow, sprint?: TaskSearchResult["sprint"]): TaskSearchResult {
  return {
    workItemId: row.taskId,
    issueKey: row.issueKey ?? undefined,
    title: row.title,
    workType: row.issueType,
    project: row.board
      ? {
          id: row.board.boardId,
          name: row.board.name,
          keyPrefix: row.board.keyPrefix ?? undefined,
        }
      : undefined,
    status: row.workflowStatus?.name ?? row.status,
    statusCategory: row.workflowStatus?.category ?? row.stage?.statusCategory,
    priority: row.priority,
    assignees: row.assignments.map((a) => ({
      id: a.employee.employeeId,
      name: a.employee.name,
    })),
    reporter: row.reporter
      ? { id: row.reporter.id, name: row.reporter.name }
      : undefined,
    epic: epicFromRow(row),
    components: row.componentLinks.map((link) => ({
      id: link.component.componentId,
      name: link.component.name,
    })),
    labels: row.labelLinks.map((link) => ({
      id: link.label.labelId,
      name: link.label.name,
    })),
    dueDate: row.dueDate?.toISOString().slice(0, 10),
    sprint,
  };
}

function scoringFields(row: SearchRow) {
  const epic = epicFromRow(row);
  return {
    issueKey: row.issueKey,
    title: row.title,
    description: row.description,
    assigneeNames: row.assignments.map((a) => a.employee.name),
    reporterName: row.reporter?.name ?? null,
    epicKey: epic?.issueKey ?? null,
    epicTitle: epic?.title ?? null,
    componentNames: row.componentLinks.map((l) => l.component.name),
    labelNames: row.labelLinks.map((l) => l.label.name),
  };
}

export async function searchWorkItems(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  params: {
    query: string;
    boardId?: string;
    limit: number;
    offset: number;
  },
): Promise<{ results: TaskSearchResult[]; total: number }> {
  const query = params.query.trim().slice(0, 120);
  if (!query) {
    return { results: [], total: 0 };
  }

  if (params.boardId) {
    await assertBoardAccess(user, params.boardId);
  }

  const where = await buildTaskFilterWhere(
    user,
    parseFilterConfig({ searchText: query, includeArchived: false }),
    { boardId: params.boardId },
  );

  const total = await db.workTask.count({ where });

  const fetchCap = Math.min(Math.max(params.offset + params.limit, params.limit), 500);
  const rows = (await db.workTask.findMany({
    where,
    include: searchInclude,
    take: fetchCap,
    orderBy: [{ updatedAt: "desc" }, { taskId: "asc" }],
  })) as SearchRow[];

  const scored = rows
    .map((row) => ({
      row,
      score: scoreSearchMatch(query, scoringFields(row)),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compareTasksBySort(a.row, b.row, defaultSortConfig);
    });

  const page = scored.slice(params.offset, params.offset + params.limit);
  const results: TaskSearchResult[] = [];
  for (const entry of page) {
    const sprint = await sprintSummaryForTask(db, entry.row.taskId);
    results.push(rowToSearchResult(entry.row, sprint ?? undefined));
  }

  return { results, total: scored.length || total };
}

export async function queryFilteredWorkItems(
  db: PrismaClient,
  user: NonNullable<express.Request["user"]>,
  params: {
    filter: TaskFilterConfig;
    sort?: TaskSortConfig;
    boardId?: string;
    limit: number;
    offset: number;
  },
): Promise<{ results: TaskSearchResult[]; total: number }> {
  const sort = params.sort ?? defaultSortConfig;
  if (params.boardId) {
    await assertBoardAccess(user, params.boardId);
  }

  const where = await buildTaskFilterWhere(user, params.filter, {
    boardId: params.boardId,
  });

  const total = await db.workTask.count({ where });
  const boardScoped = Boolean(params.boardId ?? params.filter.boardIds?.length === 1);

  const rows = (await db.workTask.findMany({
    where,
    include: searchInclude,
    orderBy: buildTaskOrderBy(sort, boardScoped),
    skip: params.offset,
    take: params.limit,
  })) as SearchRow[];

  const results: TaskSearchResult[] = [];
  for (const row of rows) {
    const sprint = await sprintSummaryForTask(db, row.taskId);
    results.push(rowToSearchResult(row, sprint ?? undefined));
  }

  return { results, total };
}
