import {
  TaskIssueType,
  TaskPriority,
  TaskStatus,
  TaskStatusCategory,
} from "@prisma/client";
import { z } from "zod";

export const FILTER_CONFIG_VERSION = 1;

export const taskFilterConfigSchema = z.object({
  v: z.number().int().min(1).max(1).default(FILTER_CONFIG_VERSION),
  searchText: z.string().max(120).optional(),
  boardIds: z.array(z.string().min(1)).max(20).optional(),
  issueTypes: z.array(z.nativeEnum(TaskIssueType)).optional(),
  workflowStatusIds: z.array(z.string().min(1)).optional(),
  statusCategories: z.array(z.nativeEnum(TaskStatusCategory)).optional(),
  statuses: z.array(z.nativeEnum(TaskStatus)).optional(),
  priorities: z.array(z.nativeEnum(TaskPriority)).optional(),
  assigneeEmployeeIds: z.array(z.string().min(1)).optional(),
  reporterUserIds: z.array(z.string().min(1)).optional(),
  /** Specific epic id, or null for "no epic". */
  epicId: z.string().min(1).nullable().optional(),
  componentIds: z.array(z.string().min(1)).optional(),
  labelIds: z.array(z.string().min(1)).optional(),
  /** Specific sprint id, or null for backlog/no sprint. */
  sprintId: z.string().min(1).nullable().optional(),
  dueMode: z.enum(["overdue", "today", "next7", "none", "custom"]).optional(),
  dueFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  updatedFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  updatedTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  watchingMe: z.boolean().optional(),
  blocked: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
});

export type TaskFilterConfig = z.infer<typeof taskFilterConfigSchema>;

export const taskSortConfigSchema = z.object({
  field: z.enum([
    "issueKey",
    "createdAt",
    "updatedAt",
    "priority",
    "dueDate",
    "status",
    "title",
  ]),
  direction: z.enum(["asc", "desc"]),
});

export type TaskSortConfig = z.infer<typeof taskSortConfigSchema>;

export const taskColumnConfigSchema = z.object({
  visible: z.array(
    z.enum([
      "issueKey",
      "issueType",
      "title",
      "status",
      "priority",
      "assignees",
      "reporter",
      "epic",
      "sprint",
      "components",
      "labels",
      "dueDate",
      "updatedAt",
    ]),
  ),
});

export type TaskColumnConfig = z.infer<typeof taskColumnConfigSchema>;

export const defaultSortConfig: TaskSortConfig = {
  field: "updatedAt",
  direction: "desc",
};

export const defaultColumnConfig: TaskColumnConfig = {
  visible: [
    "issueKey",
    "issueType",
    "title",
    "status",
    "priority",
    "assignees",
    "dueDate",
    "updatedAt",
  ],
};

export function parseFilterConfig(input: unknown): TaskFilterConfig {
  return taskFilterConfigSchema.parse(input ?? {});
}

export function parseSortConfig(input: unknown): TaskSortConfig {
  return taskSortConfigSchema.parse(input ?? defaultSortConfig);
}

export function parseColumnConfig(input: unknown): TaskColumnConfig {
  return taskColumnConfigSchema.parse(input ?? defaultColumnConfig);
}
