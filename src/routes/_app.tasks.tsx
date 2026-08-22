import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LoadingState } from "@/components/common/LoadingState";
import { BoardDirectory } from "@/components/tasks/BoardDirectory";
import { BoardFormDialog } from "@/components/tasks/BoardFormDialog";
import { BoardWorkspace } from "@/components/tasks/BoardWorkspace";
import { ProjectSettingsShell } from "@/components/tasks/ProjectSettingsShell";
import { TaskDetailDialog } from "@/components/tasks/TaskDetailDialog";
import { TaskFormDialog, type TaskFormValue } from "@/components/tasks/TaskFormDialog";
import type { BoardForm } from "@/components/tasks/task-utils";
import { useAuth } from "@/lib/auth";
import { tasksApi } from "@/services/api";
import type {
  Department,
  TaskAssignee,
  TaskBoard,
  TaskPriority,
  TaskProjectRole,
  WorkTask,
} from "@/types/domain";

export const Route = createFileRoute("/_app/tasks")({ component: TaskBoardsPage });

function boardHasCapability(board: TaskBoard | null | undefined, capability: string) {
  if (!board) return false;
  if (Array.isArray(board.myCapabilities)) {
    return board.myCapabilities.includes(capability as never);
  }
  // Pre-capability payloads: keep write defaults; manage stays creator/admin via canChangeBoard.
  if (capability === "MANAGE_PROJECT" || capability === "ARCHIVE_PROJECT") return false;
  return true;
}

function TaskBoardsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<WorkTask[]>([]);
  const [assignedTotal, setAssignedTotal] = useState(0);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [boardAssignees, setBoardAssignees] = useState<TaskAssignee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [archivedBoards, setArchivedBoards] = useState<TaskBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<WorkTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [boardSaving, setBoardSaving] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<TaskBoard | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [defaultStageId, setDefaultStageId] = useState<string | undefined>();
  const [directoryMineOnly, setDirectoryMineOnly] = useState(false);

  // Heads, team members, sales, HR — anyone who can open Work Planner can create projects.
  const canManageBoards = !!user;
  const canChangeBoard = useCallback(
    (board: TaskBoard) =>
      !!user &&
      (boardHasCapability(board, "MANAGE_PROJECT") ||
        user.role === "developer_admin" ||
        board.createdByUserId === user.id),
    [user],
  );
  const canOpenProjectSettings = useCallback(
    (board: TaskBoard) =>
      canChangeBoard(board) ||
      boardHasCapability(board, "ARCHIVE_PROJECT") ||
      boardHasCapability(board, "MANAGE_PROJECT"),
    [canChangeBoard],
  );

  const loadDirectory = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [mineRows, employeeRows, boardRows, archivedRows, departmentRows] = await Promise.all([
        tasksApi.list("mine", { limit: 100, detail: "summary" }),
        tasksApi.assignees().catch(() => []),
        tasksApi.boards(),
        tasksApi.boards(true),
        tasksApi.organizationUnits().catch(() => []),
      ]);
      setAssignedTasks(mineRows);
      setAssignedTotal(mineRows.length);
      setAssignees(employeeRows);
      setBoards(boardRows);
      setArchivedBoards(archivedRows);
      setDepartments(departmentRows as Department[]);
      setSelectedBoardId((current) =>
        current && boardRows.some((board) => board.id === current) ? current : null,
      );
    } catch (cause) {
      setError((cause as Error).message || t("pages.tasks.toastLoadBoardsFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadBoardTasks = useCallback(async (boardId: string) => {
    setBoardLoading(true);
    setError("");
    try {
      const [taskRows, people] = await Promise.all([
        tasksApi.list("team", {
          boardId,
          limit: 1000,
          detail: "summary",
          includeArchived: true,
        }),
        tasksApi.assignees(boardId).catch(() => []),
      ]);
      setTasks(taskRows);
      setBoardAssignees(people);
      setSelectedTask((current) => {
        if (!current) return null;
        const row = taskRows.find((task) => task.id === current.id);
        if (!row) return current;
        return {
          ...row,
          updates: current.updates?.length ? current.updates : row.updates,
          availableTransitions: current.availableTransitions,
          workflowStatus: row.workflowStatus ?? current.workflowStatus,
          workflowStatusId: row.workflowStatusId ?? current.workflowStatusId,
          resolution: row.resolution ?? current.resolution,
        };
      });
    } catch (cause) {
      setError((cause as Error).message || t("pages.tasks.toastLoadTasksFailed"));
    } finally {
      setBoardLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    if (!selectedBoardId) {
      setTasks([]);
      setBoardAssignees([]);
      return;
    }
    void loadBoardTasks(selectedBoardId);
  }, [loadBoardTasks, selectedBoardId]);

  const selectedBoard = useMemo(
    () =>
      boards.find((board) => board.id === selectedBoardId) ??
      archivedBoards.find((board) => board.id === selectedBoardId) ??
      null,
    [archivedBoards, boards, selectedBoardId],
  );
  const selectedTaskBoard = useMemo(
    () =>
      selectedTask?.boardId
        ? ([...boards, ...archivedBoards].find((board) => board.id === selectedTask.boardId) ??
          null)
        : null,
    [archivedBoards, boards, selectedTask],
  );

  function openNewBoard() {
    setEditingBoard(null);
    setBoardDialogOpen(true);
  }

  async function saveBoard(form: BoardForm) {
    setBoardSaving(true);
    try {
      const payload = {
        name: form.name,
        keyPrefix: form.keyPrefix || undefined,
        description: form.description || null,
        accessType: form.accessType,
        allowedDepartmentIds: form.allowedDepartmentIds,
        memberEmployeeIds: form.memberEmployeeIds,
        stages: form.stages,
        customFieldDefs: form.customFieldDefs,
      };
      const saved = editingBoard
        ? await tasksApi.updateBoard(editingBoard.id, {
            version: editingBoard.version,
            ...payload,
          })
        : await tasksApi.createBoard(payload);
      setBoardDialogOpen(false);
      setEditingBoard(null);
      setSelectedBoardId(saved.id);
      toast.success(
        editingBoard ? t("pages.tasks.toastProjectUpdated") : t("pages.tasks.toastProjectCreated"),
      );
      await loadDirectory(false);
      if (saved.id) await loadBoardTasks(saved.id);
    } catch (cause) {
      toast.error((cause as Error).message || t("pages.tasks.toastSaveBoardFailed"));
      await loadDirectory(false);
    } finally {
      setBoardSaving(false);
    }
  }

  async function archiveBoard(board: TaskBoard, archived: boolean) {
    try {
      const updated = await tasksApi.archiveBoard(board.id, board.version, archived);
      setBoards((current) =>
        archived
          ? current.filter((entry) => entry.id !== board.id)
          : current.map((entry) => (entry.id === board.id ? updated : entry)),
      );
      if (archived && selectedBoardId === board.id && !settingsOpen) setSelectedBoardId(null);
      if (!archived) {
        setBoards((current) =>
          current.some((entry) => entry.id === updated.id) ? current : [updated, ...current],
        );
      }
      toast.success(
        archived ? t("pages.tasks.toastProjectArchived") : t("pages.tasks.toastProjectRestored"),
      );
      await loadDirectory(false);
      if (settingsOpen && archived) {
        /* stay on settings so restore UI can show archived state after reload */
      }
    } catch (cause) {
      toast.error((cause as Error).message || t("pages.tasks.toastUpdateBoardFailed"));
      await loadDirectory(false);
    }
  }

  async function saveSettingsDetails(patch: {
    name: string;
    keyPrefix: string;
    description: string | null;
    leadEmployeeId: string | null;
    accessType: TaskBoard["accessType"];
  }) {
    if (!selectedBoard) return;
    setBoardSaving(true);
    try {
      const saved = await tasksApi.updateBoard(selectedBoard.id, {
        version: selectedBoard.version,
        name: patch.name,
        keyPrefix: patch.keyPrefix || undefined,
        description: patch.description,
        leadEmployeeId: patch.leadEmployeeId,
        accessType: patch.accessType,
        allowedDepartmentIds: selectedBoard.allowedDepartmentIds,
        memberEmployeeIds: selectedBoard.memberEmployeeIds,
        members: selectedBoard.members,
        stages: selectedBoard.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          color: stage.color,
          status: stage.status,
        })),
        customFieldDefs: selectedBoard.customFieldDefs,
      });
      setBoards((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
      toast.success(t("pages.tasks.toastProjectUpdated"));
      await loadDirectory(false);
    } catch (cause) {
      toast.error((cause as Error).message || t("pages.tasks.toastSaveBoardFailed"));
    } finally {
      setBoardSaving(false);
    }
  }

  async function saveSettingsMembers(members: Array<{ employeeId: string; role: TaskProjectRole }>) {
    if (!selectedBoard) return;
    setBoardSaving(true);
    try {
      const saved = await tasksApi.updateBoard(selectedBoard.id, {
        version: selectedBoard.version,
        name: selectedBoard.name,
        keyPrefix: selectedBoard.keyPrefix,
        description: selectedBoard.description ?? null,
        leadEmployeeId: selectedBoard.leadEmployeeId ?? null,
        accessType: selectedBoard.accessType,
        allowedDepartmentIds: selectedBoard.allowedDepartmentIds,
        memberEmployeeIds: members.map((row) => row.employeeId),
        members,
        stages: selectedBoard.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          color: stage.color,
          status: stage.status,
        })),
        customFieldDefs: selectedBoard.customFieldDefs,
      });
      setBoards((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
      toast.success(t("pages.tasks.toastProjectUpdated"));
      await loadDirectory(false);
    } catch (cause) {
      toast.error((cause as Error).message || t("pages.tasks.toastSaveBoardFailed"));
    } finally {
      setBoardSaving(false);
    }
  }

  function openNewTask(stageId?: string) {
    if (!selectedBoard) return;
    setDefaultStageId(
      stageId ||
        selectedBoard.stages.find((stage) => stage.status === "TODO")?.id ||
        selectedBoard.stages[0]?.id,
    );
    setTaskDialogOpen(true);
  }

  async function createTask(form: TaskFormValue) {
    if (!selectedBoard) return;
    setTaskSaving(true);
    try {
      await tasksApi.create({
        title: form.title,
        description: form.description || null,
        assigneeEmployeeIds: form.assigneeEmployeeIds,
        boardId: selectedBoard.id,
        stageId: form.stageId,
        issueType: form.issueType,
        priority: form.priority,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
      });
      setTaskDialogOpen(false);
      toast.success(t("pages.tasks.toastIssueCreated"));
      await loadBoardTasks(selectedBoard.id);
      await loadDirectory(false);
    } catch (cause) {
      toast.error((cause as Error).message || t("pages.tasks.toastCreateTaskFailed"));
    } finally {
      setTaskSaving(false);
    }
  }

  function applyTaskUpdate(updated: WorkTask) {
    setTasks((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
    setAssignedTasks((current) =>
      current.map((entry) => (entry.id === updated.id ? updated : entry)),
    );
    setSelectedTask((current) => (current?.id === updated.id ? updated : current));
  }

  async function moveTask(
    task: WorkTask,
    stageId: string,
    options?: { rankBeforeTaskId?: string; rankAfterTaskId?: string },
  ) {
    const sameStage = task.stageId === stageId;
    if (sameStage && !options?.rankBeforeTaskId && !options?.rankAfterTaskId) return;
    const previous = task;
    setTasks((current) => {
      const without = current.filter((entry) => entry.id !== task.id);
      const moved: WorkTask = {
        ...task,
        stageId,
        stage: selectedBoard?.stages.find((stage) => stage.id === stageId) ?? task.stage,
        version: task.version + 1,
      };
      const column = without
        .filter((entry) => entry.boardId === task.boardId && entry.stageId === stageId)
        .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));
      let insertAt = column.length;
      if (options?.rankAfterTaskId) {
        const afterIndex = column.findIndex((entry) => entry.id === options.rankAfterTaskId);
        if (afterIndex >= 0) insertAt = afterIndex;
      } else if (options?.rankBeforeTaskId) {
        const beforeIndex = column.findIndex((entry) => entry.id === options.rankBeforeTaskId);
        if (beforeIndex >= 0) insertAt = beforeIndex + 1;
      }
      const beforeRank = column[insertAt - 1]?.rank;
      const afterRank = column[insertAt]?.rank;
      const optimisticRank =
        beforeRank != null && afterRank != null
          ? (beforeRank + afterRank) / 2
          : beforeRank != null
            ? beforeRank + 1000
            : afterRank != null
              ? afterRank / 2
              : (task.rank ?? 1000);
      moved.rank = optimisticRank;
      const nextColumn = [...column];
      nextColumn.splice(insertAt, 0, moved);
      const others = without.filter(
        (entry) => !(entry.boardId === task.boardId && entry.stageId === stageId),
      );
      return [...others, ...nextColumn];
    });
    try {
      const updated = await tasksApi.update(task.id, {
        version: task.version,
        stageId,
        ...(options?.rankBeforeTaskId ? { rankBeforeTaskId: options.rankBeforeTaskId } : {}),
        ...(options?.rankAfterTaskId ? { rankAfterTaskId: options.rankAfterTaskId } : {}),
      });
      applyTaskUpdate(updated);
      toast.success(sameStage ? t("pages.tasks.toastIssueReordered") : t("pages.tasks.toastIssueMoved"));
    } catch (cause) {
      applyTaskUpdate(previous);
      toast.error((cause as Error).message || t("pages.tasks.toastMoveTaskFailed"));
      if (selectedBoardId) await loadBoardTasks(selectedBoardId);
    }
  }

  async function updateTask(
    task: WorkTask,
    patch: {
      title: string;
      description: string | null;
      issueType: import("@/types/domain").TaskIssueType;
      priority: TaskPriority;
      startDate: string | null;
      dueDate: string | null;
      stageId?: string;
      boardId?: string;
      assigneeEmployeeIds: string[];
      customFields?: Record<string, string | number | boolean | null>;
    },
  ) {
    setTaskSaving(true);
    try {
      const updated = await tasksApi.update(task.id, {
        version: task.version,
        title: patch.title,
        description: patch.description,
        issueType: patch.issueType,
        priority: patch.priority,
        startDate: patch.startDate,
        dueDate: patch.dueDate,
        assigneeEmployeeIds: patch.assigneeEmployeeIds,
        ...(patch.stageId ? { stageId: patch.stageId } : {}),
        ...(patch.boardId ? { boardId: patch.boardId } : {}),
        ...(patch.customFields ? { customFields: patch.customFields } : {}),
      });
      applyTaskUpdate(updated);
      if (patch.boardId && patch.boardId !== task.boardId) {
        setSelectedBoardId(patch.boardId);
      }
      toast.success(t("pages.tasks.toastIssueUpdated"));
    } catch (cause) {
      const message = (cause as Error).message || t("pages.tasks.toastUpdateTaskFailed");
      toast.error(
        /version|conflict|changed/i.test(message)
          ? t("pages.tasks.toastVersionConflict")
          : message,
      );
      if (selectedBoardId) await loadBoardTasks(selectedBoardId);
      try {
        const fresh = await tasksApi.get(task.id);
        setSelectedTask(fresh);
      } catch {
        /* keep current */
      }
    } finally {
      setTaskSaving(false);
    }
  }

  async function rescheduleTask(
    task: WorkTask,
    dates: { startDate: string | null; dueDate: string | null },
  ) {
    try {
      const updated = await tasksApi.update(task.id, {
        version: task.version,
        startDate: dates.startDate,
        dueDate: dates.dueDate,
      });
      applyTaskUpdate(updated);
      toast.success(t("pages.tasks.toastDatesUpdated"));
    } catch (cause) {
      toast.error((cause as Error).message || t("pages.tasks.toastRescheduleFailed"));
      if (selectedBoardId) await loadBoardTasks(selectedBoardId);
    }
  }

  async function createSubtask(parent: WorkTask, title: string) {
    setTaskSaving(true);
    try {
      const created = await tasksApi.create({
        title,
        assigneeEmployeeIds: parent.assignees.map((person) => person.id),
        parentTaskId: parent.id,
        boardId: parent.boardId ?? null,
        stageId: parent.stageId ?? null,
        priority: parent.priority,
      });
      applyTaskUpdate({ ...parent, subtaskCount: (parent.subtaskCount ?? 0) + 1 });
      if (selectedBoardId) await loadBoardTasks(selectedBoardId);
      toast.success(t("pages.tasks.toastSubtaskCreated"));
      return created;
    } catch (cause) {
      toast.error((cause as Error).message || t("pages.tasks.toastCreateSubtaskFailed"));
      throw cause;
    } finally {
      setTaskSaving(false);
    }
  }

  async function addTaskUpdate(task: WorkTask, message: string, progress: number) {
    setTaskSaving(true);
    try {
      const updated = await tasksApi.addLog(task.id, {
        version: task.version,
        message,
        progress,
      });
      applyTaskUpdate(updated);
      toast.success(t("pages.tasks.toastUpdatePosted"));
    } catch (cause) {
      toast.error((cause as Error).message || t("pages.tasks.toastPostUpdateFailed"));
      if (selectedBoardId) await loadBoardTasks(selectedBoardId);
    } finally {
      setTaskSaving(false);
    }
  }

  async function openTask(task: WorkTask) {
    setSelectedTask(task);
    setTaskDetailOpen(true);
    setDetailLoading(true);
    try {
      const full = await tasksApi.get(task.id);
      setSelectedTask(full);
    } catch (cause) {
      toast.error((cause as Error).message || t("pages.tasks.toastOpenTaskFailed"));
    } finally {
      setDetailLoading(false);
    }
  }

  if (loading) return <LoadingState label={t("pages.loading.tasks")} />;

  if (error && !selectedBoard) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h1 className="font-semibold">{t("pages.tasks.loadErrorTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => void loadDirectory()}
          className="mt-4 text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      {selectedBoard && settingsOpen ? (
        <ProjectSettingsShell
          board={selectedBoard}
          assignees={boardAssignees.length ? boardAssignees : assignees}
          saving={boardSaving}
          canManage={canChangeBoard(selectedBoard)}
          canArchive={
            boardHasCapability(selectedBoard, "ARCHIVE_PROJECT") || canChangeBoard(selectedBoard)
          }
          onBack={() => setSettingsOpen(false)}
          onSaveDetails={saveSettingsDetails}
          onSaveMembers={saveSettingsMembers}
          onArchive={async (archived) => {
            await archiveBoard(selectedBoard, archived);
          }}
        />
      ) : selectedBoard ? (
        <BoardWorkspace
          board={selectedBoard}
          boards={boards}
          tasks={tasks}
          assignees={boardAssignees.length ? boardAssignees : assignees}
          employeeId={user?.employeeId}
          loading={boardLoading}
          canChangeBoard={canOpenProjectSettings(selectedBoard)}
          canCreateWorkItem={boardHasCapability(selectedBoard, "CREATE_WORK_ITEM")}
          canTransitionWorkItem={boardHasCapability(selectedBoard, "TRANSITION_WORK_ITEM")}
          canManageSprint={boardHasCapability(selectedBoard, "MANAGE_SPRINT")}
          canManageComponents={boardHasCapability(selectedBoard, "MANAGE_COMPONENTS")}
          canEditEpicDates={
            boardHasCapability(selectedBoard, "EDIT_WORK_ITEM") ||
            boardHasCapability(selectedBoard, "MANAGE_COMPONENTS")
          }
          onPlanChanged={() => {
            if (selectedBoardId) void loadBoardTasks(selectedBoardId);
          }}
          onBack={() => {
            setSelectedBoardId(null);
            setDirectoryMineOnly(false);
            setSettingsOpen(false);
          }}
          onSwitchBoard={(boardId) => {
            setSettingsOpen(false);
            setSelectedBoardId(boardId);
          }}
          onNewTask={openNewTask}
          onEditBoard={() => setSettingsOpen(true)}
          onOpenTask={openTask}
          onMoveTask={moveTask}
          onRescheduleTask={rescheduleTask}
          initialMineOnly={directoryMineOnly}
        />
      ) : (
        <BoardDirectory
          boards={boards}
          archivedBoards={archivedBoards}
          tasks={assignedTasks}
          assignedTotal={assignedTotal}
          departments={departments}
          employeeId={user?.employeeId}
          canManage={canManageBoards}
          canChangeBoard={canChangeBoard}
          onOpenBoard={(boardId) => {
            setDirectoryMineOnly(false);
            setSettingsOpen(false);
            setSelectedBoardId(boardId);
          }}
          onOpenTask={openTask}
          onNewBoard={openNewBoard}
          onArchiveBoard={archiveBoard}
          onViewAllAssigned={() => {
            const preferredBoardId =
              assignedTasks.find((task) => task.boardId)?.boardId ?? boards[0]?.id;
            if (!preferredBoardId) {
              toast.message(t("pages.tasks.createBoardHint"));
              return;
            }
            setDirectoryMineOnly(true);
            setSettingsOpen(false);
            setSelectedBoardId(preferredBoardId);
          }}
        />
      )}

      <BoardFormDialog
        open={boardDialogOpen}
        onOpenChange={setBoardDialogOpen}
        board={editingBoard}
        assignees={assignees}
        departments={departments}
        saving={boardSaving}
        onSave={saveBoard}
      />
      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        board={selectedBoard}
        assignees={boardAssignees.length ? boardAssignees : assignees}
        defaultStageId={defaultStageId}
        saving={taskSaving}
        onCreate={createTask}
      />
      <TaskDetailDialog
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
        task={selectedTask}
        board={selectedTaskBoard}
        boards={boards}
        assignees={
          selectedTaskBoard ? (boardAssignees.length ? boardAssignees : assignees) : assignees
        }
        loading={detailLoading}
        saving={taskSaving}
        onSave={updateTask}
        onArchive={async (task, archived) => {
          setTaskSaving(true);
          try {
            const result = await tasksApi.archiveTask(task.id, task.version, archived);
            applyTaskUpdate({
              ...task,
              version: result.version,
              archivedAt: result.archivedAt ?? undefined,
            });
            toast.success(
              archived ? t("pages.tasks.toastIssueArchived") : t("pages.tasks.toastIssueRestored"),
            );
            if (selectedBoardId) await loadBoardTasks(selectedBoardId);
          } catch (cause) {
            toast.error((cause as Error).message || t("pages.tasks.toastArchiveTaskFailed"));
          } finally {
            setTaskSaving(false);
          }
        }}
        onMove={moveTask}
        onTransition={async (task, payload) => {
          setTaskSaving(true);
          try {
            const updated = await tasksApi.transition(task.id, {
              version: task.version,
              transitionId: payload.transitionId,
              ...(payload.comment ? { comment: payload.comment } : {}),
            });
            applyTaskUpdate(updated);
            toast.success(t("pages.tasks.toastIssueMoved"));
          } catch (cause) {
            toast.error((cause as Error).message || t("pages.tasks.toastMoveTaskFailed"));
            throw cause;
          } finally {
            setTaskSaving(false);
          }
        }}
        onTaskUpdated={applyTaskUpdate}
        onAddUpdate={addTaskUpdate}
        onCreateSubtask={createSubtask}
        onOpenTask={openTask}
        canManageSprint={
          selectedTaskBoard
            ? boardHasCapability(selectedTaskBoard, "MANAGE_SPRINT")
            : false
        }
        onSprintChanged={(updated) => {
          applyTaskUpdate(updated);
          if (selectedBoardId) void loadBoardTasks(selectedBoardId);
        }}
      />
    </>
  );
}
