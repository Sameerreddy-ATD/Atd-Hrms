/**
 * Default workflow templates (Jira-style). Not board columns.
 * Category (TODO | IN_PROGRESS | DONE) ≠ status ≠ column ≠ transition.
 */
import { TaskIssueType, TaskStatusCategory, type TaskProjectRole } from "@prisma/client";

export type WorkflowKind = "STANDARD" | "BUG" | "SUBTASK" | "EPIC";

export type CatalogStatus = {
  key: string;
  name: string;
  category: TaskStatusCategory;
  color: "SLATE" | "BLUE" | "AMBER" | "VIOLET" | "EMERALD" | "RED";
  isInitial?: boolean;
  isTerminal?: boolean;
  /** Preferred board column name when seeding a new project. */
  column: string;
};

export type CatalogTransition = {
  name: string;
  from: string;
  to: string;
  allowedProjectRoles?: TaskProjectRole[];
  commentRequired?: boolean;
  requiredFields?: string[];
};

export type CatalogWorkflow = {
  kind: WorkflowKind;
  name: string;
  description: string;
  issueTypes: TaskIssueType[];
  statuses: CatalogStatus[];
  transitions: CatalogTransition[];
};

const LEAD_ADMIN: TaskProjectRole[] = ["PROJECT_LEAD", "PROJECT_ADMIN"];

export const STANDARD_WORKFLOW: CatalogWorkflow = {
  kind: "STANDARD",
  name: "Standard Workflow",
  description: "Default path for stories, tasks, and improvements.",
  issueTypes: [TaskIssueType.STORY, TaskIssueType.TASK, TaskIssueType.IMPROVEMENT],
  statuses: [
    { key: "backlog", name: "Backlog", category: TaskStatusCategory.TODO, color: "SLATE", isInitial: true, column: "Backlog" },
    { key: "ready", name: "Ready", category: TaskStatusCategory.TODO, color: "BLUE", column: "Ready" },
    { key: "in_progress", name: "In Progress", category: TaskStatusCategory.IN_PROGRESS, color: "AMBER", column: "In Progress" },
    { key: "review", name: "Review", category: TaskStatusCategory.IN_PROGRESS, color: "VIOLET", column: "Review" },
    { key: "qa", name: "QA", category: TaskStatusCategory.IN_PROGRESS, color: "BLUE", column: "QA" },
    { key: "blocked", name: "Blocked", category: TaskStatusCategory.IN_PROGRESS, color: "RED", column: "Blocked" },
    { key: "done", name: "Done", category: TaskStatusCategory.DONE, color: "EMERALD", isTerminal: true, column: "Done" },
  ],
  transitions: [
    { name: "Ready for work", from: "backlog", to: "ready" },
    { name: "Start progress", from: "ready", to: "in_progress" },
    { name: "Send to review", from: "in_progress", to: "review" },
    { name: "Send to QA", from: "review", to: "qa" },
    { name: "Done", from: "qa", to: "done" },
    { name: "Block", from: "in_progress", to: "blocked" },
    { name: "Unblock", from: "blocked", to: "in_progress" },
    { name: "Return to development", from: "review", to: "in_progress" },
    { name: "Return to development", from: "qa", to: "in_progress" },
    { name: "Reopen", from: "done", to: "in_progress", allowedProjectRoles: LEAD_ADMIN },
  ],
};

export const BUG_WORKFLOW: CatalogWorkflow = {
  kind: "BUG",
  name: "Bug Workflow",
  description: "Defect intake, triage, verification, and close.",
  issueTypes: [TaskIssueType.BUG],
  statuses: [
    { key: "reported", name: "Reported", category: TaskStatusCategory.TODO, color: "SLATE", isInitial: true, column: "Backlog" },
    { key: "triage", name: "Triage", category: TaskStatusCategory.TODO, color: "AMBER", column: "Ready" },
    { key: "ready", name: "Ready", category: TaskStatusCategory.TODO, color: "BLUE", column: "Ready" },
    { key: "in_progress", name: "In Progress", category: TaskStatusCategory.IN_PROGRESS, color: "AMBER", column: "In Progress" },
    { key: "review", name: "Review", category: TaskStatusCategory.IN_PROGRESS, color: "VIOLET", column: "Review" },
    { key: "qa", name: "QA", category: TaskStatusCategory.IN_PROGRESS, color: "BLUE", column: "QA" },
    { key: "verified", name: "Verified", category: TaskStatusCategory.DONE, color: "EMERALD", column: "Done" },
    { key: "closed", name: "Closed", category: TaskStatusCategory.DONE, color: "EMERALD", isTerminal: true, column: "Done" },
    { key: "cancelled", name: "Cancelled", category: TaskStatusCategory.DONE, color: "SLATE", isTerminal: true, column: "Done" },
  ],
  transitions: [
    { name: "Start triage", from: "reported", to: "triage" },
    { name: "Accept", from: "triage", to: "ready" },
    { name: "Start progress", from: "ready", to: "in_progress" },
    { name: "Send to review", from: "in_progress", to: "review" },
    { name: "Send to QA", from: "review", to: "qa" },
    { name: "Verify", from: "qa", to: "verified" },
    { name: "Close", from: "verified", to: "closed" },
    { name: "Close from triage", from: "triage", to: "closed", commentRequired: true },
    { name: "Cancel", from: "triage", to: "cancelled", commentRequired: true },
    { name: "Return to development", from: "qa", to: "in_progress" },
    { name: "Reopen", from: "verified", to: "in_progress", allowedProjectRoles: LEAD_ADMIN },
    { name: "Reopen", from: "closed", to: "in_progress", allowedProjectRoles: LEAD_ADMIN },
  ],
};

