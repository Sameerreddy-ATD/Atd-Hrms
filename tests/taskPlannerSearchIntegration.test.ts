/**
 * Task Planner Search + Saved Views — DB integration matrix (no skips when RUN_SEARCH_INTEGRATION=1).
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
  TaskRelationType,
  TaskSavedViewScope,
  TaskStatus,
  TaskStatusCategory,
} from "@prisma/client";
import type express from "express";
import { HttpError } from "../server/src/errors.js";
import { assertBoardAccess } from "../server/src/taskBoardAccess.js";
import { allocateIssueKey } from "../server/src/taskIssueKeys.js";
import {
  createProjectComponent,
  setTaskComponentsInTx,
} from "../server/src/taskComponentEngine.js";
import {
  createProjectLabel,
  setTaskLabels,
} from "../server/src/taskLabelEngine.js";
import { createWorkTaskRelation } from "../server/src/taskRelationEngine.js";
import { watchWorkItem } from "../server/src/taskWatcherEngine.js";
import {
  assignTaskToSprintInTx,
  createSprint,
} from "../server/src/taskSprintEngine.js";
import {
  ensureProjectWorkflows,
  workflowForIssueType,
} from "../server/src/taskWorkflowEngine.js";
import {
  parseFilterConfig,
  taskFilterConfigSchema,
  defaultColumnConfig,
  defaultSortConfig,
  type TaskFilterConfig,
  type TaskSortConfig,
  type TaskColumnConfig,
} from "../server/src/taskFilterSchema.js";
import {
  searchWorkItems,
  queryFilteredWorkItems,
} from "../server/src/taskSearchEngine.js";
import {
  createSavedView,
  getSavedView,
  updateSavedView,
  deleteSavedView,
  executeSavedView,
  listSavedViews,
} from "../server/src/taskSavedViewEngine.js";

const run = process.env.RUN_SEARCH_INTEGRATION === "1";
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

const boardAccessForTest = async (user: Actor, boardId: string) => {
  await assertBoardAccess(user, boardId);
};

describe.runIf(run)("Task Planner Search + Saved Views DB matrix", () => {
  let awfBoardId = "";
  let payBoardId = "";
  let awfStageId = "";
  let adminUserId = "";
  let leadUserId = "";
  let memberUserId = "";
  let viewerUserId = "";
  let outsiderUserId = "";
  let leadEmployeeId = "";
  let memberEmployeeId = "";
  let viewerEmployeeId = "";
  let outsiderEmployeeId = "";
  let awf1Id = "";
  let awf2Id = "";
  let awf3ArchivedId = "";
  let pay1Id = "";
  let epicId = "";
  let awf1Key = "";
  let awf2Key = "";
  let pay1Key = "";
  let awfKeyPrefix = "";
  let payKeyPrefix = "";
  let componentId = "";
  let labelId = "";
  let sprintId = "";
  let workflowStatusTodoId = "";
  let workflowStatusDoneId = "";
  let personalViewId = "";
  let projectViewId = "";
  let payProjectViewId = "";
  let blocksRelationId = "";
  let commentId = "";
  let attachmentId = "";
  let preservedRank = 1000;
  let preservedWorkflowStatusId = "";
  let transitionHistoryBefore = 0;
  let sprintMembershipBefore = 0;
  let componentLinkBefore = 0;
  let commentCountBefore = 0;
  let attachmentCountBefore = 0;
  let blocksRelationBefore = 0;
  let watcherCountBefore = 0;
  let attendanceBefore = 0;
  let leaveBefore = 0;
  let orgBefore = 0;
  let userRoleBefore: Role | "" = "";

  beforeAll(async () => {
    attendanceBefore = await prisma.attendanceEvent.count();
    leaveBefore = await prisma.leaveRequest.count();
    orgBefore = await prisma.department.count();
    const stamp = Date.now().toString(36);

    const admin = await prisma.user.create({
      data: {
        email: `sr-admin-${stamp}@test.local`,
        name: "Search Admin",
        role: Role.DEVELOPER_ADMIN,
        passwordHash: "x",
      },
    });
    adminUserId = admin.id;
    userRoleBefore = admin.role;

    const leadEmp = await prisma.employee.create({
      data: {
        employeeCode: `SRL-${stamp}`,
        name: "Search Lead",
        email: `sr-lead-${stamp}@test.local`,
      },
    });
    leadEmployeeId = leadEmp.employeeId;
    const leadUser = await prisma.user.create({
      data: {
        email: `sr-lead-${stamp}@test.local`,
        name: "Search Lead",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: leadEmployeeId,
      },
    });
    leadUserId = leadUser.id;

    const memberEmp = await prisma.employee.create({
      data: {
        employeeCode: `SRM-${stamp}`,
        name: "Search Member",
        email: `sr-member-${stamp}@test.local`,
      },
    });
    memberEmployeeId = memberEmp.employeeId;
    const memberUser = await prisma.user.create({
      data: {
        email: `sr-member-${stamp}@test.local`,
        name: "Search Member",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: memberEmployeeId,
      },
    });
    memberUserId = memberUser.id;

    const viewerEmp = await prisma.employee.create({
      data: {
        employeeCode: `SRV-${stamp}`,
        name: "Search Viewer",
        email: `sr-viewer-${stamp}@test.local`,
      },
    });
    viewerEmployeeId = viewerEmp.employeeId;
    const viewerUser = await prisma.user.create({
      data: {
        email: `sr-viewer-${stamp}@test.local`,
        name: "Search Viewer",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: viewerEmployeeId,
      },
    });
    viewerUserId = viewerUser.id;

    const outsiderEmp = await prisma.employee.create({
      data: {
        employeeCode: `SRO-${stamp}`,
        name: "Search Outsider",
        email: `sr-out-${stamp}@test.local`,
      },
    });
    outsiderEmployeeId = outsiderEmp.employeeId;
    const outsiderUser = await prisma.user.create({
      data: {
        email: `sr-out-${stamp}@test.local`,
        name: "Search Outsider",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: outsiderEmployeeId,
      },
    });
    outsiderUserId = outsiderUser.id;

    const awfBoard = await prisma.taskBoard.create({
      data: {
        name: `Anytime Workforce ${stamp}`,
        keyPrefix: `AWF${stamp.slice(-3).toUpperCase()}`.slice(0, 8),
        nextIssueNumber: 4,
        accessType: TaskBoardAccessType.MEMBER_GATED,
        createdByUserId: adminUserId,
        leadEmployeeId,
        stages: {
          create: [
            {
              name: "Backlog",
              color: "SLATE",
              sortOrder: 0,
              status: TaskStatus.TODO,
              statusCategory: TaskStatusCategory.TODO,
            },
            {
              name: "Done",
              color: "EMERALD",
              sortOrder: 1,
              status: TaskStatus.COMPLETED,
              isCompleted: true,
              statusCategory: TaskStatusCategory.DONE,
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
    awfBoardId = awfBoard.boardId;
    awfKeyPrefix = awfBoard.keyPrefix!;
    awf1Key = `${awfKeyPrefix}-1`;
    awf2Key = `${awfKeyPrefix}-2`;
    awfStageId = awfBoard.stages[0]!.stageId;
    await ensureProjectWorkflows(prisma, awfBoardId);
    const taskWorkflow = await workflowForIssueType(prisma, awfBoardId, TaskIssueType.TASK);
    const storyWorkflow = await workflowForIssueType(prisma, awfBoardId, TaskIssueType.STORY);
    const epicWorkflow = await workflowForIssueType(prisma, awfBoardId, TaskIssueType.EPIC);
    workflowStatusTodoId = taskWorkflow.statuses.find((s) => s.isInitial)?.statusId ?? taskWorkflow.statuses[0]!.statusId;
    workflowStatusDoneId =
      taskWorkflow.statuses.find((s) => s.category === TaskStatusCategory.DONE)?.statusId ??
      taskWorkflow.statuses[taskWorkflow.statuses.length - 1]!.statusId;

    const payBoard = await prisma.taskBoard.create({
      data: {
        name: `Payroll ${stamp}`,
        keyPrefix: `PAY${stamp.slice(-3).toUpperCase()}`.slice(0, 8),
        nextIssueNumber: 2,
        accessType: TaskBoardAccessType.MEMBER_GATED,
        createdByUserId: adminUserId,
        leadEmployeeId,
        stages: {
          create: [
            {
              name: "Backlog",
              color: "SLATE",
              sortOrder: 0,
              status: TaskStatus.TODO,
              statusCategory: TaskStatusCategory.TODO,
            },
          ],
        },
        members: {
          create: [
            { employeeId: leadEmployeeId, role: TaskProjectRole.PROJECT_LEAD },
            { employeeId: memberEmployeeId, role: TaskProjectRole.MEMBER },
          ],
        },
      },
    });
    payBoardId = payBoard.boardId;
    payKeyPrefix = payBoard.keyPrefix!;
    pay1Key = `${payKeyPrefix}-1`;
    await ensureProjectWorkflows(prisma, payBoardId);
    const payWorkflow = await workflowForIssueType(prisma, payBoardId, TaskIssueType.TASK);
    const payStageId = (
      await prisma.taskStage.findFirst({ where: { boardId: payBoardId } })
    )!.stageId;
    const payStatusId = payWorkflow.statuses[0]!.statusId;

    const epicInitial = epicWorkflow.statuses[0]!;
    const epic = await prisma.workTask.create({
      data: {
        title: "Workforce epic",
        boardId: awfBoardId,
        stageId: awfStageId,
        workflowStatusId: epicInitial.statusId,
        issueNumber: 10,
        issueKey: `${awfKeyPrefix}-10`,
        issueType: TaskIssueType.EPIC,
        rank: 500,
        backlogRank: 500,
        priority: TaskPriority.MEDIUM,
        createdByUserId: adminUserId,
        reporterUserId: adminUserId,
      },
    });
    epicId = epic.taskId;

    const overdueDate = new Date("2020-01-01T00:00:00.000Z");
    const awf1 = await prisma.workTask.create({
      data: {
        title: "Mobile attendance",
        boardId: awfBoardId,
        stageId: awfStageId,
        workflowStatusId: workflowStatusTodoId,
        issueNumber: 1,
        issueKey: awf1Key,
        issueType: TaskIssueType.TASK,
        rank: preservedRank,
        backlogRank: preservedRank,
        priority: TaskPriority.HIGH,
        dueDate: overdueDate,
        createdByUserId: adminUserId,
        reporterUserId: adminUserId,
        assignments: {
          create: [{ employeeId: memberEmployeeId, assignedByUserId: adminUserId }],
        },
        updates: {
          create: {
            authorUserId: adminUserId,
            activityType: TaskActivityType.COMMENT,
            message: "search seed comment",
          },
        },
        attachments: {
          create: {
            fileName: "search-seed.txt",
            mimeType: "text/plain",
            sizeBytes: 4,
            storageKey: `sr-seed-${stamp}`,
            uploadedById: adminUserId,
          },
        },
      },
      include: { updates: true, attachments: true },
    });
    awf1Id = awf1.taskId;
    preservedWorkflowStatusId = awf1.workflowStatusId;
    commentId = awf1.updates[0]!.updateId;
    attachmentId = awf1.attachments[0]!.attachmentId;

    const storyInitial = storyWorkflow.statuses[0]!;
    const awf2 = await prisma.workTask.create({
      data: {
        title: "Leave approval",
        boardId: awfBoardId,
        stageId: awfStageId,
        workflowStatusId: storyInitial.statusId,
        issueNumber: 2,
        issueKey: awf2Key,
        issueType: TaskIssueType.STORY,
        rank: 1100,
        backlogRank: 1100,
        priority: TaskPriority.MEDIUM,
        parentTaskId: epicId,
        createdByUserId: memberUserId,
        reporterUserId: memberUserId,
        assignments: {
          create: [{ employeeId: leadEmployeeId, assignedByUserId: adminUserId }],
        },
      },
    });
    awf2Id = awf2.taskId;

    awf3ArchivedId = (
      await prisma.workTask.create({
        data: {
          title: "Archived workforce item",
          boardId: awfBoardId,
          stageId: awfStageId,
          workflowStatusId: workflowStatusTodoId,
          issueNumber: 3,
          issueKey: `${awfKeyPrefix}-3`,
          issueType: TaskIssueType.TASK,
          rank: 1200,
          backlogRank: 1200,
          priority: TaskPriority.LOW,
          archivedAt: new Date("2025-01-01"),
          createdByUserId: adminUserId,
          reporterUserId: adminUserId,
        },
      })
    ).taskId;

    pay1Id = (
      await prisma.workTask.create({
        data: {
          title: "Payment issue",
          boardId: payBoardId,
          stageId: payStageId,
          workflowStatusId: payStatusId,
          issueNumber: 1,
          issueKey: pay1Key,
          issueType: TaskIssueType.TASK,
          rank: 1000,
          backlogRank: 1000,
          priority: TaskPriority.URGENT,
          createdByUserId: adminUserId,
          reporterUserId: adminUserId,
        },
      })
    ).taskId;

    const adminActor = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const component = await createProjectComponent(prisma, adminActor, awfBoardId, {
      name: "Mobile App",
    });
    componentId = component.id;
    await prisma.$transaction((tx) =>
      setTaskComponentsInTx(tx, {
        taskId: awf1Id,
        boardId: awfBoardId,
        componentIds: [componentId],
        actorUserId: adminUserId,
      }),
    );

    const label = await createProjectLabel(prisma, adminActor, awfBoardId, {
      name: "HRMS",
      color: "blue",
    });
    labelId = label.id;
    const awf1Row = await prisma.workTask.findUniqueOrThrow({ where: { taskId: awf1Id } });
    await setTaskLabels(prisma, adminActor, awf1Id, [labelId], awf1Row.version);

    const sprint = await createSprint(prisma, {
      boardId: awfBoardId,
      name: "Search Sprint",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-14"),
      actor: actor(leadUserId, "Search Lead", Role.EMPLOYEE, leadEmployeeId),
    });
    sprintId = sprint.sprintId;
    await prisma.$transaction((tx) =>
      assignTaskToSprintInTx(tx, {
        taskId: awf2Id,
        sprintId,
        actorUserId: leadUserId,
      }),
    );

    const blocksRel = await createWorkTaskRelation(
      prisma,
      adminActor,
      { sourceTaskId: awf1Id, targetTaskId: awf2Id, relationType: TaskRelationType.BLOCKS },
      boardAccessForTest,
    );
    blocksRelationId = blocksRel.id;

    await watchWorkItem(
      prisma,
      actor(memberUserId, "Search Member", Role.EMPLOYEE, memberEmployeeId),
      awf2Id,
      boardAccessForTest,
    );

    transitionHistoryBefore = await prisma.taskTransitionHistory.count();
    sprintMembershipBefore = await prisma.taskSprintMembership.count({
      where: { taskId: awf2Id, sprintId, removedAt: null },
    });
    componentLinkBefore = await prisma.workTaskComponent.count({ where: { taskId: awf1Id } });
    commentCountBefore = await prisma.taskUpdate.count({
      where: { taskId: awf1Id, activityType: TaskActivityType.COMMENT },
    });
    attachmentCountBefore = await prisma.taskAttachment.count({ where: { taskId: awf1Id } });
    blocksRelationBefore = await prisma.workTaskRelation.count({
      where: { relationId: blocksRelationId },
    });
    watcherCountBefore = await prisma.workItemWatcher.count({ where: { taskId: awf2Id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── SEARCH (1–10) ────────────────────────────────────────────────────────

  it("1 exact issue key search", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const { results } = await searchWorkItems(prisma, admin, {
      query: awf1Key,
      boardId: awfBoardId,
      limit: 10,
      offset: 0,
    });
    expect(results.some((r) => r.issueKey === awf1Key)).toBe(true);
    expect(results[0]?.issueKey).toBe(awf1Key);
  });

  it("2 issue prefix search", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const { results } = await searchWorkItems(prisma, admin, {
      query: awfKeyPrefix,
      boardId: awfBoardId,
      limit: 20,
      offset: 0,
    });
    const keys = results.map((r) => r.issueKey);
    expect(keys).toContain(awf1Key);
    expect(keys).toContain(awf2Key);
  });

  it("3 title search", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const { results } = await searchWorkItems(prisma, admin, {
      query: "attendance",
      boardId: awfBoardId,
      limit: 10,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
  });

  it("4 component search", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const { results } = await searchWorkItems(prisma, admin, {
      query: "Mobile App",
      boardId: awfBoardId,
      limit: 10,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
    expect(results[0]?.components.some((c) => c.name === "Mobile App")).toBe(true);
  });

  it("5 label search", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const { results } = await searchWorkItems(prisma, admin, {
      query: "HRMS",
      boardId: awfBoardId,
      limit: 10,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
  });

  it("6 reporter search", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const { results } = await searchWorkItems(prisma, admin, {
      query: "Search Admin",
      boardId: awfBoardId,
      limit: 10,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
  });

  it("7 assignee search", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const { results } = await searchWorkItems(prisma, admin, {
      query: "Search Member",
      boardId: awfBoardId,
      limit: 10,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
  });

  it("8 pagination", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const all = await searchWorkItems(prisma, admin, {
      query: awfKeyPrefix,
      boardId: awfBoardId,
      limit: 20,
      offset: 0,
    });
    expect(all.results.length).toBeGreaterThanOrEqual(2);

    const page1 = await searchWorkItems(prisma, admin, {
      query: awfKeyPrefix,
      boardId: awfBoardId,
      limit: 1,
      offset: 0,
    });
    const page2 = await searchWorkItems(prisma, admin, {
      query: awfKeyPrefix,
      boardId: awfBoardId,
      limit: 1,
      offset: 1,
    });
    expect(page1.results).toHaveLength(1);
    expect(page2.results).toHaveLength(1);
    expect(page2.results[0]!.workItemId).not.toBe(page1.results[0]!.workItemId);
  });

  it("9 stable sort", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const params = { query: awfKeyPrefix, boardId: awfBoardId, limit: 10, offset: 0 };
    const first = await searchWorkItems(prisma, admin, params);
    const second = await searchWorkItems(prisma, admin, params);
    expect(first.results.map((r) => r.workItemId)).toEqual(
      second.results.map((r) => r.workItemId),
    );
  });

  it("10 unauthorized project excluded", async () => {
    const viewer = actor(viewerUserId, "Search Viewer", Role.EMPLOYEE, viewerEmployeeId);
    const member = actor(memberUserId, "Search Member", Role.EMPLOYEE, memberEmployeeId);
    const viewerResults = await searchWorkItems(prisma, viewer, {
      query: "Payment",
      limit: 20,
      offset: 0,
    });
    expect(viewerResults.results.some((r) => r.issueKey === pay1Key)).toBe(false);

    const memberResults = await searchWorkItems(prisma, member, {
      query: pay1Key,
      limit: 10,
      offset: 0,
    });
    expect(memberResults.results.some((r) => r.issueKey === pay1Key)).toBe(true);
  });

  // ── FILTERS (11–25) ──────────────────────────────────────────────────────

  it("11 filter by type", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const filter = parseFilterConfig({ issueTypes: [TaskIssueType.TASK] });
    const { results } = await queryFilteredWorkItems(prisma, admin, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
    expect(results.every((r) => r.workType === TaskIssueType.TASK)).toBe(true);
  });

  it("12 filter by status", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const filter = parseFilterConfig({ workflowStatusIds: [workflowStatusTodoId] });
    const { results } = await queryFilteredWorkItems(prisma, admin, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
  });

  it("13 filter by category", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const filter = parseFilterConfig({ statusCategories: [TaskStatusCategory.TODO] });
    const { results } = await queryFilteredWorkItems(prisma, admin, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
  });

  it("14 filter by priority", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const filter = parseFilterConfig({ priorities: [TaskPriority.HIGH] });
    const { results } = await queryFilteredWorkItems(prisma, admin, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
    expect(results.every((r) => r.priority === TaskPriority.HIGH)).toBe(true);
  });

  it("15 filter by assignee", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const filter = parseFilterConfig({ assigneeEmployeeIds: [memberEmployeeId] });
    const { results } = await queryFilteredWorkItems(prisma, admin, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
  });

  it("16 filter by reporter", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const filter = parseFilterConfig({ reporterUserIds: [memberUserId] });
    const { results } = await queryFilteredWorkItems(prisma, admin, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf2Id)).toBe(true);
  });

  it("17 filter by epic", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const filter = parseFilterConfig({ epicId });
    const { results } = await queryFilteredWorkItems(prisma, admin, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf2Id)).toBe(true);
    expect(results.every((r) => r.epic?.id === epicId)).toBe(true);
  });

  it("18 filter by component", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const filter = parseFilterConfig({ componentIds: [componentId] });
    const { results } = await queryFilteredWorkItems(prisma, admin, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
  });

  it("19 filter by label", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const filter = parseFilterConfig({ labelIds: [labelId] });
    const { results } = await queryFilteredWorkItems(prisma, admin, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
  });

  it("20 filter by sprint", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const filter = parseFilterConfig({ sprintId });
    const { results } = await queryFilteredWorkItems(prisma, admin, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf2Id)).toBe(true);
    expect(results.every((r) => r.sprint?.sprintId === sprintId)).toBe(true);
  });

  it("21 filter no-sprint", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const filter = parseFilterConfig({ sprintId: null });
    const { results } = await queryFilteredWorkItems(prisma, admin, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
    expect(results.some((r) => r.workItemId === awf2Id)).toBe(false);
  });

  it("22 filter overdue", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const filter = parseFilterConfig({ dueMode: "overdue" });
    const { results } = await queryFilteredWorkItems(prisma, admin, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf1Id)).toBe(true);
  });

  it("23 filter watching-me", async () => {
    const member = actor(memberUserId, "Search Member", Role.EMPLOYEE, memberEmployeeId);
    const filter = parseFilterConfig({ watchingMe: true });
    const { results } = await queryFilteredWorkItems(prisma, member, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf2Id)).toBe(true);
  });

  it("24 filter blocked", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const filter = parseFilterConfig({ blocked: true });
    const { results } = await queryFilteredWorkItems(prisma, admin, {
      filter,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(results.some((r) => r.workItemId === awf2Id)).toBe(true);
  });

  it("25 filter archived", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const withoutArchived = parseFilterConfig({ includeArchived: false });
    const hidden = await queryFilteredWorkItems(prisma, admin, {
      filter: withoutArchived,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(hidden.results.some((r) => r.workItemId === awf3ArchivedId)).toBe(false);

    const withArchived = parseFilterConfig({ includeArchived: true });
    const shown = await queryFilteredWorkItems(prisma, admin, {
      filter: withArchived,
      boardId: awfBoardId,
      limit: 50,
      offset: 0,
    });
    expect(shown.results.some((r) => r.workItemId === awf3ArchivedId)).toBe(true);
  });

  // ── SAVED VIEWS (26–40) ──────────────────────────────────────────────────

  const sampleFilter = (): TaskFilterConfig =>
    parseFilterConfig({
      boardIds: [awfBoardId],
      issueTypes: [TaskIssueType.TASK],
      priorities: [TaskPriority.HIGH],
    });

  const sampleSort = (): TaskSortConfig => ({ field: "title", direction: "asc" });

  const sampleColumns = (): TaskColumnConfig => ({
    visible: ["issueKey", "title", "status", "priority", "labels"],
  });

  it("26 personal create", async () => {
    const member = actor(memberUserId, "Search Member", Role.EMPLOYEE, memberEmployeeId);
    const view = await createSavedView(prisma, member, {
      name: "My high tasks",
      scope: TaskSavedViewScope.PERSONAL,
      boardId: awfBoardId,
      filterConfig: sampleFilter(),
      sortConfig: sampleSort(),
      columnConfig: sampleColumns(),
    });
    personalViewId = view.id;
    expect(view.scope).toBe(TaskSavedViewScope.PERSONAL);
    expect(view.ownerUserId).toBe(memberUserId);
  });

  it("27 load personal", async () => {
    const member = actor(memberUserId, "Search Member", Role.EMPLOYEE, memberEmployeeId);
    const view = await getSavedView(prisma, member, personalViewId);
    expect(view.name).toBe("My high tasks");
    expect(view.filterConfig.issueTypes).toEqual([TaskIssueType.TASK]);
  });

  it("28 update", async () => {
    const member = actor(memberUserId, "Search Member", Role.EMPLOYEE, memberEmployeeId);
    const existing = await getSavedView(prisma, member, personalViewId);
    const updated = await updateSavedView(prisma, member, personalViewId, {
      name: "My high tasks (renamed)",
      version: existing.version,
    });
    expect(updated.name).toBe("My high tasks (renamed)");
    expect(updated.version).toBe(existing.version + 1);
  });

  it("29 delete", async () => {
    const member = actor(memberUserId, "Search Member", Role.EMPLOYEE, memberEmployeeId);
    const temp = await createSavedView(prisma, member, {
      name: "Disposable view",
      scope: TaskSavedViewScope.PERSONAL,
      filterConfig: sampleFilter(),
      sortConfig: defaultSortConfig,
      columnConfig: defaultColumnConfig,
    });
    await deleteSavedView(prisma, member, temp.id);
    await expect(getSavedView(prisma, member, temp.id)).rejects.toBeInstanceOf(HttpError);
  });

  it("30 owner isolation", async () => {
    const lead = actor(leadUserId, "Search Lead", Role.EMPLOYEE, leadEmployeeId);
    await expect(getSavedView(prisma, lead, personalViewId)).rejects.toBeInstanceOf(HttpError);
  });

  it("31 project create", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const view = await createSavedView(prisma, admin, {
      name: "AWF sprint board",
      scope: TaskSavedViewScope.PROJECT,
      boardId: awfBoardId,
      filterConfig: parseFilterConfig({ sprintId }),
      sortConfig: { field: "priority", direction: "desc" },
      columnConfig: sampleColumns(),
    });
    projectViewId = view.id;
    expect(view.scope).toBe(TaskSavedViewScope.PROJECT);
    expect(view.boardId).toBe(awfBoardId);
  });

  it("32 project read", async () => {
    const viewer = actor(viewerUserId, "Search Viewer", Role.EMPLOYEE, viewerEmployeeId);
    const view = await getSavedView(prisma, viewer, projectViewId);
    expect(view.name).toBe("AWF sprint board");
    const listed = await listSavedViews(prisma, viewer, awfBoardId);
    expect(listed.some((v) => v.id === projectViewId)).toBe(true);
  });

  it("33 viewer mutation blocked", async () => {
    const viewer = actor(viewerUserId, "Search Viewer", Role.EMPLOYEE, viewerEmployeeId);
    await expect(
      createSavedView(prisma, viewer, {
        name: "Viewer project view",
        scope: TaskSavedViewScope.PROJECT,
        boardId: awfBoardId,
        filterConfig: sampleFilter(),
        sortConfig: defaultSortConfig,
        columnConfig: defaultColumnConfig,
      }),
    ).rejects.toBeInstanceOf(HttpError);
    const existing = await getSavedView(prisma, viewer, projectViewId);
    await expect(
      updateSavedView(prisma, viewer, projectViewId, {
        name: "Hijacked",
        version: existing.version,
      }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("34 lost access no leak", async () => {
    const admin = actor(adminUserId, "Search Admin", Role.DEVELOPER_ADMIN);
    const member = actor(memberUserId, "Search Member", Role.EMPLOYEE, memberEmployeeId);
    const payView = await createSavedView(prisma, admin, {
      name: "Payroll triage",
      scope: TaskSavedViewScope.PROJECT,
      boardId: payBoardId,
      filterConfig: parseFilterConfig({ boardIds: [payBoardId] }),
      sortConfig: defaultSortConfig,
      columnConfig: defaultColumnConfig,
    });
    payProjectViewId = payView.id;
    await getSavedView(prisma, member, payProjectViewId);

    await prisma.taskBoardMember.deleteMany({
      where: { boardId: payBoardId, employeeId: memberEmployeeId },
    });

    await expect(getSavedView(prisma, member, payProjectViewId)).rejects.toBeInstanceOf(HttpError);
    await expect(
      executeSavedView(prisma, member, payProjectViewId, { limit: 10, offset: 0 }),
    ).rejects.toBeInstanceOf(HttpError);

    await expect(listSavedViews(prisma, member, payBoardId)).rejects.toBeInstanceOf(HttpError);
    const listed = await listSavedViews(prisma, member);
    expect(listed.some((v) => v.id === payProjectViewId)).toBe(false);

    await prisma.taskBoardMember.create({
      data: { boardId: payBoardId, employeeId: memberEmployeeId, role: TaskProjectRole.MEMBER },
    });
  });

  it("35 config validation", async () => {
    const parsed = parseFilterConfig({
      v: 1,
      boardIds: [awfBoardId],
      issueTypes: [TaskIssueType.STORY],
      watchingMe: true,
    });
    expect(parsed.v).toBe(1);
    expect(parsed.boardIds).toEqual([awfBoardId]);
    expect(parsed.watchingMe).toBe(true);
  });

  it("36 invalid rejected", async () => {
    const bad = taskFilterConfigSchema.safeParse({
      issueTypes: ["NOT_A_TYPE"],
      dueMode: "never",
    });
    expect(bad.success).toBe(false);

    const member = actor(memberUserId, "Search Member", Role.EMPLOYEE, memberEmployeeId);
    await expect(
      createSavedView(prisma, member, {
        name: "Bad filter view",
        scope: TaskSavedViewScope.PERSONAL,
        filterConfig: { issueTypes: ["INVALID"] } as unknown as TaskFilterConfig,
        sortConfig: defaultSortConfig,
        columnConfig: defaultColumnConfig,
      }),
    ).rejects.toThrow();
  });

  it("37 default uniqueness", async () => {
    const member = actor(memberUserId, "Search Member", Role.EMPLOYEE, memberEmployeeId);
    const first = await createSavedView(prisma, member, {
      name: "Default A",
      scope: TaskSavedViewScope.PERSONAL,
      boardId: awfBoardId,
      filterConfig: sampleFilter(),
      sortConfig: defaultSortConfig,
      columnConfig: defaultColumnConfig,
      isDefault: true,
    });
    const second = await createSavedView(prisma, member, {
      name: "Default B",
      scope: TaskSavedViewScope.PERSONAL,
      boardId: awfBoardId,
      filterConfig: sampleFilter(),
      sortConfig: defaultSortConfig,
      columnConfig: defaultColumnConfig,
      isDefault: true,
    });
    const refreshedFirst = await getSavedView(prisma, member, first.id);
    expect(refreshedFirst.isDefault).toBe(false);
    expect(second.isDefault).toBe(true);
  });

  it("38 filters preserved", async () => {
    const member = actor(memberUserId, "Search Member", Role.EMPLOYEE, memberEmployeeId);
    const filter = parseFilterConfig({
      boardIds: [awfBoardId],
      blocked: true,
    });
    const view = await createSavedView(prisma, member, {
      name: "Filter preserve",
      scope: TaskSavedViewScope.PERSONAL,
      filterConfig: filter,
      sortConfig: defaultSortConfig,
      columnConfig: defaultColumnConfig,
    });
    const loaded = await getSavedView(prisma, member, view.id);
    expect(loaded.filterConfig.blocked).toBe(true);
    const executed = await executeSavedView(prisma, member, view.id, { limit: 20, offset: 0 });
    expect(executed.results.some((r) => r.workItemId === awf2Id)).toBe(true);
  });

  it("39 sort preserved", async () => {
    const member = actor(memberUserId, "Search Member", Role.EMPLOYEE, memberEmployeeId);
    const sort: TaskSortConfig = { field: "title", direction: "asc" };
    const view = await createSavedView(prisma, member, {
      name: "Sort preserve",
      scope: TaskSavedViewScope.PERSONAL,
      boardId: awfBoardId,
      filterConfig: parseFilterConfig({ boardIds: [awfBoardId] }),
      sortConfig: sort,
      columnConfig: defaultColumnConfig,
    });
    const loaded = await getSavedView(prisma, member, view.id);
    expect(loaded.sortConfig).toEqual(sort);
    const executed = await executeSavedView(prisma, member, view.id, { limit: 50, offset: 0 });
    const titles = executed.results.map((r) => r.title);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b));
    expect(titles).toEqual(sorted);
  });

  it("40 column preserved", async () => {
    const member = actor(memberUserId, "Search Member", Role.EMPLOYEE, memberEmployeeId);
    const columns = sampleColumns();
    const view = await createSavedView(prisma, member, {
      name: "Column preserve",
      scope: TaskSavedViewScope.PERSONAL,
      filterConfig: sampleFilter(),
      sortConfig: defaultSortConfig,
      columnConfig: columns,
    });
    const loaded = await getSavedView(prisma, member, view.id);
    expect(loaded.columnConfig.visible).toEqual(columns.visible);
  });

  // ── PRESERVATION (41–47) ─────────────────────────────────────────────────

  it("41 issue keys unchanged", async () => {
    const awf1 = await prisma.workTask.findUniqueOrThrow({ where: { taskId: awf1Id } });
    const awf2 = await prisma.workTask.findUniqueOrThrow({ where: { taskId: awf2Id } });
    const pay1 = await prisma.workTask.findUniqueOrThrow({ where: { taskId: pay1Id } });
    expect(awf1.issueKey).toBe(awf1Key);
    expect(awf2.issueKey).toBe(awf2Key);
    expect(pay1.issueKey).toBe(pay1Key);
  });

  it("42 workflow unchanged", async () => {
    const task = await prisma.workTask.findUniqueOrThrow({ where: { taskId: awf1Id } });
    expect(task.workflowStatusId).toBe(preservedWorkflowStatusId);
    expect(await prisma.taskTransitionHistory.count()).toBe(transitionHistoryBefore);
  });

  it("43 sprint unchanged", async () => {
    expect(
      await prisma.taskSprintMembership.count({
        where: { taskId: awf2Id, sprintId, removedAt: null },
      }),
    ).toBe(sprintMembershipBefore);
  });

  it("44 components unchanged", async () => {
    expect(await prisma.workTaskComponent.count({ where: { taskId: awf1Id } })).toBe(
      componentLinkBefore,
    );
    expect(
      await prisma.workTaskComponent.findFirst({
        where: { taskId: awf1Id, componentId },
      }),
    ).toBeTruthy();
  });

  it("45 collaboration unchanged", async () => {
    expect(
      await prisma.workTaskRelation.count({ where: { relationId: blocksRelationId } }),
    ).toBe(blocksRelationBefore);
    expect(await prisma.workItemWatcher.count({ where: { taskId: awf2Id } })).toBe(
      watcherCountBefore,
    );
  });

  it("46 rank unchanged", async () => {
    const task = await prisma.workTask.findUniqueOrThrow({ where: { taskId: awf1Id } });
    expect(task.rank).toBe(preservedRank);
  });

  it("47 comments attachments unchanged", async () => {
    expect(
      await prisma.taskUpdate.count({
        where: { taskId: awf1Id, activityType: TaskActivityType.COMMENT },
      }),
    ).toBe(commentCountBefore);
    expect(await prisma.taskAttachment.count({ where: { taskId: awf1Id } })).toBe(
      attachmentCountBefore,
    );
    const comment = await prisma.taskUpdate.findUnique({ where: { updateId: commentId } });
    expect(comment?.message).toBe("search seed comment");
    const attachment = await prisma.taskAttachment.findUnique({
      where: { attachmentId },
    });
    expect(attachment?.fileName).toBe("search-seed.txt");
  });

  // ── HRMS (48–51) ─────────────────────────────────────────────────────────

  it("48 attendance unchanged", async () => {
    expect(await prisma.attendanceEvent.count()).toBe(attendanceBefore);
  });

  it("49 leave unchanged", async () => {
    expect(await prisma.leaveRequest.count()).toBe(leaveBefore);
  });

  it("50 user role unchanged", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    expect(user.role).toBe(userRoleBefore);
  });

  it("51 organization unchanged", async () => {
    expect(await prisma.department.count()).toBe(orgBefore);
  });
});
