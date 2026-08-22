/**
 * Task Planner Collaboration — DB integration matrix (no skips when RUN_COLLAB_INTEGRATION=1).
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
  TaskStatus,
  TaskStatusCategory,
} from "@prisma/client";
import type express from "express";
import { HttpError } from "../server/src/errors.js";
import { assertProjectCapability } from "../server/src/taskProjectRoles.js";
import { allocateIssueKey } from "../server/src/taskIssueKeys.js";
import {
  createProjectComponent,
  setTaskComponentsInTx,
} from "../server/src/taskComponentEngine.js";
import {
  createWorkTaskRelation,
  deleteWorkTaskRelation,
  listTaskRelations,
  wouldCreateBlocksCycle,
  canonicalRelatesToEndpoints,
} from "../server/src/taskRelationEngine.js";
import {
  createProjectLabel,
  setTaskLabels,
  updateProjectLabel,
  normalizeLabelName,
} from "../server/src/taskLabelEngine.js";
import {
  watchWorkItem,
  unwatchWorkItem,
  getWatcherState,
  listAuthorizedWatcherUserIds,
} from "../server/src/taskWatcherEngine.js";
import {
  createWorkLog,
  updateWorkLog,
  deleteWorkLog,
  computeWorkLogTotals,
} from "../server/src/taskWorkLogEngine.js";
import { listTaskActivity } from "../server/src/taskCollaborationNotify.js";
import { parseDurationToMinutes } from "../server/src/taskDurationParse.js";
import {
  assignTaskToSprintInTx,
  createSprint,
  sprintSummaryForTask,
} from "../server/src/taskSprintEngine.js";
import {
  ensureProjectWorkflows,
  workflowForIssueType,
} from "../server/src/taskWorkflowEngine.js";

const run = process.env.RUN_COLLAB_INTEGRATION === "1";
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
  rank = 1000,
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
      rank,
      backlogRank: rank,
      priority: TaskPriority.MEDIUM,
      createdByUserId,
      reporterUserId: createdByUserId,
      parentTaskId: parentTaskId ?? null,
    },
  });
}

describe.runIf(run)("Task Planner Collaboration DB matrix", () => {
  let boardId = "";
  let board2Id = "";
  let adminUserId = "";
  let leadUserId = "";
  let memberUserId = "";
  let viewerUserId = "";
  let outsiderUserId = "";
  let leadEmployeeId = "";
  let memberEmployeeId = "";
  let viewerEmployeeId = "";
  let outsiderEmployeeId = "";
  let taskAId = "";
  let taskBId = "";
  let taskCId = "";
  let taskCrossId = "";
  let epicId = "";
  let storyId = "";
  let preservedKey = "";
  let preservedRank = 0;
  let preservedWorkflowStatusId = "";
  let componentId = "";
  let commentId = "";
  let attachmentId = "";
  let sprintId = "";
  let blocksRelationId = "";
  let relatesRelationId = "";
  let labelBugId = "";
  let labelFeatureId = "";
  let inactiveLabelId = "";
  let workLogId = "";
  let transitionHistoryBefore = 0;
  let sprintMembershipBefore = 0;
  let componentLinkBefore = 0;
  let commentCountBefore = 0;
  let attachmentCountBefore = 0;
  let attendanceBefore = 0;
  let leaveBefore = 0;
  let orgBefore = 0;
  let userRoleBefore: Role | "" = "";

  const assertBoardAccess = async (_user: Actor, bid: string) => {
    if (bid !== boardId && bid !== board2Id) {
      throw new HttpError(403, "Board access denied");
    }
  };

  beforeAll(async () => {
    attendanceBefore = await prisma.attendanceEvent.count();
    leaveBefore = await prisma.leaveRequest.count();
    orgBefore = await prisma.department.count();
    const stamp = Date.now().toString(36);

    const admin = await prisma.user.create({
      data: {
        email: `cl-admin-${stamp}@test.local`,
        name: "CL Admin",
        role: Role.DEVELOPER_ADMIN,
        passwordHash: "x",
      },
    });
    adminUserId = admin.id;
    userRoleBefore = admin.role;

    const leadEmp = await prisma.employee.create({
      data: { employeeCode: `CLL-${stamp}`, name: "CL Lead", email: `cl-lead-${stamp}@test.local` },
    });
    leadEmployeeId = leadEmp.employeeId;
    const leadUser = await prisma.user.create({
      data: {
        email: `cl-lead-${stamp}@test.local`,
        name: "CL Lead",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: leadEmployeeId,
      },
    });
    leadUserId = leadUser.id;

    const memberEmp = await prisma.employee.create({
      data: { employeeCode: `CLM-${stamp}`, name: "CL Member", email: `cl-member-${stamp}@test.local` },
    });
    memberEmployeeId = memberEmp.employeeId;
    const memberUser = await prisma.user.create({
      data: {
        email: `cl-member-${stamp}@test.local`,
        name: "CL Member",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: memberEmployeeId,
      },
    });
    memberUserId = memberUser.id;

    const viewerEmp = await prisma.employee.create({
      data: { employeeCode: `CLV-${stamp}`, name: "CL Viewer", email: `cl-viewer-${stamp}@test.local` },
    });
    viewerEmployeeId = viewerEmp.employeeId;
    const viewerUser = await prisma.user.create({
      data: {
        email: `cl-viewer-${stamp}@test.local`,
        name: "CL Viewer",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: viewerEmployeeId,
      },
    });
    viewerUserId = viewerUser.id;

    const outsiderEmp = await prisma.employee.create({
      data: { employeeCode: `CLO-${stamp}`, name: "CL Outsider", email: `cl-out-${stamp}@test.local` },
    });
    outsiderEmployeeId = outsiderEmp.employeeId;
    const outsiderUser = await prisma.user.create({
      data: {
        email: `cl-out-${stamp}@test.local`,
        name: "CL Outsider",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: outsiderEmployeeId,
      },
    });
    outsiderUserId = outsiderUser.id;

    const board = await prisma.taskBoard.create({
      data: {
        name: `Collab ${stamp}`,
        keyPrefix: `CL${stamp.slice(-3).toUpperCase()}`.slice(0, 8),
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
    boardId = board.boardId;
    const stageBacklogId = board.stages[0]!.stageId;
    await ensureProjectWorkflows(prisma, boardId);
    const taskWorkflow = await workflowForIssueType(prisma, boardId, TaskIssueType.TASK);
    const initialTaskStatusId = taskWorkflow.statuses[0]!.statusId;

    const board2 = await prisma.taskBoard.create({
      data: {
        name: `Collab Other ${stamp}`,
        keyPrefix: `C2${stamp.slice(-2).toUpperCase()}`.slice(0, 8),
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
          create: [{ employeeId: leadEmployeeId, role: TaskProjectRole.PROJECT_LEAD }],
        },
      },
    });
    board2Id = board2.boardId;
    await ensureProjectWorkflows(prisma, board2Id);

    const epic = await createItem(boardId, TaskIssueType.EPIC, "Epic seed", adminUserId, undefined, 500);
    epicId = epic.taskId;
    const story = await createItem(boardId, TaskIssueType.STORY, "Story seed", adminUserId, epicId, 600);
    storyId = story.taskId;

    const allocated = await prisma.$transaction((tx) => allocateIssueKey(tx, boardId));
    preservedKey = allocated.issueKey;
    preservedRank = 1100;
    const seededA = await prisma.workTask.create({
      data: {
        title: "Work item A",
        boardId,
        stageId: stageBacklogId,
        workflowStatusId: initialTaskStatusId,
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
            activityType: TaskActivityType.COMMENT,
            message: "collab seed comment",
          },
        },
        attachments: {
          create: {
            fileName: "collab-seed.txt",
            mimeType: "text/plain",
            sizeBytes: 4,
            storageKey: `cl-seed-${stamp}`,
            uploadedById: adminUserId,
          },
        },
      },
      include: { updates: true, attachments: true },
    });
    taskAId = seededA.taskId;
    preservedWorkflowStatusId = seededA.workflowStatusId;
    commentId = seededA.updates[0]!.updateId;
    attachmentId = seededA.attachments[0]!.attachmentId;

    const b = await createItem(boardId, TaskIssueType.TASK, "Work item B", adminUserId, undefined, 1200);
    taskBId = b.taskId;
    const c = await createItem(boardId, TaskIssueType.TASK, "Work item C", adminUserId, undefined, 1300);
    taskCId = c.taskId;
    const cross = await createItem(board2Id, TaskIssueType.TASK, "Cross project item", adminUserId);
    taskCrossId = cross.taskId;

    const component = await createProjectComponent(
      prisma,
      actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN),
      boardId,
      { name: "Platform" },
    );
    componentId = component.id;
    await prisma.$transaction((tx) =>
      setTaskComponentsInTx(tx, {
        taskId: storyId,
        boardId,
        componentIds: [componentId],
        actorUserId: adminUserId,
      }),
    );

    const sprint = await createSprint(prisma, {
      boardId,
      name: "Collab Sprint",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-14"),
      actor: actor(leadUserId, "Lead", Role.EMPLOYEE, leadEmployeeId),
    });
    sprintId = sprint.sprintId;
    await prisma.$transaction((tx) =>
      assignTaskToSprintInTx(tx, {
        taskId: taskBId,
        sprintId,
        actorUserId: leadUserId,
      }),
    );

    transitionHistoryBefore = await prisma.taskTransitionHistory.count();
    sprintMembershipBefore = await prisma.taskSprintMembership.count({
      where: { taskId: taskBId, removedAt: null },
    });
    componentLinkBefore = await prisma.workTaskComponent.count({ where: { taskId: storyId } });
    commentCountBefore = await prisma.taskUpdate.count({
      where: { taskId: taskAId, activityType: TaskActivityType.COMMENT },
    });
    attachmentCountBefore = await prisma.taskAttachment.count({ where: { taskId: taskAId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1 BLOCKS relation", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    const rel = await createWorkTaskRelation(
      prisma,
      admin,
      { sourceTaskId: taskAId, targetTaskId: taskBId, relationType: TaskRelationType.BLOCKS },
      assertBoardAccess,
    );
    blocksRelationId = rel.id;
    expect(rel.type).toBe(TaskRelationType.BLOCKS);
    expect(rel.source.id).toBe(taskAId);
    expect(rel.target.id).toBe(taskBId);
  });

  it("2 blocked-by view via listTaskRelations", async () => {
    const onB = await listTaskRelations(prisma, taskBId);
    expect(onB.blockedBy.some((t) => t.id === taskAId)).toBe(true);
    expect(onB.isBlocked).toBe(true);
    const onA = await listTaskRelations(prisma, taskAId);
    expect(onA.blocks.some((t) => t.id === taskBId)).toBe(true);
  });

  it("3 self relation rejected", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    await expect(
      createWorkTaskRelation(
        prisma,
        admin,
        { sourceTaskId: taskAId, targetTaskId: taskAId, relationType: TaskRelationType.RELATES_TO },
        assertBoardAccess,
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("4 duplicate edge rejected", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    await expect(
      createWorkTaskRelation(
        prisma,
        admin,
        { sourceTaskId: taskAId, targetTaskId: taskBId, relationType: TaskRelationType.BLOCKS },
        assertBoardAccess,
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("5 BLOCKS cycle A->B->C->A rejected", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    await createWorkTaskRelation(
      prisma,
      admin,
      { sourceTaskId: taskBId, targetTaskId: taskCId, relationType: TaskRelationType.BLOCKS },
      assertBoardAccess,
    );
    expect(await wouldCreateBlocksCycle(prisma, taskCId, taskAId)).toBe(true);
    await expect(
      createWorkTaskRelation(
        prisma,
        admin,
        { sourceTaskId: taskCId, targetTaskId: taskAId, relationType: TaskRelationType.BLOCKS },
        assertBoardAccess,
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("6 RELATES_TO symmetric duplicate", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    const canonical = canonicalRelatesToEndpoints(taskAId, taskCId);
    expect(canonical.sourceTaskId < canonical.targetTaskId).toBe(true);

    const rel = await createWorkTaskRelation(
      prisma,
      admin,
      { sourceTaskId: taskAId, targetTaskId: taskCId, relationType: TaskRelationType.RELATES_TO },
      assertBoardAccess,
    );
    relatesRelationId = rel.id;
    await expect(
      createWorkTaskRelation(
        prisma,
        admin,
        { sourceTaskId: taskCId, targetTaskId: taskAId, relationType: TaskRelationType.RELATES_TO },
        assertBoardAccess,
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("7 remove relation", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    await deleteWorkTaskRelation(prisma, admin, relatesRelationId, assertBoardAccess);
    const rels = await listTaskRelations(prisma, taskAId);
    expect(rels.relatedTo.some((t) => t.id === taskCId)).toBe(false);
  });

  it("8 unauthorized relation mutation", async () => {
    const viewer = actor(viewerUserId, "Viewer", Role.EMPLOYEE, viewerEmployeeId);
    await expect(
      createWorkTaskRelation(
        prisma,
        viewer,
        { sourceTaskId: taskBId, targetTaskId: taskCId, relationType: TaskRelationType.RELATES_TO },
        assertBoardAccess,
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("9 cross-project relation when two boards seeded", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    const rel = await createWorkTaskRelation(
      prisma,
      admin,
      { sourceTaskId: taskAId, targetTaskId: taskCrossId, relationType: TaskRelationType.RELATES_TO },
      assertBoardAccess,
    );
    expect(rel.source.id).toBe(taskAId);
    expect(rel.target.id).toBe(taskCrossId);
    await deleteWorkTaskRelation(prisma, admin, rel.id, assertBoardAccess);
  });

  it("10 DUPLICATES relation type", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    const rel = await createWorkTaskRelation(
      prisma,
      admin,
      { sourceTaskId: taskCId, targetTaskId: taskBId, relationType: TaskRelationType.DUPLICATES },
      assertBoardAccess,
    );
    const listed = await listTaskRelations(prisma, taskCId);
    expect(listed.duplicates.some((t) => t.id === taskBId)).toBe(true);
    await deleteWorkTaskRelation(prisma, admin, rel.id, assertBoardAccess);
  });

  it("11 label create", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    const bug = await createProjectLabel(prisma, admin, boardId, { name: "Bug", color: "red" });
    labelBugId = bug.id;
    expect(bug.name).toBe("Bug");
    expect(normalizeLabelName("  Bug ")).toBe("bug");
  });

  it("12 case-insensitive duplicate label blocked", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    await expect(createProjectLabel(prisma, admin, boardId, { name: "bug" })).rejects.toBeInstanceOf(HttpError);
  });

  it("13 multi label assign", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    const feature = await createProjectLabel(prisma, admin, boardId, { name: "Feature" });
    labelFeatureId = feature.id;
    const task = await prisma.workTask.findUniqueOrThrow({ where: { taskId: taskAId } });
    const labels = await setTaskLabels(prisma, admin, taskAId, [labelBugId, labelFeatureId], task.version);
    expect(labels.map((l) => l.id).sort()).toEqual([labelBugId, labelFeatureId].sort());
  });

  it("14 label remove", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    const task = await prisma.workTask.findUniqueOrThrow({ where: { taskId: taskAId } });
    const labels = await setTaskLabels(prisma, admin, taskAId, [labelBugId], task.version);
    expect(labels).toHaveLength(1);
    expect(labels[0]!.id).toBe(labelBugId);
  });

  it("15 inactive label blocked for new assign", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    const temp = await createProjectLabel(prisma, admin, boardId, { name: "Deprecated" });
    inactiveLabelId = temp.id;
    let task = await prisma.workTask.findUniqueOrThrow({ where: { taskId: taskCId } });
    await setTaskLabels(prisma, admin, taskCId, [inactiveLabelId], task.version);
    await updateProjectLabel(prisma, admin, inactiveLabelId, { active: false });
    task = await prisma.workTask.findUniqueOrThrow({ where: { taskId: taskAId } });
    await expect(
      setTaskLabels(prisma, admin, taskAId, [labelBugId, inactiveLabelId], task.version),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("16 historical label assignment preserved", async () => {
    const links = await prisma.workTaskLabel.findMany({ where: { taskId: taskCId } });
    expect(links.some((l) => l.labelId === inactiveLabelId)).toBe(true);
    const removedActivity = await prisma.taskUpdate.findFirst({
      where: { taskId: taskAId, activityType: TaskActivityType.LABEL_REMOVED },
    });
    expect(removedActivity).toBeTruthy();
  });

  it("17 watch work item", async () => {
    const member = actor(memberUserId, "Member", Role.EMPLOYEE, memberEmployeeId);
    const state = await watchWorkItem(prisma, member, taskAId, assertBoardAccess);
    expect(state.watching).toBe(true);
    expect(state.watcherCount).toBeGreaterThanOrEqual(1);
  });

  it("18 idempotent watch", async () => {
    const member = actor(memberUserId, "Member", Role.EMPLOYEE, memberEmployeeId);
    const first = await getWatcherState(prisma, member, taskAId, assertBoardAccess);
    const second = await watchWorkItem(prisma, member, taskAId, assertBoardAccess);
    expect(first.watching).toBe(true);
    expect(second.watching).toBe(true);
    expect(second.watcherCount).toBe(first.watcherCount);
  });

  it("19 unwatch work item", async () => {
    const member = actor(memberUserId, "Member", Role.EMPLOYEE, memberEmployeeId);
    const state = await unwatchWorkItem(prisma, member, taskAId, assertBoardAccess);
    expect(state.watching).toBe(false);
  });

  it("20 watcher does not grant project access", async () => {
    const tempEmp = await prisma.employee.create({
      data: {
        employeeCode: `CLW-${Date.now().toString(36)}`,
        name: "Temp Watcher",
        email: `cl-watcher-${Date.now()}@test.local`,
      },
    });
    const tempUser = await prisma.user.create({
      data: {
        email: `cl-watcher-u-${Date.now()}@test.local`,
        name: "Temp Watcher",
        role: Role.EMPLOYEE,
        passwordHash: "x",
        employeeId: tempEmp.employeeId,
      },
    });
    await prisma.taskBoardMember.create({
      data: { boardId, employeeId: tempEmp.employeeId, role: TaskProjectRole.MEMBER },
    });
    const tempActor = actor(tempUser.id, "Temp Watcher", Role.EMPLOYEE, tempEmp.employeeId);
    await watchWorkItem(prisma, tempActor, taskAId, assertBoardAccess);
    await prisma.taskBoardMember.deleteMany({
      where: { boardId, employeeId: tempEmp.employeeId },
    });

    const loadUser = async (userId: string) => {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      return u
        ? ({
            ...u,
            mustChangePassword: false,
            sessionVersion: 0,
          } as Actor)
        : null;
    };
    const assertForUser = async (u: Actor, bid: string) => {
      if (bid !== boardId && bid !== board2Id) throw new HttpError(403, "No access");
      if (u.role === Role.DEVELOPER_ADMIN || u.role === Role.MAIN_ADMIN) return;
      const member = u.employeeId
        ? await prisma.taskBoardMember.findFirst({
            where: { boardId: bid, employeeId: u.employeeId },
          })
        : null;
      if (!member) throw new HttpError(403, "No access");
    };

    const authorized = await listAuthorizedWatcherUserIds(
      prisma,
      taskAId,
      assertForUser,
      loadUser,
    );
    expect(authorized).not.toContain(tempUser.id);
  });

  it("21 unauthorized watcher content", async () => {
    const outsider = actor(outsiderUserId, "Outsider", Role.EMPLOYEE, outsiderEmployeeId);
    await expect(getWatcherState(prisma, outsider, taskAId, assertBoardAccess)).rejects.toBeInstanceOf(HttpError);
    await expect(watchWorkItem(prisma, outsider, taskAId, assertBoardAccess)).rejects.toBeInstanceOf(HttpError);
  });

  it("22 create own work log", async () => {
    const member = actor(memberUserId, "Member", Role.EMPLOYEE, memberEmployeeId);
    const log = await createWorkLog(
      prisma,
      member,
      taskAId,
      { duration: "1h 30m", workDate: "2026-08-20", description: "Implementation" },
      assertBoardAccess,
    );
    workLogId = log.id;
    expect(log.minutes).toBe(90);
    expect(log.userId).toBe(memberUserId);
  });

  it("23 work log minutes stored as integer", async () => {
    expect(parseDurationToMinutes("45m")).toBe(45);
    const log = await prisma.workLog.findUniqueOrThrow({ where: { workLogId } });
    expect(Number.isInteger(log.minutes)).toBe(true);
    expect(log.minutes).toBe(90);
  });

  it("24 invalid duration throws", async () => {
    const member = actor(memberUserId, "Member", Role.EMPLOYEE, memberEmployeeId);
    expect(() => parseDurationToMinutes("not-a-duration")).toThrow(HttpError);
    await expect(
      createWorkLog(
        prisma,
        member,
        taskAId,
        { duration: "bad", workDate: "2026-08-21" },
        assertBoardAccess,
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("25 edit own work log", async () => {
    const member = actor(memberUserId, "Member", Role.EMPLOYEE, memberEmployeeId);
    const updated = await updateWorkLog(
      prisma,
      member,
      workLogId,
      { duration: "2h", description: "Updated" },
      assertBoardAccess,
    );
    expect(updated.minutes).toBe(120);
    expect(updated.description).toBe("Updated");
  });

  it("26 delete work log soft", async () => {
    const member = actor(memberUserId, "Member", Role.EMPLOYEE, memberEmployeeId);
    await deleteWorkLog(prisma, member, workLogId, assertBoardAccess);
    const deleted = await prisma.workLog.findUniqueOrThrow({ where: { workLogId } });
    expect(deleted.deletedAt).not.toBeNull();
  });

  it("27 viewer blocked from work log create", async () => {
    const viewer = actor(viewerUserId, "Viewer", Role.EMPLOYEE, viewerEmployeeId);
    await expect(
      createWorkLog(
        prisma,
        viewer,
        taskAId,
        { duration: "30m", workDate: "2026-08-22" },
        assertBoardAccess,
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("28 unauthorized work log mutation", async () => {
    const outsider = actor(outsiderUserId, "Outsider", Role.EMPLOYEE, outsiderEmployeeId);
    await expect(
      createWorkLog(
        prisma,
        outsider,
        taskAId,
        { duration: "30m", workDate: "2026-08-22" },
        assertBoardAccess,
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("29 work log totals exclude soft-deleted", async () => {
    const member = actor(memberUserId, "Member", Role.EMPLOYEE, memberEmployeeId);
    await createWorkLog(
      prisma,
      member,
      taskAId,
      { duration: "1h", workDate: "2026-08-19" },
      assertBoardAccess,
    );
    const totals = await computeWorkLogTotals(prisma, taskAId, memberUserId);
    expect(totals.totalMinutes).toBe(60);
    expect(totals.yourMinutes).toBe(60);
  });

  it("30 sprint change preserves work logs", async () => {
    const beforeCount = await prisma.workLog.count({ where: { taskId: taskAId, deletedAt: null } });
    const otherSprint = await createSprint(prisma, {
      boardId,
      name: "Collab Sprint B",
      startDate: new Date("2026-10-01"),
      endDate: new Date("2026-10-14"),
      actor: actor(leadUserId, "Lead", Role.EMPLOYEE, leadEmployeeId),
    });
    await prisma.$transaction((tx) =>
      assignTaskToSprintInTx(tx, {
        taskId: taskAId,
        sprintId: otherSprint.sprintId,
        actorUserId: leadUserId,
      }),
    );
    const afterCount = await prisma.workLog.count({ where: { taskId: taskAId, deletedAt: null } });
    expect(afterCount).toBe(beforeCount);
  });

  it("31 relation activity recorded", async () => {
    const activity = await prisma.taskUpdate.findFirst({
      where: { taskId: taskAId, activityType: TaskActivityType.RELATION_ADDED },
    });
    expect(activity).toBeTruthy();
  });

  it("32 label activity recorded", async () => {
    const added = await prisma.taskUpdate.findFirst({
      where: { taskId: taskAId, activityType: TaskActivityType.LABEL_ADDED },
    });
    const removed = await prisma.taskUpdate.findFirst({
      where: { taskId: taskAId, activityType: TaskActivityType.LABEL_REMOVED },
    });
    expect(added).toBeTruthy();
    expect(removed).toBeTruthy();
  });

  it("33 work log activity recorded", async () => {
    const added = await prisma.taskUpdate.findFirst({
      where: { taskId: taskAId, activityType: TaskActivityType.WORK_LOG_ADDED },
    });
    const updated = await prisma.taskUpdate.findFirst({
      where: { taskId: taskAId, activityType: TaskActivityType.WORK_LOG_UPDATED },
    });
    const deleted = await prisma.taskUpdate.findFirst({
      where: { taskId: taskAId, activityType: TaskActivityType.WORK_LOG_DELETED },
    });
    expect(added).toBeTruthy();
    expect(updated).toBeTruthy();
    expect(deleted).toBeTruthy();
  });

  it("34 workflow status preserved on collaboration mutations", async () => {
    const task = await prisma.workTask.findUniqueOrThrow({ where: { taskId: taskAId } });
    expect(task.workflowStatusId).toBe(preservedWorkflowStatusId);
  });

  it("35 comment vs history filter in listTaskActivity", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    const comments = await listTaskActivity(prisma, admin, taskAId, { filter: "comments" }, assertBoardAccess);
    const history = await listTaskActivity(prisma, admin, taskAId, { filter: "history" }, assertBoardAccess);
    expect(comments.items.every((i) => i.activityType === TaskActivityType.COMMENT)).toBe(true);
    expect(history.items.every((i) => i.activityType !== TaskActivityType.COMMENT)).toBe(true);
    expect(comments.items.some((i) => i.id === commentId)).toBe(true);
  });

  it("36 pagination cursor in listTaskActivity", async () => {
    const admin = actor(adminUserId, "Admin", Role.DEVELOPER_ADMIN);
    const page1 = await listTaskActivity(prisma, admin, taskAId, { limit: 2 }, assertBoardAccess);
    expect(page1.items.length).toBeLessThanOrEqual(2);
    if (page1.hasMore && page1.nextCursor) {
      const page2 = await listTaskActivity(
        prisma,
        admin,
        taskAId,
        { limit: 2, cursor: page1.nextCursor },
        assertBoardAccess,
      );
      expect(page2.items.every((i) => !page1.items.some((p) => p.id === i.id))).toBe(true);
    }
  });

  it("37 relation does not change workflow status", async () => {
    const before = await prisma.workTask.findUniqueOrThrow({ where: { taskId: taskBId } });
    const rels = await listTaskRelations(prisma, taskBId);
    expect(rels.blockedBy.length).toBeGreaterThan(0);
    const after = await prisma.workTask.findUniqueOrThrow({ where: { taskId: taskBId } });
    expect(after.workflowStatusId).toBe(before.workflowStatusId);
  });

  it("38 sprint membership unchanged on unrelated item", async () => {
    const count = await prisma.taskSprintMembership.count({
      where: { taskId: taskBId, removedAt: null },
    });
    expect(count).toBe(sprintMembershipBefore);
    const summary = await sprintSummaryForTask(prisma, taskBId);
    expect(summary?.sprintId).toBe(sprintId);
  });

  it("39 labels are not components", async () => {
    const componentCount = await prisma.workTaskComponent.count({ where: { taskId: taskAId } });
    expect(componentCount).toBe(0);
    const labelCount = await prisma.workTaskLabel.count({ where: { taskId: taskAId } });
    expect(labelCount).toBeGreaterThan(0);
  });

  it("40 work logs do not change attendance count", async () => {
    expect(await prisma.attendanceEvent.count()).toBe(attendanceBefore);
  });

  it("41 watcher does not add edit capability", async () => {
    const viewer = actor(viewerUserId, "Viewer", Role.EMPLOYEE, viewerEmployeeId);
    await watchWorkItem(prisma, viewer, taskAId, assertBoardAccess);
    await expect(
      assertProjectCapability(prisma, viewer, boardId, "EDIT_WORK_ITEM"),
    ).rejects.toBeInstanceOf(HttpError);
    await unwatchWorkItem(prisma, viewer, taskAId, assertBoardAccess);
  });

  it("42 issue keys unchanged", async () => {
    const task = await prisma.workTask.findUniqueOrThrow({ where: { taskId: taskAId } });
    expect(task.issueKey).toBe(preservedKey);
  });

  it("43 hierarchy unchanged", async () => {
    const story = await prisma.workTask.findUniqueOrThrow({ where: { taskId: storyId } });
    expect(story.parentTaskId).toBe(epicId);
  });

  it("44 workflow transition history baseline preserved", async () => {
    expect(await prisma.taskTransitionHistory.count()).toBe(transitionHistoryBefore);
  });

  it("45 sprint membership on seeded item preserved", async () => {
    expect(
      await prisma.taskSprintMembership.count({
        where: { taskId: taskBId, sprintId, removedAt: null },
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it("46 epic component links preserved", async () => {
    expect(await prisma.workTaskComponent.count({ where: { taskId: storyId } })).toBe(componentLinkBefore);
    expect(
      await prisma.workTaskComponent.findFirst({ where: { taskId: storyId, componentId } }),
    ).toBeTruthy();
  });

  it("47 rank unchanged", async () => {
    const task = await prisma.workTask.findUniqueOrThrow({ where: { taskId: taskAId } });
    expect(task.rank).toBe(preservedRank);
  });

  it("48 comments preserved", async () => {
    expect(
      await prisma.taskUpdate.count({
        where: { taskId: taskAId, activityType: TaskActivityType.COMMENT },
      }),
    ).toBe(commentCountBefore);
    const comment = await prisma.taskUpdate.findUnique({ where: { updateId: commentId } });
    expect(comment?.message).toBe("collab seed comment");
  });

  it("49 attachments preserved", async () => {
    expect(await prisma.taskAttachment.count({ where: { taskId: taskAId } })).toBe(attachmentCountBefore);
    const attachment = await prisma.taskAttachment.findUnique({ where: { attachmentId } });
    expect(attachment?.fileName).toBe("collab-seed.txt");
  });

  it("50 attendance unchanged", async () => {
    expect(await prisma.attendanceEvent.count()).toBe(attendanceBefore);
  });

  it("51 leave unchanged", async () => {
    expect(await prisma.leaveRequest.count()).toBe(leaveBefore);
  });

  it("52 user role unchanged", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    expect(user.role).toBe(userRoleBefore);
  });

  it("53 organization unchanged", async () => {
    expect(await prisma.department.count()).toBe(orgBefore);
  });
});