export const SUBTASK_WORKFLOW: CatalogWorkflow = {
  kind: "SUBTASK",
  name: "Subtask Workflow",
  description: "Simple to-do path for subtasks.",
  issueTypes: [TaskIssueType.SUBTASK],
  statuses: [
    { key: "todo", name: "To Do", category: TaskStatusCategory.TODO, color: "SLATE", isInitial: true, column: "Backlog" },
    { key: "in_progress", name: "In Progress", category: TaskStatusCategory.IN_PROGRESS, color: "AMBER", column: "In Progress" },
    { key: "done", name: "Done", category: TaskStatusCategory.DONE, color: "EMERALD", isTerminal: true, column: "Done" },
  ],
  transitions: [
    { name: "Start progress", from: "todo", to: "in_progress" },
    { name: "Done", from: "in_progress", to: "done" },
    { name: "Reopen", from: "done", to: "in_progress", allowedProjectRoles: LEAD_ADMIN },
  ],
};

export const EPIC_WORKFLOW: CatalogWorkflow = {
  kind: "EPIC",
  name: "Epic Workflow",
  description: "Planning states for epics (not sprint semantics).",
  issueTypes: [TaskIssueType.EPIC],
  statuses: [
    { key: "backlog", name: "Backlog", category: TaskStatusCategory.TODO, color: "SLATE", isInitial: true, column: "Backlog" },
    { key: "planned", name: "Planned", category: TaskStatusCategory.TODO, color: "BLUE", column: "Ready" },
    { key: "in_progress", name: "In Progress", category: TaskStatusCategory.IN_PROGRESS, color: "AMBER", column: "In Progress" },
    { key: "paused", name: "Paused", category: TaskStatusCategory.IN_PROGRESS, color: "RED", column: "Blocked" },
    { key: "completed", name: "Completed", category: TaskStatusCategory.DONE, color: "EMERALD", isTerminal: true, column: "Done" },
  ],
  transitions: [
    { name: "Plan", from: "backlog", to: "planned" },
    { name: "Start", from: "planned", to: "in_progress" },
    { name: "Complete", from: "in_progress", to: "completed" },
    { name: "Pause", from: "in_progress", to: "paused" },
    { name: "Resume", from: "paused", to: "in_progress" },
  ],
};

export const DEFAULT_WORKFLOWS: CatalogWorkflow[] = [
  STANDARD_WORKFLOW,
  BUG_WORKFLOW,
  SUBTASK_WORKFLOW,
  EPIC_WORKFLOW,
];

export const DEFAULT_BOARD_COLUMNS: Array<{
  name: string;
  color: CatalogStatus["color"];
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "COMPLETED";
  category: TaskStatusCategory;
}> = [
  { name: "Backlog", color: "SLATE", status: "TODO", category: TaskStatusCategory.TODO },
  { name: "Ready", color: "BLUE", status: "TODO", category: TaskStatusCategory.TODO },
  { name: "In Progress", color: "AMBER", status: "IN_PROGRESS", category: TaskStatusCategory.IN_PROGRESS },
  { name: "Review", color: "VIOLET", status: "REVIEW", category: TaskStatusCategory.IN_PROGRESS },
  { name: "QA", color: "BLUE", status: "IN_PROGRESS", category: TaskStatusCategory.IN_PROGRESS },
  { name: "Blocked", color: "RED", status: "BLOCKED", category: TaskStatusCategory.IN_PROGRESS },
  { name: "Done", color: "EMERALD", status: "COMPLETED", category: TaskStatusCategory.DONE },
];

export function catalogForIssueType(issueType: TaskIssueType): CatalogWorkflow {
  return (
    DEFAULT_WORKFLOWS.find((workflow) => workflow.issueTypes.includes(issueType)) ?? STANDARD_WORKFLOW
  );
}

export function legacyTaskStatusForCategory(
  category: TaskStatusCategory,
  statusName: string,
): "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "COMPLETED" | "CANCELLED" {
  const name = statusName.toLowerCase();
  if (name.includes("cancel")) return "CANCELLED";
  if (name.includes("block") || name.includes("pause")) return "BLOCKED";
  if (name.includes("review")) return "REVIEW";
  if (category === TaskStatusCategory.DONE) return "COMPLETED";
  if (category === TaskStatusCategory.IN_PROGRESS) return "IN_PROGRESS";
  return "TODO";
}
