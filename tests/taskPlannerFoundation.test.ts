import { describe, expect, it } from "vitest";
import { TaskIssueType } from "@prisma/client";
import { statusCategoryFromTaskStatus } from "../server/src/taskHierarchy.js";
import {
  capabilitiesForRole,
  roleHasCapability,
} from "../server/src/taskProjectRoles.js";
import { TaskProjectRole } from "@prisma/client";
import { taskSchema } from "../server/src/schemas.js";

describe("task planner foundation units", () => {
  it("maps status categories", () => {
    expect(statusCategoryFromTaskStatus("TODO")).toBe("TODO");
    expect(statusCategoryFromTaskStatus("IN_PROGRESS")).toBe("IN_PROGRESS");
    expect(statusCategoryFromTaskStatus("REVIEW")).toBe("IN_PROGRESS");
    expect(statusCategoryFromTaskStatus("COMPLETED", true)).toBe("DONE");
    expect(statusCategoryFromTaskStatus("CANCELLED")).toBe("DONE");
  });

  it("viewer cannot edit; admin can manage", () => {
    expect(roleHasCapability(TaskProjectRole.VIEWER, "EDIT_WORK_ITEM")).toBe(false);
    expect(capabilitiesForRole(TaskProjectRole.PROJECT_ADMIN)).toContain("MANAGE_PROJECT");
    expect(capabilitiesForRole(TaskProjectRole.PROJECT_LEAD)).toContain("MANAGE_COMPONENTS");
  });

  it("accepts IMPROVEMENT and SUBTASK issue types", () => {
    const improvement = taskSchema.parse({
      title: "Polish filters",
      assigneeEmployeeIds: ["e1"],
      issueType: TaskIssueType.IMPROVEMENT,
      priority: "MEDIUM",
    });
    expect(improvement.issueType).toBe("IMPROVEMENT");
    const subtask = taskSchema.parse({
      title: "Nested work",
      assigneeEmployeeIds: ["e1"],
      issueType: TaskIssueType.SUBTASK,
      parentTaskId: "parent-1",
      priority: "LOW",
    });
    expect(subtask.issueType).toBe("SUBTASK");
  });
});
