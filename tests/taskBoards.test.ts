import { describe, expect, it } from "vitest";
import {
  taskBoardArchiveSchema,
  taskBoardSchema,
  taskBoardUpdateSchema,
  taskLogSchema,
  taskSchema,
  taskUpdateSchema,
} from "../server/src/schemas.js";
import { DEFAULT_MODULE_ACCESS, moduleForApiPath } from "../server/src/module-access.js";

describe("task boards and module access", () => {
  it("accepts a board with custom stages and a completed stage", () => {
    const board = taskBoardSchema.parse({
      name: "Operations board",
      accessType: "ROLE_GATED",
      allowedRoles: ["MANAGER", "HR"],
      stages: [
        { name: "Queued", color: "SLATE", status: "TODO" },
        { name: "Working", color: "AMBER", status: "IN_PROGRESS" },
        { name: "Finished", color: "EMERALD", status: "COMPLETED" },
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
          { name: "To do", color: "SLATE", status: "TODO" },
          { name: "Working", color: "BLUE", status: "IN_PROGRESS" },
        ],
      }),
    ).toThrow("Select exactly one completed stage");
  });

  it("rejects multiple completed stages", () => {
    expect(() =>
      taskBoardSchema.parse({
        name: "Delivery",
        accessType: "OPEN",
        allowedRoles: [],
        memberEmployeeIds: [],
        stages: [
          { name: "To do", color: "SLATE", status: "TODO" },
          { name: "Done", color: "EMERALD", status: "COMPLETED" },
          { name: "Released", color: "BLUE", status: "COMPLETED" },
        ],
      }),
    ).toThrow("Select exactly one completed stage");
  });

  it("rejects boards where the first stage is not To do", () => {
    expect(() =>
      taskBoardSchema.parse({
        name: "Reversed",
        accessType: "OPEN",
        stages: [
          { name: "Done", color: "EMERALD", status: "COMPLETED" },
          { name: "To do", color: "SLATE", status: "TODO" },
        ],
      }),
    ).toThrow("The first stage must be the starting To do stage");
  });

  it("rejects boards with more than one To do stage", () => {
    expect(() =>
      taskBoardSchema.parse({
        name: "Split queue",
        accessType: "OPEN",
        stages: [
          { name: "Backlog", color: "SLATE", status: "TODO" },
          { name: "Ready", color: "BLUE", status: "TODO" },
          { name: "Done", color: "EMERALD", status: "COMPLETED" },
        ],
      }),
    ).toThrow("Keep exactly one to-do stage");
  });

  it("rejects a task whose due date is before its start date", () => {
    expect(() =>
      taskSchema.parse({
        title: "Impossible schedule",
        assigneeEmployeeIds: ["employee-1"],
        startDate: "2026-07-23",
        dueDate: "2026-07-22",
      }),
    ).toThrow("Due date cannot be before the start date");
  });

  it("requires optimistic versions for edits and activity", () => {
    expect(() => taskUpdateSchema.parse({ progress: 50 })).toThrow();
    expect(() => taskLogSchema.parse({ message: "Halfway done" })).toThrow();
    expect(taskUpdateSchema.parse({ version: 2, progress: 50 }).version).toBe(2);
    expect(taskLogSchema.parse({ version: 2, message: "Halfway done" }).version).toBe(2);
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

  it("requires optimistic versions for board configuration and archive changes", () => {
    expect(() =>
      taskBoardUpdateSchema.parse({
        name: "Operations board",
        accessType: "OPEN",
        stages: [
          { id: "stage-1", name: "To do", color: "SLATE", status: "TODO" },
          { id: "stage-2", name: "Done", color: "EMERALD", status: "COMPLETED" },
        ],
      }),
    ).toThrow();
    expect(
      taskBoardUpdateSchema.parse({
        version: 3,
        name: "Operations board",
        accessType: "OPEN",
        stages: [
          { id: "stage-1", name: "To do", color: "SLATE", status: "TODO" },
          { id: "stage-2", name: "Done", color: "EMERALD", status: "COMPLETED" },
        ],
      }).version,
    ).toBe(3);
    expect(taskBoardArchiveSchema.parse({ version: 2, archived: true })).toEqual({
      version: 2,
      archived: true,
    });
  });

  it("maps protected APIs to modules and preserves developer access", () => {
    expect(moduleForApiPath("/tasks/123")).toBe("TASKS");
    expect(moduleForApiPath("/leave/requests")).toBe("LEAVE");
    expect(DEFAULT_MODULE_ACCESS.DEVELOPER_ADMIN).toContain("SYSTEM");
  });
});

describe("task ranking helpers", () => {
  it("asks for rebalance when inserting above a near-zero rank", async () => {
    const { midpointRank } = await import("../server/src/taskIssueKeys.js");
    expect(midpointRank(null, 0)).toBeNull();
    expect(midpointRank(null, 0.0005)).toBeNull();
    expect(midpointRank(null, 1000)).toBe(500);
    expect(midpointRank(1000, 2000)).toBe(1500);
    expect(midpointRank(1000, 1000.0005)).toBeNull();
  });
});
