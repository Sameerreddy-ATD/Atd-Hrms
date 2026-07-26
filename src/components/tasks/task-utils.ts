import { format, isBefore, isSameDay, parseISO, startOfToday } from "date-fns";
import type { TaskBoard, TaskPriority, TaskStage, TaskStatus } from "@/types/domain";

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
  description: string;
  accessType: TaskBoard["accessType"];
  allowedRoles: string[];
  memberEmployeeIds: string[];
  stages: BoardFormStage[];
  customFieldDefs: Array<{ key: string; label: string; type: "text" | "number" | "select" }>;
};

export const DEFAULT_BOARD_FORM: BoardForm = {
  name: "",
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
  return `Due ${format(date, "d MMM")}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
