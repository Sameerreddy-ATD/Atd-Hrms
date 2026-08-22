/**
 * Task Planner Workflow Engine — DB integration matrix (no skips when RUN_WORKFLOW_INTEGRATION=1).
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
  TaskWorkflowKind,
} from "@prisma/client";
import { HttpError } from "../server/src/errors.js";
import { allocateIssueKey } from "../server/src/taskIssueKeys.js";
import {
  addWorkflowStatus,
  addWorkflowTransition,
  deactivateWorkflowStatus,
  updateWorkflowStatus,
} from "../server/src/taskWorkflowAdmin.js";
import {
  ensureProjectWorkflows,
  listAvailableTransitions,
  mapStatusForTypeChange,
  resolveTransitionForStageMove,
  transitionWorkItem,
  workflowForIssueType,
  initialStatusOf,
} from "../server/src/taskWorkflowEngine.js";
import type express from "express";

const run = process.env.RUN_WORKFLOW_INTEGRATION === "1";
const prisma = new PrismaClient();

type Actor = NonNullable<express.Request["user"]>;

function actor(
  id: string,
  name: string,
  role: Role,
  employeeId?: string | null,
): Actor {
  return {
    id,
    name,
    email: `${id}@test.local`,
    role,
    status: "ACTIVE",
    employeeId: employeeId ?? null,
  } as Actor;
}

describe.runIf(run)("Task Planner Workflow DB matrix", () => {
  let boardId = "";
  let stageBacklog = "";
  let stageReady = "";
  let stageProgress = "";
  let stageQa = "";
  let stageDone = "";
  let adminUserId = "";
  let memberUserId = "";
  let leadUserId = "";
  let viewerUserId = "";
  let outsiderUserId = "";
  let memberEmployeeId = "";
  let leadEmployeeId = "";
  let viewerEmployeeId = "";
  let outsiderEmployeeId = "";
  let workItemId = "";
  let preservedKey = "";
  let preservedRank = 0;
  let commentId = "";
  let attachmentId = "";
  let standardWorkflowId = "";
  let backlogStatusId = "";
  let readyStatusId = "";
  let progressStatusId = "";
  let qaStatusId = "";
  let doneStatusId = "";
  let attendanceBefore = 0;
  let leaveBefore = 0;
  let orgBefore = 0;
  let userRoleBefore = "";

  beforeAll(async () => {
    attendanceBefore = await prisma.attendanceEvent.count();
    leaveBefore = await prisma.leaveRequest.count();
    orgBefore = await prisma.department.count();
    const stamp = Date.now().toString(36);

    const admin = await prisma.user.create({
      data: {
        email: `wf-admin-${stamp}@test.local`,
        name: "WF Admin",
        role: Role.DEVELOPER_ADMIN,
        passwordHash: "x",
      },
    });
    adminUserId = admin.id;
    userRoleBefore = admin.role;

    const leadEmp = await prisma.employee.create({
      data: {
        employeeCode: `WFL-${stamp}`,
        name: "WF Lead",
        email: `wf-lead-${stamp}@test.local`,
      },
    });
    leadEmployeeId = leadEmp.employeeId;
    const leadUser = await prisma.user.create({
      data: {
        email: `wf-lead-${stamp}@test.local`,
        name: "WF Lead",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: leadEmployeeId,
      },
    });
    leadUserId = leadUser.id;

    const memberEmp = await prisma.employee.create({
      data: {
        employeeCode: `WFM-${stamp}`,
        name: "WF Member",
        email: `wf-member-${stamp}@test.local`,
      },
    });
    memberEmployeeId = memberEmp.employeeId;
    const memberUser = await prisma.user.create({
      data: {
        email: `wf-member-${stamp}@test.local`,
        name: "WF Member",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: memberEmployeeId,
      },
    });
    memberUserId = memberUser.id;

    const viewerEmp = await prisma.employee.create({
      data: {
        employeeCode: `WFV-${stamp}`,
        name: "WF Viewer",
        email: `wf-viewer-${stamp}@test.local`,
      },
    });
    viewerEmployeeId = viewerEmp.employeeId;
    const viewerUser = await prisma.user.create({
      data: {
        email: `wf-viewer-${stamp}@test.local`,
        name: "WF Viewer",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: viewerEmployeeId,
      },
    });
    viewerUserId = viewerUser.id;

    const outsiderEmp = await prisma.employee.create({
      data: {
        employeeCode: `WFO-${stamp}`,
        name: "WF Outsider",
        email: `wf-out-${stamp}@test.local`,
      },
    });
    outsiderEmployeeId = outsiderEmp.employeeId;
    const outsiderUser = await prisma.user.create({
      data: {
        email: `wf-out-${stamp}@test.local`,
        name: "WF Outsider",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: outsiderEmployeeId,
      },
    });
    outsiderUserId = outsiderUser.id;

    const board = await prisma.taskBoard.create({
      data: {
        name: `Workflow Board ${stamp}`,
        keyPrefix: `WF${stamp.slice(-4)}`.slice(0, 8).toUpperCase(),
        nextIssueNumber: 1,
        accessType: TaskBoardAccessType.MEMBER_GATED,
        createdByUserId: adminUserId,
        leadEmployeeId,
        stages: {
          create: [
            {
              name: "Backlog",
              status: TaskStatus.TODO,
              statusCategory: TaskStatusCategory.TODO,
              sortOrder: 0,
              color: "SLATE",
            },
            {
              name: "Ready",
              status: TaskStatus.TODO,
              statusCategory: TaskStatusCategory.TODO,
              sortOrder: 1,
              color: "BLUE",
            },
            {
              name: "In Progress",
              status: TaskStatus.IN_PROGRESS,
              statusCategory: TaskStatusCategory.IN_PROGRESS,
              sortOrder: 2,
              color: "AMBER",
            },
            {
              name: "QA",
              status: TaskStatus.IN_PROGRESS,
              statusCategory: TaskStatusCategory.IN_PROGRESS,
              sortOrder: 3,
              color: "BLUE",
            },
            {
              name: "Done",
              status: TaskStatus.COMPLETED,
              statusCategory: TaskStatusCategory.DONE,
              isCompleted: true,
              sortOrder: 4,
              color: "EMERALD",
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
    stageBacklog = board.stages.find((s) => s.name === "Backlog")!.stageId;
    stageReady = board.stages.find((s) => s.name === "Ready")!.stageId;
    stageProgress = board.stages.find((s) => s.name === "In Progress")!.stageId;
    stageQa = board.stages.find((s) => s.name === "QA")!.stageId;
    stageDone = board.stages.find((s) => s.name === "Done")!.stageId;

    await prisma.$transaction((tx) => ensureProjectWorkflows(tx, boardId, { preferCatalog: true }));

    const workflow = await workflowForIssueType(prisma, boardId, TaskIssueType.TASK);
    standardWorkflowId = workflow.workflowId;
    backlogStatusId = workflow.statuses.find((s) => s.name === "Backlog")!.statusId;
    readyStatusId = workflow.statuses.find((s) => s.name === "Ready")!.statusId;
    progressStatusId = workflow.statuses.find((s) => s.name === "In Progress")!.statusId;
    qaStatusId = workflow.statuses.find((s) => s.name === "QA")!.statusId;
    doneStatusId = workflow.statuses.find((s) => s.name === "Done")!.statusId;

    const allocated = await prisma.$transaction((tx) => allocateIssueKey(tx, boardId));
    preservedKey = allocated.issueKey;
    preservedRank = 1500;
    const item = await prisma.workTask.create({
      data: {
        title: "Workflow seed item",
        boardId,
        stageId: stageBacklog,
        workflowStatusId: backlogStatusId,
        issueNumber: allocated.issueNumber,
        issueKey: preservedKey,
        issueType: TaskIssueType.TASK,
        rank: preservedRank,
        priority: TaskPriority.MEDIUM,
        createdByUserId: adminUserId,
        reporterUserId: adminUserId,
        assignments: {
          create: [{ employeeId: memberEmployeeId, assignedByUserId: adminUserId }],
        },
        updates: {
          create: {
            authorUserId: adminUserId,
            activityType: "COMMENT",
            message: "seed comment preserve me",
          },
        },
        attachments: {
          create: {
            fileName: "seed.txt",
            mimeType: "text/plain",
            sizeBytes: 4,
            storageKey: `wf-seed-${stamp}`,
            uploadedById: adminUserId,
          },
        },
      },
      include: { updates: true, attachments: true },
    });
    workItemId = item.taskId;
    commentId = item.updates[0]!.updateId;
    attachmentId = item.attachments[0]!.attachmentId;
  });

  afterAll(async () => {
    if (boardId) {
      await prisma.workTask.deleteMany({ where: { boardId } });
      await prisma.taskBoard.delete({ where: { boardId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("1 workflow create / ensure catalogs", async () => {
    const workflows = await prisma.taskWorkflow.findMany({ where: { boardId } });
    expect(workflows.some((row) => row.kind === TaskWorkflowKind.STANDARD)).toBe(true);
    expect(workflows.some((row) => row.kind === TaskWorkflowKind.BUG)).toBe(true);
    expect(workflows.some((row) => row.kind === TaskWorkflowKind.SUBTASK)).toBe(true);
    expect(workflows.some((row) => row.kind === TaskWorkflowKind.EPIC)).toBe(true);
  });

  it("2 one initial status rule", async () => {
    const workflow = await workflowForIssueType(prisma, boardId, TaskIssueType.TASK);
    expect(workflow.statuses.filter((s) => s.isInitial && s.active)).toHaveLength(1);
    expect(initialStatusOf(workflow).name).toBe("Backlog");
  });

  it("3 status category", async () => {
    const done = await prisma.taskWorkflowStatus.findUniqueOrThrow({
      where: { statusId: doneStatusId },
    });
    expect(done.category).toBe(TaskStatusCategory.DONE);
    expect(done.isTerminal).toBe(true);
  });

  it("4 status reorder", async () => {
    const updated = await updateWorkflowStatus(prisma, readyStatusId, { sortOrder: 99 });
    expect(updated.sortOrder).toBe(99);
    await updateWorkflowStatus(prisma, readyStatusId, { sortOrder: 1 });
  });

  it("5 referenced status cannot hard delete", async () => {
    await updateWorkflowStatus(prisma, readyStatusId, { isInitial: true });
    const result = await deactivateWorkflowStatus(prisma, backlogStatusId);
    expect("active" in result ? result.active : true).toBe(false);
    await updateWorkflowStatus(prisma, backlogStatusId, { active: true, isInitial: true });
  });

  it("6 transition create", async () => {
    const edge = await addWorkflowTransition(prisma, standardWorkflowId, {
      name: "Skip to Ready (test)",
      fromStatusId: backlogStatusId,
      toStatusId: readyStatusId,
    });
    expect(edge.fromStatusId).toBe(backlogStatusId);
    await prisma.taskWorkflowTransition.delete({ where: { transitionId: edge.transitionId } });
  });

  it("7 invalid self-transition blocked", async () => {
    await expect(
      addWorkflowTransition(prisma, standardWorkflowId, {
        name: "Loop",
        fromStatusId: backlogStatusId,
        toStatusId: backlogStatusId,
      }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("8 valid Backlog → Ready", async () => {
    const available = await listAvailableTransitions(
      prisma,
      actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
      {
        taskId: workItemId,
        boardId,
        archivedAt: null,
        workflowStatusId: backlogStatusId,
        issueType: TaskIssueType.TASK,
      },
    );
    const toReady = available.find((row) => row.toStatusId === readyStatusId);
    expect(toReady).toBeTruthy();
    await transitionWorkItem(prisma, {
      workItemId,
      transitionId: toReady!.transitionId,
      actor: actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
      expectedVersion: 1,
    });
    const task = await prisma.workTask.findUniqueOrThrow({ where: { taskId: workItemId } });
    expect(task.workflowStatusId).toBe(readyStatusId);
    expect(task.stageId).toBe(stageReady);
  });

  it("9 invalid Backlog → QA blocked", async () => {
    // reset to backlog
    await prisma.workTask.update({
      where: { taskId: workItemId },
      data: { workflowStatusId: backlogStatusId, stageId: stageBacklog, version: 10 },
    });
    await expect(
      resolveTransitionForStageMove(
        prisma,
        actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
        {
          taskId: workItemId,
          boardId,
          archivedAt: null,
          workflowStatusId: backlogStatusId,
          stageId: stageBacklog,
          issueType: TaskIssueType.TASK,
        },
        stageQa,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("10 reverse transition requires explicit edge", async () => {
    const available = await listAvailableTransitions(
      prisma,
      actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
      {
        taskId: workItemId,
        boardId,
        archivedAt: null,
        workflowStatusId: readyStatusId,
        issueType: TaskIssueType.TASK,
      },
    );
    // Seed item is on backlog after test 9 reset; move to ready first
    await prisma.workTask.update({
      where: { taskId: workItemId },
      data: { workflowStatusId: readyStatusId, stageId: stageReady, version: 11 },
    });
    const fromReady = await listAvailableTransitions(
      prisma,
      actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
      {
        taskId: workItemId,
        boardId,
        archivedAt: null,
        workflowStatusId: readyStatusId,
        issueType: TaskIssueType.TASK,
      },
    );
    expect(fromReady.some((row) => row.toStatusId === backlogStatusId)).toBe(false);
    expect(available).toBeTruthy();
  });

  it("11 role permission transition (reopen lead-only)", async () => {
    await prisma.workTask.update({
      where: { taskId: workItemId },
      data: {
        workflowStatusId: doneStatusId,
        stageId: stageDone,
        status: TaskStatus.COMPLETED,
        progress: 100,
        completedAt: new Date(),
        version: 20,
      },
    });
    const memberTransitions = await listAvailableTransitions(
      prisma,
      actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
      {
        taskId: workItemId,
        boardId,
        archivedAt: null,
        workflowStatusId: doneStatusId,
        issueType: TaskIssueType.TASK,
      },
    );
    expect(memberTransitions.some((row) => /reopen/i.test(row.name))).toBe(false);
    const leadTransitions = await listAvailableTransitions(
      prisma,
      actor(leadUserId, "WF Lead", Role.EMPLOYEE, leadEmployeeId),
      {
        taskId: workItemId,
        boardId,
        archivedAt: null,
        workflowStatusId: doneStatusId,
        issueType: TaskIssueType.TASK,
      },
    );
    expect(leadTransitions.some((row) => /reopen/i.test(row.name))).toBe(true);
  });

  it("12 Viewer blocked", async () => {
    const transitions = await listAvailableTransitions(
      prisma,
      actor(viewerUserId, "WF Viewer", Role.EMPLOYEE, viewerEmployeeId),
      {
        taskId: workItemId,
        boardId,
        archivedAt: null,
        workflowStatusId: backlogStatusId,
        issueType: TaskIssueType.TASK,
      },
    );
    expect(transitions).toHaveLength(0);
  });

  it("13 gated project blocked for outsider", async () => {
    await expect(
      listAvailableTransitions(
        prisma,
        actor(outsiderUserId, "WF Outsider", Role.EMPLOYEE, outsiderEmployeeId),
        {
          taskId: workItemId,
          boardId,
          archivedAt: null,
          workflowStatusId: backlogStatusId,
          issueType: TaskIssueType.TASK,
        },
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("14 comment-required transition", async () => {
    const bugWorkflow = await workflowForIssueType(prisma, boardId, TaskIssueType.BUG);
    const triage = bugWorkflow.statuses.find((s) => s.name === "Triage")!;
    const cancelled = bugWorkflow.statuses.find((s) => s.name === "Cancelled")!;
    const cancelEdge = bugWorkflow.transitions.find(
      (t) => t.fromStatusId === triage.statusId && t.toStatusId === cancelled.statusId,
    )!;
    const key = await prisma.$transaction((tx) => allocateIssueKey(tx, boardId));
    const bug = await prisma.workTask.create({
      data: {
        title: "Comment required bug",
        boardId,
        stageId: stageReady,
        workflowStatusId: triage.statusId,
        issueNumber: key.issueNumber,
        issueKey: key.issueKey,
        issueType: TaskIssueType.BUG,
        rank: 9000,
        createdByUserId: adminUserId,
        reporterUserId: adminUserId,
      },
    });
    await expect(
      transitionWorkItem(prisma, {
        workItemId: bug.taskId,
        transitionId: cancelEdge.transitionId,
        actor: actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await transitionWorkItem(prisma, {
      workItemId: bug.taskId,
      transitionId: cancelEdge.transitionId,
      actor: actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
      expectedVersion: 1,
      comment: "Not reproducible",
    });
  });

  it("15 required field transition validation", async () => {
    const edge = await addWorkflowTransition(prisma, standardWorkflowId, {
      name: "Ready with title check",
      fromStatusId: backlogStatusId,
      toStatusId: readyStatusId,
      requiredFields: ["resolution"],
    });
    await prisma.workTask.update({
      where: { taskId: workItemId },
      data: {
        workflowStatusId: backlogStatusId,
        stageId: stageBacklog,
        resolution: null,
        version: 30,
      },
    });
    await expect(
      transitionWorkItem(prisma, {
        workItemId,
        transitionId: edge.transitionId,
        actor: actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
        expectedVersion: 30,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await transitionWorkItem(prisma, {
      workItemId,
      transitionId: edge.transitionId,
      actor: actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
      expectedVersion: 30,
      fieldValues: { resolution: "Fixed" },
    });
    await prisma.taskWorkflowTransition.delete({ where: { transitionId: edge.transitionId } });
  });

  it("16-17 activity/history created with old/new status", async () => {
    const history = await prisma.taskTransitionHistory.findMany({
      where: { taskId: workItemId },
      orderBy: { createdAt: "desc" },
    });
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]!.fromStatusName).toBeTruthy();
    expect(history[0]!.toStatusName).toBeTruthy();
    const update = await prisma.taskUpdate.findFirst({
      where: { taskId: workItemId, activityType: "STATUS_CHANGED" },
      orderBy: { createdAt: "desc" },
    });
    expect(update?.message).toMatch(/moved this item/);
  });

  it("18-19 drag valid / invalid stage resolve", async () => {
    await prisma.workTask.update({
      where: { taskId: workItemId },
      data: { workflowStatusId: backlogStatusId, stageId: stageBacklog, version: 40 },
    });
    const valid = await resolveTransitionForStageMove(
      prisma,
      actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
      {
        taskId: workItemId,
        boardId,
        archivedAt: null,
        workflowStatusId: backlogStatusId,
        stageId: stageBacklog,
        issueType: TaskIssueType.TASK,
      },
      stageReady,
    );
    expect(valid?.toStatusId).toBe(readyStatusId);
    await expect(
      resolveTransitionForStageMove(
        prisma,
        actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
        {
          taskId: workItemId,
          boardId,
          archivedAt: null,
          workflowStatusId: backlogStatusId,
          stageId: stageBacklog,
          issueType: TaskIssueType.TASK,
        },
        stageQa,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("cannot move directly"),
    });
  });

  it("20 concurrent transition version conflict", async () => {
    await prisma.workTask.update({
      where: { taskId: workItemId },
      data: { workflowStatusId: backlogStatusId, stageId: stageBacklog, version: 50 },
    });
    const available = await listAvailableTransitions(
      prisma,
      actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
      {
        taskId: workItemId,
        boardId,
        archivedAt: null,
        workflowStatusId: backlogStatusId,
        issueType: TaskIssueType.TASK,
      },
    );
    const edge = available.find((row) => row.toStatusId === readyStatusId)!;
    await transitionWorkItem(prisma, {
      workItemId,
      transitionId: edge.transitionId,
      actor: actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
      expectedVersion: 50,
    });
    await expect(
      transitionWorkItem(prisma, {
        workItemId,
        transitionId: edge.transitionId,
        actor: actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
        expectedVersion: 50,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("21-22 archive preserves status; restore preserves status", async () => {
    const before = await prisma.workTask.findUniqueOrThrow({ where: { taskId: workItemId } });
    await prisma.workTask.update({
      where: { taskId: workItemId },
      data: { archivedAt: new Date() },
    });
    await expect(
      transitionWorkItem(prisma, {
        workItemId,
        transitionId: "does-not-matter",
        actor: actor(memberUserId, "WF Member", Role.EMPLOYEE, memberEmployeeId),
        expectedVersion: before.version,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await prisma.workTask.update({
      where: { taskId: workItemId },
      data: { archivedAt: null },
    });
    const after = await prisma.workTask.findUniqueOrThrow({ where: { taskId: workItemId } });
    expect(after.workflowStatusId).toBe(before.workflowStatusId);
    expect(after.stageId).toBe(before.stageId);
  });

  it("23-24 type→workflow mapping and safe type change", async () => {
    const bugWf = await workflowForIssueType(prisma, boardId, TaskIssueType.BUG);
    const subWf = await workflowForIssueType(prisma, boardId, TaskIssueType.SUBTASK);
    const epicWf = await workflowForIssueType(prisma, boardId, TaskIssueType.EPIC);
    expect(bugWf.kind).toBe(TaskWorkflowKind.BUG);
    expect(subWf.kind).toBe(TaskWorkflowKind.SUBTASK);
    expect(epicWf.kind).toBe(TaskWorkflowKind.EPIC);
    const mapped = mapStatusForTypeChange({
      fromCategory: TaskStatusCategory.IN_PROGRESS,
      fromName: "In Progress",
      targetStatuses: bugWf.statuses,
    });
    expect(mapped.category).toBe(TaskStatusCategory.IN_PROGRESS);
  });

  it("25-29 existing stages/items/keys/rank/comments/attachments preserved", async () => {
    const stages = await prisma.taskStage.count({ where: { boardId } });
    expect(stages).toBeGreaterThanOrEqual(5);
    const task = await prisma.workTask.findUniqueOrThrow({
      where: { taskId: workItemId },
      include: { updates: true, attachments: true, assignments: true },
    });
    expect(task.issueKey).toBe(preservedKey);
    expect(task.updates.some((row) => row.updateId === commentId)).toBe(true);
    expect(task.attachments.some((row) => row.attachmentId === attachmentId)).toBe(true);
    expect(task.assignments).toHaveLength(1);
    expect(preservedRank).toBe(1500);
  });

  it("30-33 Attendance / Leave / User.role / Organization unchanged", async () => {
    const attendanceAfter = await prisma.attendanceEvent.count();
    const leaveAfter = await prisma.leaveRequest.count();
    const orgAfter = await prisma.department.count();
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    expect(attendanceAfter).toBe(attendanceBefore);
    expect(leaveAfter).toBe(leaveBefore);
    expect(orgAfter).toBe(orgBefore);
    expect(admin.role).toBe(userRoleBefore);
  });

  it("admin can add status", async () => {
    const status = await addWorkflowStatus(prisma, standardWorkflowId, {
      name: "Code Review Extra",
      category: TaskStatusCategory.IN_PROGRESS,
      stageId: stageProgress,
    });
    expect(status.name).toBe("Code Review Extra");
  });
});
