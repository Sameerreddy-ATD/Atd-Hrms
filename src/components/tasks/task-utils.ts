import { isBefore, isSameDay, parseISO, startOfToday } from "date-fns";
import type { TaskBoard, TaskPriority, TaskStage, TaskStatus, WorkTask } from "@/types/domain";
import { formatDisplayDate } from "@/lib/india-date";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  REVIEW: "In review",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  LOW: "border-slate-200 bg-slate-50 text-slate-600",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
  HIGH: "border-orange-200 bg-orange-50 text-orange-700",
  URGENT: "border-rose-200 bg-rose-50 text-rose-700",
};

export const PRIORITY_MARK: Record<
  TaskPriority,
  { label: string; className: string; glyph: string }
> = {
  URGENT: { label: "Highest", className: "text-rose-600", glyph: "⇈" },
  HIGH: { label: "High", className: "text-orange-600", glyph: "↑" },
  MEDIUM: { label: "Medium", className: "text-amber-600", glyph: "=" },
  LOW: { label: "Low", className: "text-blue-600", glyph: "↓" },
};

/** Board short code for display keys (e.g. Operations → OPS). */
export function boardKeyPrefix(boardName?: string | null) {
  const cleaned = (boardName ?? "TASK")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((word) => word[0])
      .join("")
      .slice(0, 4);
  }
  return (words[0] ?? "TASK").replace(/[^A-Z0-9]/g, "").slice(0, 4) || "TASK";
}

/** Prefer server issue key; show a clear provisional label when missing. */
export function issueKey(
  task: Pick<WorkTask, "id" | "boardName" | "issueKey" | "boardKeyPrefix">,
  board?: Pick<TaskBoard, "name" | "keyPrefix"> | null,
) {
  if (task.issueKey) return task.issueKey;
  const prefix =
    board?.keyPrefix || task.boardKeyPrefix || boardKeyPrefix(board?.name ?? task.boardName);
  return `${prefix}-…`;
}

export const ISSUE_TYPE_LABELS: Record<string, string> = {
  TASK: "Task",
  BUG: "Bug",
  STORY: "Story",
  EPIC: "Epic",
};

export const ISSUE_TYPE_STYLES: Record<string, string> = {
  TASK: "text-blue-600",
  BUG: "text-rose-600",
  STORY: "text-emerald-600",
  EPIC: "text-violet-600",
};

export const STAGE_COLORS: Record<TaskStage["color"], { dot: string; soft: string; text: string }> =
  {
    SLATE: { dot: "bg-slate-500", soft: "bg-slate-100", text: "text-slate-700" },
    BLUE: { dot: "bg-blue-600", soft: "bg-blue-100", text: "text-blue-700" },
    AMBER: { dot: "bg-amber-500", soft: "bg-amber-100", text: "text-amber-700" },
    VIOLET: { dot: "bg-violet-600", soft: "bg-violet-100", text: "text-violet-700" },
    EMERALD: { dot: "bg-emerald-600", soft: "bg-emerald-100", text: "text-emerald-700" },
    RED: { dot: "bg-rose-600", soft: "bg-rose-100", text: "text-rose-700" },
  };

export const BOARD_ROLE_LABELS: Record<string, string> = {
  DEVELOPER_ADMIN: "Developer Admin",
  MAIN_ADMIN: "Company Admin",
  CEO: "CEO",
  HR: "HR",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
  SALES: "Sales",
  DRIVER: "Driver",
  FIELD_STAFF: "Field Staff",
};

export const BOARD_ROLES = [
  "MAIN_ADMIN",
  "CEO",
  "HR",
  "MANAGER",
  "EMPLOYEE",
  "SALES",
  "DRIVER",
  "FIELD_STAFF",
];

export type BoardFormStage = {
  id?: string;
  name: string;
  color: TaskStage["color"];
  status: TaskStatus;
};

export type BoardForm = {
  name: string;
  keyPrefix: string;
  description: string;
  accessType: TaskBoard["accessType"];
  allowedRoles: string[];
  memberEmployeeIds: string[];
  stages: BoardFormStage[];
  customFieldDefs: Array<{ key: string; label: string; type: "text" | "number" | "select" }>;
};

export const DEFAULT_BOARD_FORM: BoardForm = {
  name: "",
  keyPrefix: "",
  description: "",
  accessType: "OPEN",
  allowedRoles: [],
  memberEmployeeIds: [],
  stages: [
    { name: "To do", color: "SLATE", status: "TODO" },
    { name: "In progress", color: "AMBER", status: "IN_PROGRESS" },
    { name: "In review", color: "BLUE", status: "REVIEW" },
    { name: "Completed", color: "EMERALD", status: "COMPLETED" },
  ],
  customFieldDefs: [],
};

export function boardToForm(board: TaskBoard): BoardForm {
  return {
    name: board.name,
    keyPrefix: board.keyPrefix ?? boardKeyPrefix(board.name),
    description: board.description ?? "",
    accessType: board.accessType,
    allowedRoles: board.allowedRoles,
    memberEmployeeIds: board.memberEmployeeIds,
    stages: board.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      status: stage.status,
    })),
    customFieldDefs: (board.customFieldDefs ?? []).map((field) => ({ ...field })),
  };
}

export function dateValue(value: string) {
  return parseISO(`${value.slice(0, 10)}T00:00:00`);
}

export function dueLabel(value?: string, completed = false) {
  if (!value) return "No due date";
  const date = dateValue(value);
  if (isSameDay(date, startOfToday())) return "Due today";
  if (isBefore(date, startOfToday()) && !completed) {
    const days = Math.max(
      1,
      Math.ceil((startOfToday().getTime() - date.getTime()) / (24 * 60 * 60 * 1000)),
    );
    return `Overdue ${days} ${days === 1 ? "day" : "days"}`;
  }
  return `Due ${formatDisplayDate(value)}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
