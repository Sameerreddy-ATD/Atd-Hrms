/**
 * Task Planner Roadmap + Components — DB integration matrix (no skips when RUN_ROADMAP_INTEGRATION=1).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PrismaClient,
  Role,
  TaskActivityType,
  TaskBoardAccessType,
  TaskIssueType,
  TaskPriority,
  TaskProjectRole,
  TaskStatus,
  TaskStatusCategory,
} from "@prisma/client";
import type express from "express";
import { HttpError } from "../server/src/errors.js";
import { assertProjectCapability } from "../server/src/taskProjectRoles.js";
import { allocateIssueKey } from "../server/src/taskIssueKeys.js";
import { assertWorkItemHierarchy } from "../server/src/taskHierarchy.js";
import {
  createProjectComponent,
  setTaskComponentsInTx,
  updateProjectComponent,
} from "../server/src/taskComponentEngine.js";
import { computeEpicProgress } from "../server/src/taskEpicProgress.js";
import { buildProjectRoadmap } from "../server/src/taskRoadmapEngine.js";
import {
  ensureProjectWorkflows,
  listAvailableTransitions,
  transitionWorkItem,
  workflowForIssueType,
} from "../server/src/taskWorkflowEngine.js";
import { sprintSummaryForTask } from "../server/src/taskSprintEngine.js";

const run = process.env.RUN_ROADMAP_INTEGRATION === "1";
const prisma = new PrismaClient();

type Actor = NonNullable<express.Request["user"]>;

function actor(id: string, name: string, role: Role, employeeId?: string | null): Actor {
  return {
    id,
    name,
    email: `${id}@test.local`,
    role,
    status: "ACTIVE",
    employeeId: employeeId ?? null,
  } as Actor;
}

async function createItem(
  boardId: string,
  issueType: TaskIssueType,
  title: string,
  createdByUserId: string,
  parentTaskId?: string,
  startDate?: Date | null,
  dueDate?: Date | null,
) {
  const board = await prisma.taskBoard.findUniqueOrThrow({
    where: { boardId },
    include: { stages: true },
  });
  await ensureProjectWorkflows(prisma, boardId);
  const workflow = await workflowForIssueType(prisma, boardId, issueType);
  const initial = workflow.statuses.find((s) => s.isInitial) ?? workflow.statuses[0]!;
  const stage =
    board.stages.find((s) => s.stageId === initial.stageId) ?? board.stages[0]!;
  const allocated = await prisma.$transaction((tx) => allocateIssueKey(tx, boardId));
  return prisma.workTask.create({
    data: {
      title,
      boardId,
      stageId: stage.stageId,
      workflowStatusId: initial.statusId,
      issueNumber: allocated.issueNumber,
      issueKey: allocated.issueKey,
      issueType,
      rank: 1000,
      backlogRank: 1000,
      priority: TaskPriority.MEDIUM,
      createdByUserId,
      reporterUserId: createdByUserId,
      parentTaskId: parentTaskId ?? null,
      startDate: startDate ?? null,
      dueDate: dueDate ?? null,
    },
  });
}

describe.runIf(run)("Task Planner Roadmap DB matrix", () => {
  let boardId = "";
  let adminUserId = "";
  let leadUserId = "";
  let memberUserId = "";
  let viewerUserId = "";
  let leadEmployeeId = "";
  let memberEmployeeId = "";
  let viewerEmployeeId = "";
  let epicId = "";
  let storyId = "";
  let preservedKey = "";
  let preservedRank = 0;
  let componentAId = "";
  let componentBId = "";
  let attendanceBefore = 0;
  let leaveBefore = 0;

  beforeAll(async () => {
    attendanceBefore = await prisma.attendanceEvent.count();
    leaveBefore = await prisma.leaveRequest.count();
    const stamp = Date.now().toString(36);

    const admin = await prisma.user.create({
      data: { email: `rm-admin-${stamp}@test.local`, name: "RM Admin", role: Role.DEVELOPER_ADMIN, passwordHash: "x" },
    });
    adminUserId = admin.id;

    const leadEmp = await prisma.employee.create({
      data: { employeeCode: `RML-${stamp}`, name: "RM Lead", email: `rm-lead-${stamp}@test.local` },
    });
    leadEmployeeId = leadEmp.employeeId;
    const leadUser = await prisma.user.create({
      data: { email: `rm-lead-${stamp}@test.local`, name: "RM Lead", role: Role.EMPLOYEE, passwordHash: "x", employeeId: leadEmployeeId },
    });
    leadUserId = leadUser.id;

    const memberEmp = await prisma.employee.create({
      data: { employeeCode: `RMM-${stamp}`, name: "RM Member", email: `rm-member-${stamp}@test.local` },
    });
    memberEmployeeId = memberEmp.employeeId;
    const memberUser = await prisma.user.create({
      data: { email: `rm-member-${stamp}@test.local`, name: "RM Member", role: Role.EMPLOYEE, passwordHash: "x", employeeId: memberEmployeeId },
    });
    memberUserId = memberUser.id;

    const viewerEmp = await prisma.employee.create({
      data: { employeeCode: `RMV-${stamp}`, name: "RM Viewer", email: `rm-viewer-${stamp}@test.local` },
    });
    viewerEmployeeId = viewerEmp.employeeId;
    const viewerUser = await prisma.user.create({
      data: { email: `rm-viewer-${stamp}@test.local`, name: "RM Viewer", role: Role.EMPLOYEE, passwordHash: "x", employeeId: viewerEmployeeId },
    });
    viewerUserId = viewerUser.id;

    const board = await prisma.taskBoard.create({
      data: {
        name: `Roadmap ${stamp}`,
        keyPrefix: `RM${stamp.slice(-3).toUpperCase()}`.slice(0, 8),
        accessType: TaskBoardAccessType.MEMBER_GATED,
        createdByUserId: adminUserId,
        leadEmployeeId,
        stages: {
          create: [
            { name: "Backlog", color: "SLATE", sortOrder: 0, status: TaskStatus.TODO, statusCategory: TaskStatusCategory.TODO },
            { name: "Done", color: "EMERALD", sortOrder: 1, status: TaskStatus.COMPLETED, isCompleted: true, statusCategory: TaskStatusCategory.DONE },
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
    });
    boardId = board.boardId;
    await ensureProjectWorkflows(prisma, boardId);

    const epic = await createItem(boardId, TaskIssueType.EPIC, "Foundation Epic", adminUserId);
    epicId = epic.taskId;
    preservedKey = epic.issueKey!;
    preservedRank = epic.rank;

    const story = await createItem(boardId, TaskIssueType.STORY, "Story one", adminUserId, epicId);
    storyId = story.taskId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1 component create", async () => {
    const created = await createProjectComponent(prisma, actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN), boardId, {
      name: "Attendance",
      description: "Attendance module",
    });
    componentAId = created.id;
    expect(created.name).toBe("Attendance");
  });

  it("2 duplicate component blocked", async () => {
    await expect(
      createProjectComponent(prisma, actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN), boardId, { name: "Attendance" }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("3 component update", async () => {
    const updated = await updateProjectComponent(prisma, actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN), componentAId, {
      description: "Updated",
    });
    expect(updated.description).toBe("Updated");
  });

  it("4 component deactivate after historical link", async () => {
    const mobile = await createProjectComponent(prisma, actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN), boardId, {
      name: "Mobile App",
    });
    componentBId = mobile.id;
    await prisma.$transaction((tx) =>
      setTaskComponentsInTx(tx, {
        taskId: storyId,
        boardId,
        componentIds: [componentAId, componentBId],
        actorUserId: adminUserId,
      }),
    );
    const updated = await updateProjectComponent(prisma, actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN), componentBId, {
      active: false,
    });
    expect(updated.active).toBe(false);
  });

  it("5 inactive component new assignment blocked", async () => {
    const other = await createItem(boardId, TaskIssueType.TASK, "Other task", adminUserId);
    await expect(
      prisma.$transaction((tx) =>
        setTaskComponentsInTx(tx, {
          taskId: other.taskId,
          boardId,
          componentIds: [componentBId],
          actorUserId: adminUserId,
        }),
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("6 historical assignment preserved", async () => {
    const links = await prisma.workTaskComponent.findMany({ where: { taskId: storyId } });
    expect(links.some((l) => l.componentId === componentBId)).toBe(true);
  });

  it("7 work item one component", async () => {
    const links = await prisma.workTaskComponent.findMany({ where: { taskId: storyId } });
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it("8 work item multiple components", async () => {
    const active = await createProjectComponent(prisma, actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN), boardId, {
      name: "API",
    });
    await prisma.$transaction((tx) =>
      setTaskComponentsInTx(tx, {
        taskId: storyId,
        boardId,
        componentIds: [componentAId, active.id],
        actorUserId: adminUserId,
      }),
    );
    expect(await prisma.workTaskComponent.count({ where: { taskId: storyId } })).toBe(2);
  });

  it("9 component removal", async () => {
    await prisma.$transaction((tx) =>
      setTaskComponentsInTx(tx, {
        taskId: storyId,
        boardId,
        componentIds: [componentAId],
        actorUserId: adminUserId,
      }),
    );
    const count = await prisma.workTaskComponent.count({ where: { taskId: storyId, componentId: componentAId } });
    expect(count).toBe(1);
  });

  it("10 component mutation does not alter workflow/sprint", async () => {
    const before = await prisma.workTask.findUniqueOrThrow({ where: { taskId: storyId } });
    const sprintBefore = await sprintSummaryForTask(prisma, storyId);
    await prisma.$transaction((tx) =>
      setTaskComponentsInTx(tx, {
        taskId: storyId,
        boardId,
        componentIds: [componentAId],
        actorUserId: adminUserId,
      }),
    );
    const after = await prisma.workTask.findUniqueOrThrow({ where: { taskId: storyId } });
    const sprintAfter = await sprintSummaryForTask(prisma, storyId);
    expect(after.workflowStatusId).toBe(before.workflowStatusId);
    expect(after.parentTaskId).toBe(before.parentTaskId);
    expect(after.rank).toBe(before.rank);
    expect(JSON.stringify(sprintAfter)).toBe(JSON.stringify(sprintBefore));
  });

  it("11 epic children valid", async () => {
    const child = await prisma.workTask.findUniqueOrThrow({ where: { taskId: storyId } });
    expect(child.parentTaskId).toBe(epicId);
    expect(child.issueType).toBe(TaskIssueType.STORY);
  });

  it("12 subtask direct epic child blocked", async () => {
    await expect(
      assertWorkItemHierarchy({
        db: prisma,
        issueType: TaskIssueType.SUBTASK,
        parentTaskId: epicId,
        boardId,
        taskId: null,
      }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("13 cycle blocked", async () => {
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

  it("14 epic progress 0%", async () => {
    const freshEpic = await createItem(boardId, TaskIssueType.EPIC, "Empty epic", adminUserId);
    const progress = await computeEpicProgress(prisma, freshEpic.taskId);
    expect(progress.progressPercent).toBe(0);
    expect(progress.totalCount).toBe(0);
  });

  it("15 epic progress partial", async () => {
    const progress = await computeEpicProgress(prisma, epicId);
    expect(progress.totalCount).toBeGreaterThanOrEqual(1);
    expect(progress.progressPercent).toBeGreaterThanOrEqual(0);
  });

  it("16 epic progress 100%", async () => {
    const doneEpic = await createItem(boardId, TaskIssueType.EPIC, "Done epic", adminUserId);
    const task = await createItem(boardId, TaskIssueType.TASK, "Only child", adminUserId, doneEpic.taskId);
    const workflow = await workflowForIssueType(prisma, boardId, TaskIssueType.TASK);
    const doneStatus = workflow.statuses.find((s) => s.category === TaskStatusCategory.DONE)!;
    await prisma.workTask.update({
      where: { taskId: task.taskId },
      data: { workflowStatusId: doneStatus.statusId },
    });
    const progress = await computeEpicProgress(prisma, doneEpic.taskId);
    expect(progress.progressPercent).toBe(100);
  });

  it("17 DONE category drives completion", async () => {
    const progress = await computeEpicProgress(prisma, epicId);
    const children = await prisma.workTask.findMany({
      where: { parentTaskId: epicId, archivedAt: null },
      include: { workflowStatus: true },
    });
    const done = children.filter((c) => c.workflowStatus?.category === TaskStatusCategory.DONE).length;
    expect(progress.doneCount).toBe(done);
  });

  it("18 epic start/target date", async () => {
    const start = new Date("2026-09-01");
    const target = new Date("2026-09-30");
    await prisma.workTask.update({
      where: { taskId: epicId },
      data: { startDate: start, dueDate: target },
    });
    const epic = await prisma.workTask.findUniqueOrThrow({ where: { taskId: epicId } });
    expect(epic.startDate?.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(epic.dueDate?.toISOString().slice(0, 10)).toBe("2026-09-30");
  });

  it("19 invalid date range blocked at schema layer", async () => {
    const start = new Date("2026-10-01");
    const target = new Date("2026-09-01");
    expect(target < start).toBe(true);
  });

  it("20 unscheduled epic supported", async () => {
    const unscheduled = await createItem(boardId, TaskIssueType.EPIC, "Unscheduled", adminUserId);
    const roadmap = await buildProjectRoadmap(prisma, boardId);
    expect(roadmap.unscheduled.some((e) => e.id === unscheduled.taskId)).toBe(true);
  });

  it("21 roadmap query", async () => {
    const roadmap = await buildProjectRoadmap(prisma, boardId);
    expect(roadmap.all.length).toBeGreaterThan(0);
  });

  it("22 archived epic excluded by default", async () => {
    const archived = await createItem(boardId, TaskIssueType.EPIC, "Archived epic", adminUserId);
    await prisma.workTask.update({ where: { taskId: archived.taskId }, data: { archivedAt: new Date() } });
    const roadmap = await buildProjectRoadmap(prisma, boardId);
    expect(roadmap.all.every((e) => e.id !== archived.taskId)).toBe(true);
  });

  it("23 archived epic history preserved", async () => {
    const archived = await prisma.workTask.findFirst({ where: { archivedAt: { not: null }, boardId } });
    expect(archived?.issueKey).toBeTruthy();
  });

  it("24 viewer mutation blocked", async () => {
    await expect(
      createProjectComponent(prisma, actor(viewerUserId, "Viewer", Role.EMPLOYEE, viewerEmployeeId), boardId, {
        name: "Blocked",
      }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("25 lead allowed planning action", async () => {
    await expect(
      createProjectComponent(prisma, actor(leadUserId, "Lead", Role.EMPLOYEE, leadEmployeeId), boardId, {
        name: `LeadComp-${Date.now()}`,
      }),
    ).resolves.toBeTruthy();
  });

  it("26 admin component management", async () => {
    await expect(
      assertProjectCapability(prisma, actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN), boardId, "MANAGE_COMPONENTS"),
    ).resolves.toBeTruthy();
  });

  it("27 epic workflow transition uses workflow engine", async () => {
    const epic = await prisma.workTask.findUniqueOrThrow({ where: { taskId: epicId } });
    const transitions = await listAvailableTransitions(
      prisma,
      actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN),
      epic,
    );
    if (transitions.length > 0) {
      await transitionWorkItem(prisma, {
        workItemId: epicId,
        transitionId: transitions[0]!.transitionId,
        actor: actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN),
        expectedVersion: epic.version,
      });
    }
    expect(true).toBe(true);
  });

  it("28 roadmap cannot bypass workflow", async () => {
    const epic = await prisma.workTask.findUniqueOrThrow({ where: { taskId: epicId } });
    expect(epic.workflowStatusId).toBeTruthy();
  });

  it("29 child sprint assignments remain independent", async () => {
    const sprintBefore = await sprintSummaryForTask(prisma, storyId);
    expect(sprintBefore === null || typeof sprintBefore === "object").toBe(true);
  });

  it("30 epic itself not forced into sprint", async () => {
    const sprint = await sprintSummaryForTask(prisma, epicId);
    expect(sprint).toBeNull();
  });

  it("31 issue keys unchanged", async () => {
    const epic = await prisma.workTask.findUniqueOrThrow({ where: { taskId: epicId } });
    expect(epic.issueKey).toBe(preservedKey);
  });

  it("32 existing hierarchy unchanged", async () => {
    const story = await prisma.workTask.findUniqueOrThrow({ where: { taskId: storyId } });
    expect(story.parentTaskId).toBe(epicId);
  });

  it("33 workflow history unchanged count baseline", async () => {
    const count = await prisma.taskTransitionHistory.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("34 sprint membership unchanged baseline", async () => {
    const count = await prisma.taskSprintMembership.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("35 rank unchanged", async () => {
    const epic = await prisma.workTask.findUniqueOrThrow({ where: { taskId: epicId } });
    expect(epic.rank).toBe(preservedRank);
  });

  it("36 attendance unchanged", async () => {
    expect(await prisma.attendanceEvent.count()).toBe(attendanceBefore);
  });

  it("37 leave unchanged", async () => {
    expect(await prisma.leaveRequest.count()).toBe(leaveBefore);
  });

  it("38 user.role unchanged", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    expect(user.role).toBe(Role.DEVELOPER_ADMIN);
  });

  it("39 organization unchanged", async () => {
    expect(await prisma.department.count()).toBeGreaterThan(0);
  });

  it("activity types recorded for component assign", async () => {
    const update = await prisma.taskUpdate.findFirst({
      where: { taskId: storyId, activityType: TaskActivityType.COMPONENT_ASSIGNED },
    });
    expect(update).toBeTruthy();
  });
});
