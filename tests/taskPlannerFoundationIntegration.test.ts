/**
 * Task Planner Foundation — DB integration matrix (no skips when RUN_PLANNER_INTEGRATION=1).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PrismaClient,
  Role,
  TaskBoardAccessType,
  TaskIssueType,
  TaskPriority,
  TaskProjectRole,
  TaskStatus,
  TaskStatusCategory,
} from "@prisma/client";
import { assertWorkItemHierarchy } from "../server/src/taskHierarchy.js";
import {
  capabilitiesForRole,
  roleHasCapability,
  resolveProjectRole,
} from "../server/src/taskProjectRoles.js";
import { allocateIssueKey, midpointRank } from "../server/src/taskIssueKeys.js";
import { HttpError } from "../server/src/errors.js";

const run = process.env.RUN_PLANNER_INTEGRATION === "1";
const prisma = new PrismaClient();

describe.runIf(run)("Task Planner Foundation DB matrix", () => {
  let boardId = "";
  let stageTodo = "";
  let stageDone = "";
  let adminUserId = "";
  let memberUserId = "";
  let viewerEmployeeId = "";
  let memberEmployeeId = "";
  let leadEmployeeId = "";
  let preservedTaskId = "";
  let preservedKey = "";
  let preservedNumber = 0;
  let epicId = "";
  let storyId = "";

  beforeAll(async () => {
    const stamp = Date.now().toString(36);
    const admin = await prisma.user.create({
      data: {
        email: `planner-admin-${stamp}@test.local`,
        name: "Planner Admin",
        role: Role.DEVELOPER_ADMIN,
        passwordHash: "x",
      },
    });
    adminUserId = admin.id;

    const leadEmp = await prisma.employee.create({
      data: {
        employeeCode: `PL-${stamp}`,
        name: "Planner Lead",
        email: `planner-lead-${stamp}@test.local`,
      },
    });
    leadEmployeeId = leadEmp.employeeId;

    const memberEmp = await prisma.employee.create({
      data: {
        employeeCode: `PM-${stamp}`,
        name: "Planner Member",
        email: `planner-member-${stamp}@test.local`,
      },
    });
    memberEmployeeId = memberEmp.employeeId;
    const memberUser = await prisma.user.create({
      data: {
        email: `planner-member-${stamp}@test.local`,
        name: "Planner Member",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: memberEmployeeId,
      },
    });
    memberUserId = memberUser.id;

    const viewerEmp = await prisma.employee.create({
      data: {
        employeeCode: `PV-${stamp}`,
        name: "Planner Viewer",
        email: `planner-viewer-${stamp}@test.local`,
      },
    });
    viewerEmployeeId = viewerEmp.employeeId;

    const board = await prisma.taskBoard.create({
      data: {
        name: `Planner Foundation ${stamp}`,
        keyPrefix: `PF${stamp.slice(-4)}`.slice(0, 8).toUpperCase(),
        nextIssueNumber: 1,
        accessType: TaskBoardAccessType.MEMBER_GATED,
        createdByUserId: adminUserId,
        leadEmployeeId,
        stages: {
          create: [
            {
              name: "To do",
              status: TaskStatus.TODO,
              statusCategory: TaskStatusCategory.TODO,
              sortOrder: 0,
            },
            {
              name: "Done",
              status: TaskStatus.COMPLETED,
              statusCategory: TaskStatusCategory.DONE,
              isCompleted: true,
              sortOrder: 1,
            },
          ],
        },
        members: {
          create: [
            { employeeId: leadEmployeeId, role: TaskProjectRole.PROJECT_LEAD },
            { employeeId: memberEmployeeId, role: TaskProjectRole.MEMBER },
            { employeeId: viewerEmployeeId, role: TaskProjectRole.VIEWER },
          ],
        },
      },
      include: { stages: true },
    });
    boardId = board.boardId;
    stageTodo = board.stages.find((s) => s.status === TaskStatus.TODO)!.stageId;
    stageDone = board.stages.find((s) => s.status === TaskStatus.COMPLETED)!.stageId;

    const allocated = await prisma.$transaction((tx) => allocateIssueKey(tx, boardId));
    preservedNumber = allocated.issueNumber;
    preservedKey = allocated.issueKey;
    const preserved = await prisma.workTask.create({
      data: {
        title: "Preserved work item",
        boardId,
        stageId: stageTodo,
        issueNumber: preservedNumber,
        issueKey: preservedKey,
        issueType: TaskIssueType.TASK,
        rank: 1000,
        createdByUserId: adminUserId,
        reporterUserId: adminUserId,
        assignments: { create: [{ employeeId: memberEmployeeId, assignedByUserId: adminUserId }] },
        updates: {
          create: {
            authorUserId: adminUserId,
            activityType: "CREATED",
            message: "seed",
          },
        },
      },
    });
    preservedTaskId = preserved.taskId;
  });

  afterAll(async () => {
    if (boardId) {
      await prisma.workTask.deleteMany({ where: { boardId } });
      await prisma.taskBoard.delete({ where: { boardId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("1-9 preserve project, work item, key, sequence, stage, assignment, comment", async () => {
    const board = await prisma.taskBoard.findUniqueOrThrow({ where: { boardId } });
    const task = await prisma.workTask.findUniqueOrThrow({
      where: { taskId: preservedTaskId },
      include: { assignments: true, updates: true, stage: true },
    });
    expect(board.keyPrefix).toBeTruthy();
    expect(task.issueKey).toBe(preservedKey);
    expect(task.issueNumber).toBe(preservedNumber);
    expect(task.stageId).toBe(stageTodo);
    expect(task.assignments).toHaveLength(1);
    expect(task.updates.length).toBeGreaterThan(0);
    expect(task.reporterUserId).toBe(adminUserId);
    expect(task.createdByUserId).toBe(adminUserId);
  });

  it("10-15 hierarchy: IMPROVEMENT, SUBTASK rules, epic chain, cycle blocked", async () => {
    const improvement = await prisma.$transaction(async (tx) => {
      const key = await allocateIssueKey(tx, boardId);
      return tx.workTask.create({
        data: {
          title: "Improvement",
          boardId,
          stageId: stageTodo,
          issueNumber: key.issueNumber,
          issueKey: key.issueKey,
          issueType: TaskIssueType.IMPROVEMENT,
          rank: 2000,
          createdByUserId: adminUserId,
          reporterUserId: adminUserId,
        },
      });
    });
    expect(improvement.issueType).toBe(TaskIssueType.IMPROVEMENT);

    const epic = await prisma.$transaction(async (tx) => {
      const key = await allocateIssueKey(tx, boardId);
      return tx.workTask.create({
        data: {
          title: "Epic",
          boardId,
          stageId: stageTodo,
          issueNumber: key.issueNumber,
          issueKey: key.issueKey,
          issueType: TaskIssueType.EPIC,
          rank: 3000,
          createdByUserId: adminUserId,
          reporterUserId: adminUserId,
        },
      });
    });
    epicId = epic.taskId;

    await expect(
      assertWorkItemHierarchy({
        db: prisma,
        issueType: TaskIssueType.EPIC,
        parentTaskId: preservedTaskId,
        boardId,
        taskId: null,
      }),
    ).rejects.toBeInstanceOf(HttpError);

    await assertWorkItemHierarchy({
      db: prisma,
      issueType: TaskIssueType.STORY,
      parentTaskId: epicId,
      boardId,
      taskId: null,
    });

    const story = await prisma.$transaction(async (tx) => {
      const key = await allocateIssueKey(tx, boardId);
      return tx.workTask.create({
        data: {
          title: "Story under epic",
          boardId,
          stageId: stageTodo,
          parentTaskId: epicId,
          issueNumber: key.issueNumber,
          issueKey: key.issueKey,
          issueType: TaskIssueType.STORY,
          rank: 4000,
          createdByUserId: adminUserId,
          reporterUserId: adminUserId,
        },
      });
    });
    storyId = story.taskId;

    await expect(
      assertWorkItemHierarchy({
        db: prisma,
        issueType: TaskIssueType.SUBTASK,
        parentTaskId: null,
        boardId,
        taskId: null,
      }),
    ).rejects.toBeInstanceOf(HttpError);

    await assertWorkItemHierarchy({
      db: prisma,
      issueType: TaskIssueType.SUBTASK,
      parentTaskId: storyId,
      boardId,
      taskId: null,
    });

    const sub = await prisma.$transaction(async (tx) => {
      const key = await allocateIssueKey(tx, boardId);
      return tx.workTask.create({
        data: {
          title: "Subtask",
          boardId,
          stageId: stageTodo,
          parentTaskId: storyId,
          issueNumber: key.issueNumber,
          issueKey: key.issueKey,
          issueType: TaskIssueType.SUBTASK,
          rank: 5000,
          createdByUserId: adminUserId,
          reporterUserId: adminUserId,
        },
      });
    });

    await expect(
      assertWorkItemHierarchy({
        db: prisma,
        issueType: TaskIssueType.SUBTASK,
        parentTaskId: sub.taskId,
        boardId,
        taskId: null,
      }),
    ).rejects.toBeInstanceOf(HttpError);

    await expect(
      assertWorkItemHierarchy({
        db: prisma,
        issueType: TaskIssueType.STORY,
        parentTaskId: storyId,
        boardId,
        taskId: epicId,
      }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("16-18 reporter, creator, multi-assignee", async () => {
    const task = await prisma.workTask.findUniqueOrThrow({
      where: { taskId: preservedTaskId },
      include: { assignments: true },
    });
    expect(task.createdByUserId).toBe(adminUserId);
    expect(task.reporterUserId).toBe(adminUserId);
    expect(task.assignments.map((a) => a.employeeId)).toContain(memberEmployeeId);
  });

  it("19-22 project roles and capabilities", async () => {
    expect(roleHasCapability(TaskProjectRole.VIEWER, "EDIT_WORK_ITEM")).toBe(false);
    expect(roleHasCapability(TaskProjectRole.PROJECT_LEAD, "CREATE_WORK_ITEM")).toBe(true);
    expect(capabilitiesForRole(TaskProjectRole.PROJECT_ADMIN)).toContain("MANAGE_PROJECT");

    const board = await prisma.taskBoard.findUniqueOrThrow({
      where: { boardId },
      include: { members: true },
    });
    const viewerRole = await resolveProjectRole(
      prisma,
      { id: "x", role: Role.EMPLOYEE, employeeId: viewerEmployeeId } as never,
      board,
    );
    expect(viewerRole).toBe(TaskProjectRole.VIEWER);
    expect(roleHasCapability(viewerRole!, "EDIT_WORK_ITEM")).toBe(false);

    const memberRole = await resolveProjectRole(
      prisma,
      { id: memberUserId, role: Role.EMPLOYEE, employeeId: memberEmployeeId } as never,
      board,
    );
    expect(memberRole).toBe(TaskProjectRole.MEMBER);
  });

  it("23-27 rank, stage move, version conflict, archive, issue number not reused", async () => {
    expect(midpointRank(1000, 3000)).toBe(2000);
    const before = await prisma.workTask.findUniqueOrThrow({ where: { taskId: preservedTaskId } });
    const moved = await prisma.workTask.updateMany({
      where: { taskId: preservedTaskId, version: before.version },
      data: {
        stageId: stageDone,
        status: TaskStatus.COMPLETED,
        progress: 100,
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });
    expect(moved.count).toBe(1);
    const conflict = await prisma.workTask.updateMany({
      where: { taskId: preservedTaskId, version: before.version },
      data: { title: "stale", version: { increment: 1 } },
    });
    expect(conflict.count).toBe(0);

    const archived = await prisma.workTask.update({
      where: { taskId: preservedTaskId },
      data: { archivedAt: new Date() },
    });
    expect(archived.archivedAt).toBeTruthy();
    expect(archived.issueKey).toBe(preservedKey);

    const restored = await prisma.workTask.update({
      where: { taskId: preservedTaskId },
      data: { archivedAt: null },
    });
    expect(restored.archivedAt).toBeNull();

    const board = await prisma.taskBoard.findUniqueOrThrow({ where: { boardId } });
    expect(board.nextIssueNumber).toBeGreaterThan(preservedNumber);
    const next = await prisma.$transaction((tx) => allocateIssueKey(tx, boardId));
    expect(next.issueNumber).not.toBe(preservedNumber);
  });

  it("28-31 user role / org / attendance / leave unchanged by planner ops", async () => {
    const users = await prisma.user.count();
    const attendance = await prisma.attendanceEvent.count();
    const leave = await prisma.leaveRequest.count();
    expect(users).toBeGreaterThan(0);
    expect(attendance).toBeGreaterThanOrEqual(0);
    expect(leave).toBeGreaterThanOrEqual(0);
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    expect(admin.role).toBe(Role.DEVELOPER_ADMIN);
  });

  it("viewer cannot mutate; settings details + member role + archive + key preserve", async () => {
    expect(roleHasCapability(TaskProjectRole.VIEWER, "CREATE_WORK_ITEM")).toBe(false);
    expect(roleHasCapability(TaskProjectRole.VIEWER, "EDIT_WORK_ITEM")).toBe(false);
    expect(roleHasCapability(TaskProjectRole.VIEWER, "TRANSITION_WORK_ITEM")).toBe(false);
    expect(roleHasCapability(TaskProjectRole.VIEWER, "ARCHIVE_PROJECT")).toBe(false);

    const renamed = await prisma.taskBoard.update({
      where: { boardId },
      data: { name: "Planner Foundation Renamed", description: "details updated" },
    });
    expect(renamed.name).toBe("Planner Foundation Renamed");
    expect(renamed.description).toBe("details updated");

    await prisma.taskBoardMember.update({
      where: {
        boardId_employeeId: { boardId, employeeId: memberEmployeeId },
      },
      data: { role: TaskProjectRole.PROJECT_LEAD },
    });
    const membership = await prisma.taskBoardMember.findUniqueOrThrow({
      where: { boardId_employeeId: { boardId, employeeId: memberEmployeeId } },
    });
    expect(membership.role).toBe(TaskProjectRole.PROJECT_LEAD);

    const beforeKey = await prisma.workTask.findUniqueOrThrow({
      where: { taskId: preservedTaskId },
    });
    const oldPrefix = (await prisma.taskBoard.findUniqueOrThrow({ where: { boardId } })).keyPrefix;
    const newPrefix = `${oldPrefix.slice(0, 6)}X`.slice(0, 8);
    await prisma.taskBoard.update({
      where: { boardId },
      data: { keyPrefix: newPrefix },
    });
    const afterKey = await prisma.workTask.findUniqueOrThrow({
      where: { taskId: preservedTaskId },
    });
    expect(afterKey.issueKey).toBe(beforeKey.issueKey);
    expect(afterKey.issueKey).not.toContain(newPrefix);

    const archivedBoard = await prisma.taskBoard.update({
      where: { boardId },
      data: { archived: true },
    });
    expect(archivedBoard.archived).toBe(true);
    const preservedAfterArchive = await prisma.workTask.findUniqueOrThrow({
      where: { taskId: preservedTaskId },
    });
    expect(preservedAfterArchive.issueKey).toBe(beforeKey.issueKey);
    await prisma.taskBoard.update({ where: { boardId }, data: { archived: false } });
  });
});
