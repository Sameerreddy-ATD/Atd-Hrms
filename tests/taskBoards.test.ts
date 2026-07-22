import { describe, expect, it } from "vitest";
import { taskBoardSchema, taskSchema } from "../server/src/schemas.js";
import { DEFAULT_MODULE_ACCESS, moduleForApiPath } from "../server/src/module-access.js";

describe("task boards and module access", () => {
  it("accepts a board with custom stages and a completed stage", () => {
    const board = taskBoardSchema.parse({
      name: "Operations board",
      accessType: "ROLE_GATED",
      allowedRoles: ["MANAGER", "HR"],
      stages: [
        { name: "Queued", color: "SLATE", isCompleted: false },
        { name: "Working", color: "AMBER", isCompleted: false },
        { name: "Finished", color: "EMERALD", isCompleted: true },
      ],
    });
    expect(board.stages).toHaveLength(3);
    expect(board.allowedRoles).toContain("HR");
  });

  it("rejects a board without a completed stage", () => {
    expect(() =>
      taskBoardSchema.parse({
        name: "Incomplete board",
        accessType: "OPEN",
        stages: [
          { name: "To do", color: "SLATE", isCompleted: false },
          { name: "Working", color: "BLUE", isCompleted: false },
        ],
      }),
    ).toThrow("Add a completed stage");
  });

  it("connects new tasks to a board and stage", () => {
    const task = taskSchema.parse({
      title: "Prepare dispatch report",
      assigneeEmployeeIds: ["employee-1"],
      boardId: "board-1",
      stageId: "stage-1",
    });
    expect(task.boardId).toBe("board-1");
    expect(task.stageId).toBe("stage-1");
  });

  it("maps protected APIs to modules and preserves developer access", () => {
    expect(moduleForApiPath("/tasks/123")).toBe("TASKS");
    expect(moduleForApiPath("/leave/requests")).toBe("LEAVE");
    expect(DEFAULT_MODULE_ACCESS.DEVELOPER_ADMIN).toContain("SYSTEM");
  });
});
