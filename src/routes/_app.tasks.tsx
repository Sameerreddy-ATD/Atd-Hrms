import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/components/common/LoadingState";
import { BoardDirectory } from "@/components/tasks/BoardDirectory";
import { BoardFormDialog } from "@/components/tasks/BoardFormDialog";
import { BoardWorkspace } from "@/components/tasks/BoardWorkspace";
import { TaskDetailDialog } from "@/components/tasks/TaskDetailDialog";
import { TaskFormDialog, type TaskFormValue } from "@/components/tasks/TaskFormDialog";
import type { BoardForm } from "@/components/tasks/task-utils";
import { useAuth } from "@/lib/auth";
import { tasksApi } from "@/services/api";
import type { TaskAssignee, TaskBoard, TaskPriority, WorkTask } from "@/types/domain";

export const Route = createFileRoute("/_app/tasks")({ component: TaskBoardsPage });

const BOARD_MANAGER_ROLES = new Set(["developer_admin", "main_admin", "ceo", "hr", "manager"]);

function TaskBoardsPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<WorkTask[]>([]);
  const [assignedTotal, setAssignedTotal] = useState(0);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [boardAssignees, setBoardAssignees] = useState<TaskAssignee[]>([]);
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
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [defaultStageId, setDefaultStageId] = useState<string | undefined>();
  const [directoryMineOnly, setDirectoryMineOnly] = useState(false);

  const canManageBoards = !!user && BOARD_MANAGER_ROLES.has(user.role);
  const canChangeBoard = useCallback(
    (board: TaskBoard) =>
      !!user && (user.role === "developer_admin" || board.createdByUserId === user.id),
    [user],
  );

  const loadDirectory = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [mineRows, employeeRows, boardRows, archivedRows] = await Promise.all([
        tasksApi.list("mine", { limit: 100, detail: "summary" }),
        tasksApi.assignees().catch(() => []),
        tasksApi.boards(),
        tasksApi.boards(true),
      ]);
      setAssignedTasks(mineRows);
      setAssignedTotal(mineRows.length);
      setAssignees(employeeRows);
      setBoards(boardRows);
      setArchivedBoards(archivedRows);
      setSelectedBoardId((current) =>
        current && boardRows.some((board) => board.id === current) ? current : null,
      );
    } catch (cause) {
      setError((cause as Error).message || "Unable to load task boards.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBoardTasks = useCallback(async (boardId: string) => {
    setBoardLoading(true);
    setError("");
    try {
      const [taskRows, people] = await Promise.all([
        tasksApi.list("team", { boardId, limit: 1000, detail: "summary" }),
        tasksApi.assignees(boardId).catch(() => []),
      ]);
      setTasks(taskRows);
      setBoardAssignees(people);
      setSelectedTask((current) =>
        current ? (taskRows.find((task) => task.id === current.id) ?? current) : null,
      );
    } catch (cause) {
      setError((cause as Error).message || "Unable to load board tasks.");
    } finally {
      setBoardLoading(false);
    }
  }, []);

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
    () => boards.find((board) => board.id === selectedBoardId) ?? null,
    [boards, selectedBoardId],
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
        description: form.description || null,
        accessType: form.accessType,
        allowedRoles: form.allowedRoles,
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
      toast.success(editingBoard ? "Board settings updated" : "Board created");
      await loadDirectory(false);
      if (saved.id) await loadBoardTasks(saved.id);
    } catch (cause) {
      toast.error((cause as Error).message || "Unable to save the board.");
      await loadDirectory(false);
    } finally {
      setBoardSaving(false);
    }
  }

  async function archiveBoard(board: TaskBoard, archived: boolean) {
    try {
      await tasksApi.archiveBoard(board.id, board.version, archived);
      if (archived && selectedBoardId === board.id) setSelectedBoardId(null);
      toast.success(archived ? "Board archived" : "Board restored");
      await loadDirectory(false);
    } catch (cause) {
      toast.error((cause as Error).message || "Unable to update the board.");
      await loadDirectory(false);
    }
  }

  function openNewTask(stageId?: string) {
    if (!selectedBoard) return;
    setDefaultStageId(stageId);
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
        priority: form.priority,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
      });
      setTaskDialogOpen(false);
      toast.success("Task created");
      await loadBoardTasks(selectedBoard.id);
      await loadDirectory(false);
    } catch (cause) {
      toast.error((cause as Error).message || "Unable to create the task.");
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

  async function moveTask(task: WorkTask, stageId: string) {
    if (task.stageId === stageId) return;
    const previous = task;
    setTasks((current) =>
      current.map((entry) =>
        entry.id === task.id
          ? {
              ...entry,
              stageId,
              stage: selectedBoard?.stages.find((stage) => stage.id === stageId) ?? entry.stage,
            }
          : entry,
      ),
    );
    try {
      const updated = await tasksApi.update(task.id, {
        version: task.version,
        stageId,
      });
      applyTaskUpdate(updated);
      toast.success("Task moved");
    } catch (cause) {
      applyTaskUpdate(previous);
      toast.error((cause as Error).message || "Unable to move the task.");
      if (selectedBoardId) await loadBoardTasks(selectedBoardId);
    }
  }

  async function updateTask(
    task: WorkTask,
    patch: {
      title: string;
      description: string | null;
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
      toast.success("Task updated");
    } catch (cause) {
      const message = (cause as Error).message || "Unable to update the task.";
      toast.error(
        /version|conflict|changed/i.test(message)
          ? "This task was updated elsewhere. Reloaded the latest version."
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
      toast.success("Dates updated");
    } catch (cause) {
      toast.error((cause as Error).message || "Unable to move the task on the timeline.");
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
      toast.success("Subtask created");
      return created;
    } catch (cause) {
      toast.error((cause as Error).message || "Unable to create the subtask.");
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
      toast.success("Update posted");
    } catch (cause) {
      toast.error((cause as Error).message || "Unable to post the update.");
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
      toast.error((cause as Error).message || "Unable to open the task.");
    } finally {
      setDetailLoading(false);
    }
  }

  if (loading) return <LoadingState label="Loading task boards" />;

  if (error && !selectedBoard) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h1 className="font-semibold">Task boards could not be loaded</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => void loadDirectory()}
          className="mt-4 text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      {selectedBoard ? (
        <BoardWorkspace
          board={selectedBoard}
          boards={boards}
          tasks={tasks}
          assignees={boardAssignees.length ? boardAssignees : assignees}
          employeeId={user?.employeeId}
          loading={boardLoading}
          canChangeBoard={canChangeBoard(selectedBoard)}
          onBack={() => {
            setSelectedBoardId(null);
            setDirectoryMineOnly(false);
          }}
          onSwitchBoard={setSelectedBoardId}
          onNewTask={openNewTask}
          onEditBoard={() => {
            setEditingBoard(selectedBoard);
            setBoardDialogOpen(true);
          }}
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
          employeeId={user?.employeeId}
          canManage={canManageBoards}
          canChangeBoard={canChangeBoard}
          onOpenBoard={(boardId) => {
            setDirectoryMineOnly(false);
            setSelectedBoardId(boardId);
          }}
          onOpenTask={openTask}
          onNewBoard={openNewBoard}
          onArchiveBoard={archiveBoard}
          onViewAllAssigned={() => {
            const preferredBoardId =
              assignedTasks.find((task) => task.boardId)?.boardId ?? boards[0]?.id;
            if (!preferredBoardId) {
              toast.message("Create a board to review assigned work in a workspace.");
              return;
            }
            setDirectoryMineOnly(true);
            setSelectedBoardId(preferredBoardId);
          }}
        />
      )}

      <BoardFormDialog
        open={boardDialogOpen}
        onOpenChange={setBoardDialogOpen}
        board={editingBoard}
        assignees={assignees}
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
          selectedTaskBoard
            ? boardAssignees.length
              ? boardAssignees
              : assignees
            : assignees
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
            toast.success(archived ? "Task archived" : "Task restored");
            if (selectedBoardId) await loadBoardTasks(selectedBoardId);
          } catch (cause) {
            toast.error((cause as Error).message || "Unable to archive the task.");
          } finally {
            setTaskSaving(false);
          }
        }}
        onMove={moveTask}
        onAddUpdate={addTaskUpdate}
        onCreateSubtask={createSubtask}
        onOpenTask={openTask}
      />
    </>
  );
}
