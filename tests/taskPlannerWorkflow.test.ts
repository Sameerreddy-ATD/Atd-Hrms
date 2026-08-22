import { describe, expect, it } from "vitest";
import { TaskIssueType, TaskStatusCategory } from "@prisma/client";
import {
  BUG_WORKFLOW,
  EPIC_WORKFLOW,
  STANDARD_WORKFLOW,
  SUBTASK_WORKFLOW,
  catalogForIssueType,
  legacyTaskStatusForCategory,
} from "../server/src/taskWorkflowCatalog.js";
import {
  friendlyInvalidTransition,
  mapStatusForTypeChange,
  roleMayExecuteTransition,
} from "../server/src/taskWorkflowEngine.js";
import { TaskProjectRole } from "@prisma/client";
import {
  taskTransitionSchema,
  workflowTransitionCreateSchema,
} from "../server/src/schemas.js";

describe("task planner workflow units", () => {
  it("maps work types to catalog workflows", () => {
    expect(catalogForIssueType(TaskIssueType.TASK).kind).toBe("STANDARD");
    expect(catalogForIssueType(TaskIssueType.STORY).kind).toBe("STANDARD");
    expect(catalogForIssueType(TaskIssueType.IMPROVEMENT).kind).toBe("STANDARD");
    expect(catalogForIssueType(TaskIssueType.BUG).kind).toBe("BUG");
    expect(catalogForIssueType(TaskIssueType.SUBTASK).kind).toBe("SUBTASK");
    expect(catalogForIssueType(TaskIssueType.EPIC).kind).toBe("EPIC");
  });

  it("standard / bug / subtask / epic catalogs have one initial status", () => {
    for (const workflow of [STANDARD_WORKFLOW, BUG_WORKFLOW, SUBTASK_WORKFLOW, EPIC_WORKFLOW]) {
      expect(workflow.statuses.filter((status) => status.isInitial)).toHaveLength(1);
      expect(workflow.transitions.every((edge) => edge.from !== edge.to)).toBe(true);
    }
  });

  it("legacy completion maps DONE category to COMPLETED", () => {
    expect(legacyTaskStatusForCategory(TaskStatusCategory.DONE, "Done")).toBe("COMPLETED");
    expect(legacyTaskStatusForCategory(TaskStatusCategory.TODO, "Backlog")).toBe("TODO");
  });

  it("type-change mapping prefers same name then same category", () => {
    const mapped = mapStatusForTypeChange({
      fromCategory: TaskStatusCategory.IN_PROGRESS,
      fromName: "In Progress",
      targetStatuses: [
        {
          statusId: "a",
          name: "To Do",
          category: TaskStatusCategory.TODO,
          active: true,
          isInitial: true,
          sortOrder: 0,
        },
        {
          statusId: "b",
          name: "In Progress",
          category: TaskStatusCategory.IN_PROGRESS,
          active: true,
          isInitial: false,
          sortOrder: 1,
        },
      ],
    });
    expect(mapped.statusId).toBe("b");
  });

  it("viewer cannot execute unrestricted transitions; member can", () => {
    expect(roleMayExecuteTransition(TaskProjectRole.VIEWER, null)).toBe(false);
    expect(roleMayExecuteTransition(TaskProjectRole.MEMBER, null)).toBe(true);
    expect(
      roleMayExecuteTransition(TaskProjectRole.MEMBER, [
        TaskProjectRole.PROJECT_LEAD,
        TaskProjectRole.PROJECT_ADMIN,
      ]),
    ).toBe(false);
    expect(
      roleMayExecuteTransition(TaskProjectRole.PROJECT_ADMIN, [
        TaskProjectRole.PROJECT_LEAD,
      ]),
    ).toBe(true);
  });

  it("rejects self-transitions and builds friendly invalid messages", () => {
    expect(() =>
      workflowTransitionCreateSchema.parse({
        name: "Loop",
        fromStatusId: "a",
        toStatusId: "a",
      }),
    ).toThrow();
    expect(friendlyInvalidTransition("Backlog", "QA")).toBe(
      "This work item cannot move directly from Backlog to QA.",
    );
    expect(taskTransitionSchema.parse({ version: 1, transitionId: "t1" }).transitionId).toBe("t1");
  });
});
