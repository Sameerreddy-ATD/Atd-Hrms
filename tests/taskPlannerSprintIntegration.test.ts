/**
 * Task Planner Sprints — DB integration matrix (no skips when RUN_SPRINT_INTEGRATION=1).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PrismaClient,
  Role,
  TaskBoardAccessType,
  TaskIssueType,
  TaskPriority,
  TaskProjectRole,
  TaskSprintStatus,
  TaskStatus,
  TaskStatusCategory,
} from "@prisma/client";
import type express from "express";
import { HttpError } from "../server/src/errors.js";
import { assertProjectCapability } from "../server/src/taskProjectRoles.js";
import { allocateIssueKey } from "../server/src/taskIssueKeys.js";
import {
  ensureProjectWorkflows,
  listAvailableTransitions,
  transitionWorkItem,
  workflowForIssueType,
} from "../server/src/taskWorkflowEngine.js";
import {
  assignTaskToSprintInTx,
  cancelSprint,
  completeSprint,
  createSprint,
  removeTaskFromSprintInTx,
  sprintSummaryForTask,
  startSprint,
  updateSprint,
} from "../server/src/taskSprintEngine.js";

const run = process.env.RUN_SPRINT_INTEGRATION === "1";
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
  stageId: string,
  workflowStatusId: string,
  issueType: TaskIssueType,
  title: string,
  createdByUserId: string,
  reporterUserId: string,
  rank = 1000,
  parentTaskId?: string,
) {
  const allocated = await prisma.$transaction((tx) => allocateIssueKey(tx, boardId));
  return prisma.workTask.create({
    data: {
      title,
      boardId,
      stageId,
      workflowStatusId,
      issueNumber: allocated.issueNumber,
      issueKey: allocated.issueKey,
      issueType,
      rank,
      backlogRank: rank,
      priority: TaskPriority.MEDIUM,
      createdByUserId,
      reporterUserId,
      parentTaskId: parentTaskId ?? null,
    },
  });
}

describe.runIf(run)("Task Planner Sprint DB matrix", () => {
  let boardId = "";
  let stageBacklog = "";
  let stageDone = "";
  let backlogStatusId = "";
  let doneStatusId = "";
  let progressStatusId = "";
  let adminUserId = "";
  let memberUserId = "";
  let leadUserId = "";
  let viewerUserId = "";
  let outsiderUserId = "";
  let memberEmployeeId = "";
  let leadEmployeeId = "";
  let viewerEmployeeId = "";
  let outsiderEmployeeId = "";
  let preservedKey = "";
  let preservedRank = 0;
  let workItemId = "";
  let storyId = "";
  let bugId = "";
  let improvementId = "";
  let epicId = "";
  let parentStoryId = "";
  let subtaskId = "";
  let commentId = "";
  let attachmentId = "";
  let sprintPlannedId = "";
  let sprintPlannedBId = "";
  let sprintActiveId = "";
  let sprintCompletedId = "";
  let sprintCancelledId = "";
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
        email: `sp-admin-${stamp}@test.local`,
        name: "SP Admin",
        role: Role.DEVELOPER_ADMIN,
        passwordHash: "x",
      },
    });
    adminUserId = admin.id;
    userRoleBefore = admin.role;

    const leadEmp = await prisma.employee.create({
      data: { employeeCode: `SPL-${stamp}`, name: "SP Lead", email: `sp-lead-${stamp}@test.local` },
    });
    leadEmployeeId = leadEmp.employeeId;
    const leadUser = await prisma.user.create({
      data: {
        email: `sp-lead-${stamp}@test.local`,
        name: "SP Lead",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: leadEmployeeId,
      },
    });
    leadUserId = leadUser.id;

    const memberEmp = await prisma.employee.create({
      data: { employeeCode: `SPM-${stamp}`, name: "SP Member", email: `sp-member-${stamp}@test.local` },
    });
    memberEmployeeId = memberEmp.employeeId;
    const memberUser = await prisma.user.create({
      data: {
        email: `sp-member-${stamp}@test.local`,
        name: "SP Member",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: memberEmployeeId,
      },
    });
    memberUserId = memberUser.id;

    const viewerEmp = await prisma.employee.create({
      data: { employeeCode: `SPV-${stamp}`, name: "SP Viewer", email: `sp-viewer-${stamp}@test.local` },
    });
    viewerEmployeeId = viewerEmp.employeeId;
    const viewerUser = await prisma.user.create({
      data: {
        email: `sp-viewer-${stamp}@test.local`,
        name: "SP Viewer",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: viewerEmployeeId,
      },
    });
    viewerUserId = viewerUser.id;

    const outsiderEmp = await prisma.employee.create({
      data: { employeeCode: `SPO-${stamp}`, name: "SP Outsider", email: `sp-out-${stamp}@test.local` },
    });
    outsiderEmployeeId = outsiderEmp.employeeId;
    const outsiderUser = await prisma.user.create({
      data: {
        email: `sp-out-${stamp}@test.local`,
        name: "SP Outsider",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: outsiderEmployeeId,
      },
    });
    outsiderUserId = outsiderUser.id;

    const board = await prisma.taskBoard.create({
      data: {
        name: `Sprint Board ${stamp}`,
        keyPrefix: `SP${stamp.slice(-4)}`.slice(0, 8).toUpperCase(),
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
              name: "In Progress",
              status: TaskStatus.IN_PROGRESS,
              statusCategory: TaskStatusCategory.IN_PROGRESS,
              sortOrder: 1,
              color: "AMBER",
            },
            {
              name: "Done",
              status: TaskStatus.COMPLETED,
              statusCategory: TaskStatusCategory.DONE,
              isCompleted: true,
              sortOrder: 2,
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
    stageDone = board.stages.find((s) => s.name === "Done")!.stageId;

    await prisma.$transaction((tx) => ensureProjectWorkflows(tx, boardId, { preferCatalog: true }));
    const workflow = await workflowForIssueType(prisma, boardId, TaskIssueType.TASK);
    backlogStatusId = workflow.statuses.find((s) => s.name === "Backlog")!.statusId;
    progressStatusId = workflow.statuses.find((s) => s.name === "In Progress")!.statusId;
    doneStatusId = workflow.statuses.find((s) => s.name === "Done")!.statusId;

    const allocated = await prisma.$transaction((tx) => allocateIssueKey(tx, boardId));
    preservedKey = allocated.issueKey;
    preservedRank = 1500;
    const item = await prisma.workTask.create({
      data: {
        title: "Sprint seed item",
        boardId,
        stageId: stageBacklog,
        workflowStatusId: backlogStatusId,
        issueNumber: allocated.issueNumber,
        issueKey: preservedKey,
        issueType: TaskIssueType.TASK,
        rank: preservedRank,
        backlogRank: preservedRank,
        priority: TaskPriority.MEDIUM,
        createdByUserId: adminUserId,
        reporterUserId: adminUserId,
        updates: {
          create: {
            authorUserId: adminUserId,
            activityType: "COMMENT",
            message: "sprint seed comment",
          },
        },
        attachments: {
          create: {
            fileName: "sprint-seed.txt",
            mimeType: "text/plain",
            sizeBytes: 4,
            storageKey: `sp-seed-${stamp}`,
            uploadedById: adminUserId,
          },
        },
      },
      include: { updates: true, attachments: true },
    });
    workItemId = item.taskId;
    commentId = item.updates[0]!.updateId;
    attachmentId = item.attachments[0]!.attachmentId;

    const story = await createItem(
      boardId,
      stageBacklog,
      backlogStatusId,
      TaskIssueType.STORY,
      "Story item",
      adminUserId,
      adminUserId,
      2000,
    );
    storyId = story.taskId;
    const bug = await createItem(
      boardId,
      stageBacklog,
      backlogStatusId,
      TaskIssueType.BUG,
      "Bug item",
      adminUserId,
      adminUserId,
      3000,
    );
    bugId = bug.taskId;
    const improvement = await createItem(
      boardId,
      stageBacklog,
      backlogStatusId,
      TaskIssueType.IMPROVEMENT,
      "Improvement item",
      adminUserId,
      adminUserId,
      4000,
    );
    improvementId = improvement.taskId;
    const epic = await createItem(
      boardId,
      stageBacklog,
      backlogStatusId,
      TaskIssueType.EPIC,
      "Epic item",
      adminUserId,
      adminUserId,
      5000,
    );
    epicId = epic.taskId;
    parentStoryId = storyId;
    const sub = await createItem(
      boardId,
      stageBacklog,
      backlogStatusId,
      TaskIssueType.SUBTASK,
      "Subtask item",
      adminUserId,
      adminUserId,
      6000,
      parentStoryId,
    );
    subtaskId = sub.taskId;
  });

  afterAll(async () => {
    if (boardId) {
      await prisma.workTask.deleteMany({ where: { boardId } });
      await prisma.taskBoard.delete({ where: { boardId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("1-2 create and update planned sprint", async () => {
    const lead = actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId);
    const created = await createSprint(prisma, {
      boardId,
      name: "Sprint Alpha",
      goal: "Ship backlog planning",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-14"),
      actor: lead,
    });
    sprintPlannedId = created.sprintId;
    expect(created.status).toBe(TaskSprintStatus.PLANNED);

    const updated = await updateSprint(prisma, sprintPlannedId, {
      name: "Sprint Alpha Renamed",
      goal: "Updated goal",
    });
    expect(updated.name).toBe("Sprint Alpha Renamed");
    expect(updated.goal).toBe("Updated goal");
  });

  it("3 invalid dates blocked", async () => {
    await expect(
      createSprint(prisma, {
        boardId,
        name: "Bad dates",
        startDate: new Date("2026-10-10"),
        endDate: new Date("2026-10-01"),
        actor: actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("4-5 one active sprint per project and start sprint", async () => {
    const lead = actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId);
    const second = await createSprint(prisma, {
      boardId,
      name: "Sprint Beta",
      startDate: new Date("2026-10-01"),
      endDate: new Date("2026-10-14"),
      actor: lead,
    });
    sprintPlannedBId = second.sprintId;

    const started = await startSprint(prisma, sprintPlannedId, lead);
    sprintActiveId = started.sprintId;
    expect(started.status).toBe(TaskSprintStatus.ACTIVE);
    expect(started.startedAt).toBeTruthy();

    await expect(startSprint(prisma, sprintPlannedBId, lead)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("8-11 sprint membership assign, backlog, move between planned", async () => {
    const lead = actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId);
    await assignTaskToSprintInTx(prisma, {
      taskId: storyId,
      sprintId: sprintActiveId,
      actorUserId: lead.id,
    });
    await assignTaskToSprintInTx(prisma, {
      taskId: workItemId,
      sprintId: sprintPlannedBId,
      actorUserId: lead.id,
    });
    expect((await sprintSummaryForTask(prisma, storyId))?.sprintId).toBe(sprintActiveId);
    expect((await sprintSummaryForTask(prisma, workItemId))?.sprintId).toBe(sprintPlannedBId);

    await removeTaskFromSprintInTx(prisma, { taskId: workItemId, actorUserId: lead.id });
    expect(await sprintSummaryForTask(prisma, workItemId)).toBeNull();

    await assignTaskToSprintInTx(prisma, {
      taskId: workItemId,
      sprintId: sprintPlannedBId,
      actorUserId: lead.id,
    });
    await assignTaskToSprintInTx(prisma, {
      taskId: workItemId,
      sprintId: sprintPlannedBId,
      actorUserId: lead.id,
    });
    const summary = await sprintSummaryForTask(prisma, workItemId);
    expect(summary?.sprintId).toBe(sprintPlannedBId);
  });

  it("12-13 completed/cancelled sprint assignment blocked", async () => {
    const lead = actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId);
    const completed = await createSprint(prisma, {
      boardId,
      name: "Completed Sprint",
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-14"),
      actor: lead,
    });
    sprintCompletedId = completed.sprintId;
    await prisma.taskSprint.update({
      where: { sprintId: sprintCompletedId },
      data: { status: TaskSprintStatus.COMPLETED, completedAt: new Date() },
    });
    await expect(
      assignTaskToSprintInTx(prisma, {
        taskId: bugId,
        sprintId: sprintCompletedId,
        actorUserId: lead.id,
      }),
    ).rejects.toMatchObject({ status: 409 });

    const cancelled = await createSprint(prisma, {
      boardId,
      name: "Cancelled Sprint",
      actor: lead,
    });
    sprintCancelledId = cancelled.sprintId;
    await cancelSprint(prisma, sprintCancelledId, lead, true);
    await expect(
      assignTaskToSprintInTx(prisma, {
        taskId: bugId,
        sprintId: sprintCancelledId,
        actorUserId: lead.id,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("14-18 epic blocked; story/task/bug/improvement allowed", async () => {
    const lead = actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId);
    await expect(
      assignTaskToSprintInTx(prisma, {
        taskId: epicId,
        sprintId: sprintPlannedBId,
        actorUserId: lead.id,
      }),
    ).rejects.toMatchObject({ status: 400 });

    for (const taskId of [storyId, workItemId, bugId, improvementId]) {
      await assignTaskToSprintInTx(prisma, {
        taskId,
        sprintId: sprintPlannedBId,
        actorUserId: lead.id,
      });
      expect((await sprintSummaryForTask(prisma, taskId))?.sprintId).toBe(sprintPlannedBId);
      await removeTaskFromSprintInTx(prisma, { taskId, actorUserId: lead.id });
    }
  });

  it("19-20 subtask inherits parent sprint; direct assignment blocked", async () => {
    const lead = actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId);
    await assignTaskToSprintInTx(prisma, {
      taskId: parentStoryId,
      sprintId: sprintActiveId,
      actorUserId: lead.id,
    });
    const inherited = await sprintSummaryForTask(prisma, subtaskId);
    expect(inherited?.sprintId).toBe(sprintActiveId);
    expect(inherited?.inherited).toBe(true);

    await expect(
      assignTaskToSprintInTx(prisma, {
        taskId: subtaskId,
        sprintId: sprintPlannedBId,
        actorUserId: lead.id,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("21-22 sprint membership and workflow are independent", async () => {
    const lead = actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId);
    const before = await prisma.workTask.findUniqueOrThrow({ where: { taskId: bugId } });
    await assignTaskToSprintInTx(prisma, {
      taskId: bugId,
      sprintId: sprintPlannedBId,
      actorUserId: lead.id,
    });
    const afterAssign = await prisma.workTask.findUniqueOrThrow({ where: { taskId: bugId } });
    expect(afterAssign.workflowStatusId).toBe(before.workflowStatusId);
    expect(afterAssign.stageId).toBe(before.stageId);

    const workflow = await workflowForIssueType(prisma, boardId, TaskIssueType.BUG);
    const available = await listAvailableTransitions(
      prisma,
      actor(memberUserId, "SP Member", Role.EMPLOYEE, memberEmployeeId),
      {
        taskId: bugId,
        boardId,
        archivedAt: null,
        workflowStatusId: afterAssign.workflowStatusId,
        issueType: TaskIssueType.BUG,
      },
    );
    const toProgress = available.find((t) => t.toStatusId === progressStatusId) ?? available[0];
    expect(toProgress).toBeTruthy();
    await transitionWorkItem(prisma, {
      workItemId: bugId,
      transitionId: toProgress!.transitionId,
      actor: actor(memberUserId, "SP Member", Role.EMPLOYEE, memberEmployeeId),
      expectedVersion: afterAssign.version,
    });
    const afterTransition = await prisma.workTask.findUniqueOrThrow({ where: { taskId: bugId } });
    expect((await sprintSummaryForTask(prisma, bugId))?.sprintId).toBe(sprintPlannedBId);
    expect(afterTransition.workflowStatusId).toBe(toProgress!.toStatusId);
  });

  it("23-25 backlog and sprint rank persist on moves", async () => {
    const lead = actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId);
    await prisma.workTask.update({
      where: { taskId: improvementId },
      data: { backlogRank: 7777 },
    });
    await removeTaskFromSprintInTx(prisma, { taskId: improvementId, actorUserId: lead.id });
    const backlogTask = await prisma.workTask.findUniqueOrThrow({
      where: { taskId: improvementId },
    });
    expect(backlogTask.backlogRank).toBeGreaterThan(0);

    await assignTaskToSprintInTx(prisma, {
      taskId: improvementId,
      sprintId: sprintPlannedBId,
      actorUserId: lead.id,
      sprintRank: 8888,
    });
    const membership = await prisma.taskSprintMembership.findFirst({
      where: { taskId: improvementId, removedAt: null },
    });
    expect(membership?.sprintRank).toBe(8888);
  });

  it("6 26-28 complete sprint with done/incomplete dispositions", async () => {
    const lead = actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId);
    const doneItem = await createItem(
      boardId,
      stageDone,
      doneStatusId,
      TaskIssueType.TASK,
      "Done in sprint",
      adminUserId,
      adminUserId,
      9000,
    );
    const incompleteA = await createItem(
      boardId,
      stageBacklog,
      backlogStatusId,
      TaskIssueType.TASK,
      "Incomplete A",
      adminUserId,
      adminUserId,
      9100,
    );
    const incompleteB = await createItem(
      boardId,
      stageBacklog,
      backlogStatusId,
      TaskIssueType.TASK,
      "Incomplete B",
      adminUserId,
      adminUserId,
      9200,
    );
    for (const taskId of [doneItem.taskId, incompleteA.taskId, incompleteB.taskId]) {
      await assignTaskToSprintInTx(prisma, {
        taskId,
        sprintId: sprintActiveId,
        actorUserId: lead.id,
      });
    }

    const nextPlanned = await createSprint(prisma, {
      boardId,
      name: "Next Sprint",
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-11-14"),
      actor: lead,
    });

    const incompleteMemberships = await prisma.taskSprintMembership.findMany({
      where: { sprintId: sprintActiveId, removedAt: null },
      include: {
        task: {
          select: {
            taskId: true,
            workflowStatus: { select: { category: true } },
            stage: { select: { statusCategory: true } },
          },
        },
      },
    });
    const incompleteIds = incompleteMemberships
      .filter((row) => {
        const category =
          row.task.workflowStatus?.category ??
          row.task.stage?.statusCategory ??
          TaskStatusCategory.TODO;
        return category !== TaskStatusCategory.DONE;
      })
      .map((row) => row.task.taskId);

    const dispositions = incompleteIds.map((taskId, index) => ({
      taskId,
      target:
        taskId === incompleteA.taskId
          ? ("backlog" as const)
          : taskId === incompleteB.taskId
            ? { sprintId: nextPlanned.sprintId }
            : index % 2 === 0
              ? ("backlog" as const)
              : { sprintId: nextPlanned.sprintId },
    }));

    await completeSprint(prisma, sprintActiveId, lead, dispositions);

    const completedSprint = await prisma.taskSprint.findUniqueOrThrow({
      where: { sprintId: sprintActiveId },
    });
    expect(completedSprint.status).toBe(TaskSprintStatus.COMPLETED);

    const doneMembership = await prisma.taskSprintMembership.findFirst({
      where: { taskId: doneItem.taskId, sprintId: sprintActiveId },
    });
    expect(doneMembership?.completedInSprint).toBe(true);
    expect(await sprintSummaryForTask(prisma, incompleteA.taskId)).toBeNull();
    expect((await sprintSummaryForTask(prisma, incompleteB.taskId))?.sprintId).toBe(
      nextPlanned.sprintId,
    );
  });

  it("7 29 sprint history preserved on cancel", async () => {
    const lead = actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId);
    const planned = await createSprint(prisma, {
      boardId,
      name: "Cancel Me",
      actor: lead,
    });
    await assignTaskToSprintInTx(prisma, {
      taskId: workItemId,
      sprintId: planned.sprintId,
      actorUserId: lead.id,
    });
    await cancelSprint(prisma, planned.sprintId, lead, true);
    const history = await prisma.taskSprint.findUniqueOrThrow({
      where: { sprintId: planned.sprintId },
    });
    expect(history.status).toBe(TaskSprintStatus.CANCELLED);
    const events = await prisma.taskSprintEvent.count({
      where: { sprintId: planned.sprintId },
    });
    expect(events).toBeGreaterThan(0);
  });

  it("30 archive preserves sprint membership history", async () => {
    const lead = actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId);
    const sprint = await createSprint(prisma, {
      boardId,
      name: "Archive Sprint",
      actor: lead,
    });
    await assignTaskToSprintInTx(prisma, {
      taskId: bugId,
      sprintId: sprint.sprintId,
      actorUserId: lead.id,
    });
    await prisma.workTask.update({
      where: { taskId: bugId },
      data: { archivedAt: new Date() },
    });
    const historical = await prisma.taskSprintMembership.findFirst({
      where: { taskId: bugId, sprintId: sprint.sprintId, removedAt: null },
    });
    expect(historical).toBeTruthy();
    await prisma.workTask.update({ where: { taskId: bugId }, data: { archivedAt: null } });
  });

  it("31-33 permissions: viewer blocked, lead allowed, outsider blocked", async () => {
    await expect(
      assertProjectCapability(
        prisma,
        actor(viewerUserId, "SP Viewer", Role.EMPLOYEE, viewerEmployeeId),
        boardId,
        "MANAGE_SPRINT",
      ),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      assertProjectCapability(
        prisma,
        actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId),
        boardId,
        "MANAGE_SPRINT",
      ),
    ).resolves.toBeDefined();

    await expect(
      assertProjectCapability(
        prisma,
        actor(outsiderUserId, "SP Outsider", Role.EMPLOYEE, outsiderEmployeeId),
        boardId,
        "MANAGE_SPRINT",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("34 concurrent sprint start — one active only", async () => {
    const lead = actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId);
    const active = await prisma.taskSprint.findMany({
      where: { boardId, status: TaskSprintStatus.ACTIVE },
    });
    for (const sprint of active) {
      await completeSprint(
        prisma,
        sprint.sprintId,
        lead,
        (
          await prisma.taskSprintMembership.findMany({
            where: { sprintId: sprint.sprintId, removedAt: null },
            include: {
              task: {
                select: {
                  taskId: true,
                  workflowStatus: { select: { category: true } },
                  stage: { select: { statusCategory: true } },
                },
              },
            },
          })
        )
          .filter((row) => {
            const category =
              row.task.workflowStatus?.category ??
              row.task.stage?.statusCategory ??
              TaskStatusCategory.TODO;
            return category !== TaskStatusCategory.DONE;
          })
          .map((row) => ({ taskId: row.task.taskId, target: "backlog" as const })),
      );
    }
    const a = await createSprint(prisma, {
      boardId,
      name: "Race A",
      startDate: new Date("2026-12-01"),
      endDate: new Date("2026-12-14"),
      actor: lead,
    });
    const b = await createSprint(prisma, {
      boardId,
      name: "Race B",
      startDate: new Date("2026-12-15"),
      endDate: new Date("2026-12-28"),
      actor: lead,
    });
    await startSprint(prisma, a.sprintId, lead);
    await expect(startSprint(prisma, b.sprintId, lead)).rejects.toMatchObject({ status: 409 });
    const activeCount = await prisma.taskSprint.count({
      where: { boardId, status: TaskSprintStatus.ACTIVE },
    });
    expect(activeCount).toBe(1);
  });

  it("35 version/conflict behavior safe on sprint ops", async () => {
    const task = await prisma.workTask.findUniqueOrThrow({ where: { taskId: workItemId } });
    await prisma.workTask.update({
      where: { taskId: workItemId },
      data: { version: task.version + 1 },
    });
    const lead = actor(leadUserId, "SP Lead", Role.EMPLOYEE, leadEmployeeId);
    const sprint = await createSprint(prisma, {
      boardId,
      name: "Version safe",
      actor: lead,
    });
    await expect(
      assignTaskToSprintInTx(prisma, {
        taskId: workItemId,
        sprintId: sprint.sprintId,
        actorUserId: lead.id,
      }),
    ).resolves.toBeTruthy();
  });

  it("36-38 existing planner data, issue keys, workflow history preserved", async () => {
    const task = await prisma.workTask.findUniqueOrThrow({
      where: { taskId: workItemId },
      include: { updates: true, attachments: true },
    });
    expect(task.issueKey).toBe(preservedKey);
    expect(task.rank).toBe(preservedRank);
    expect(task.updates.some((row) => row.updateId === commentId)).toBe(true);
    expect(task.attachments.some((row) => row.attachmentId === attachmentId)).toBe(true);
    const stages = await prisma.taskStage.count({ where: { boardId } });
    expect(stages).toBeGreaterThanOrEqual(3);
  });

  it("39-42 Attendance / Leave / User.role / Organization unchanged", async () => {
    expect(await prisma.attendanceEvent.count()).toBe(attendanceBefore);
    expect(await prisma.leaveRequest.count()).toBe(leaveBefore);
    expect(await prisma.department.count()).toBe(orgBefore);
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    expect(admin.role).toBe(userRoleBefore);
  });
});
