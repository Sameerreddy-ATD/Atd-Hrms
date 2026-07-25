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
import type { TaskAssignee, TaskBoard, WorkTask } from "@/types/domain";

export const Route = createFileRoute("/_app/tasks")({ component: TaskBoardsPage });

const BOARD_MANAGER_ROLES = new Set(["developer_admin", "main_admin", "ceo", "hr", "manager"]);

function TaskBoardsPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [archivedBoards, setArchivedBoards] = useState<TaskBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<WorkTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<TaskBoard | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [defaultStageId, setDefaultStageId] = useState<string | undefined>();

  const canManageBoards = !!user && BOARD_MANAGER_ROLES.has(user.role);
  const canChangeBoard = useCallback(
    (board: TaskBoard) =>
      !!user && (user.role === "developer_admin" || board.createdByUserId === user.id),
    [user],
  );

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [taskRows, employeeRows, boardRows, archivedRows] = await Promise.all([
        tasksApi.list("team", { limit: 1000 }),
        tasksApi.assignees().catch(() => []),
        tasksApi.boards(),
        tasksApi.boards(true),
      ]);
      setTasks(taskRows);
      setAssignees(employeeRows);
      setBoards(boardRows);
      setArchivedBoards(archivedRows);
      setSelectedTask((current) =>
        current ? (taskRows.find((task) => task.id === current.id) ?? current) : null,
      );
      setSelectedBoardId((current) =>
        current && boardRows.some((board) => board.id === current) ? current : null,
      );
    } catch (cause) {
      setError((cause as Error).message || "Unable to load task boards.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        accessType: form.accessType,
        allowedRoles: form.allowedRoles,
        memberEmployeeIds: form.memberEmployeeIds,
        stages: form.stages,
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
      await load(false);
    } catch (cause) {
      toast.error((cause as Error).message || "Unable to save the board.");
      await load(false);
    } finally {
      setSaving(false);
    }
  }

  async function archiveBoard(board: TaskBoard, archived: boolean) {
    try {
      await tasksApi.archiveBoard(board.id, board.version, archived);
      if (archived && selectedBoardId === board.id) setSelectedBoardId(null);
      toast.success(archived ? "Board archived" : "Board restored");
      await load(false);
    } catch (cause) {
      toast.error((cause as Error).message || "Unable to update the board.");
      await load(false);
    }
  }

  function openNewTask(stageId?: string) {
    if (!selectedBoard) return;
    setDefaultStageId(stageId);
    setTaskDialogOpen(true);
  }

  async function createTask(form: TaskFormValue) {
    if (!selectedBoard) return;
    setSaving(true);
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
      await load(false);
    } catch (cause) {
      toast.error((cause as Error).message || "Unable to create the task.");
    } finally {
      setSaving(false);
    }
  }

  async function moveTask(task: WorkTask, stageId: string) {
    if (task.stageId === stageId) return;
    try {
      const updated = await tasksApi.update(task.id, {
        version: task.version,
        stageId,
      });
      setTasks((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setSelectedTask((current) => (current?.id === updated.id ? updated : current));
      toast.success("Task moved");
    } catch (cause) {
      toast.error((cause as Error).message || "Unable to move the task.");
      await load(false);
    }
  }

  async function addTaskUpdate(task: WorkTask, message: string, progress: number) {
    setSaving(true);
    try {
      const updated = await tasksApi.addLog(task.id, {
        version: task.version,
        message,
        progress,
      });
      setTasks((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setSelectedTask(updated);
      toast.success("Update posted");
    } catch (cause) {
      toast.error((cause as Error).message || "Unable to post the update.");
      await load(false);
    } finally {
      setSaving(false);
    }
  }

  function openTask(task: WorkTask) {
    setSelectedTask(task);
    setTaskDetailOpen(true);
  }

  if (loading) return <LoadingState label="Loading task boards" />;

  if (error) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h1 className="font-semibold">Task boards could not be loaded</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
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
          assignees={assignees}
          employeeId={user?.employeeId}
          canChangeBoard={canChangeBoard(selectedBoard)}
          onBack={() => setSelectedBoardId(null)}
          onSwitchBoard={setSelectedBoardId}
          onNewTask={openNewTask}
          onEditBoard={() => {
            setEditingBoard(selectedBoard);
            setBoardDialogOpen(true);
          }}
          onOpenTask={openTask}
          onMoveTask={moveTask}
        />
      ) : (
        <BoardDirectory
          boards={boards}
          archivedBoards={archivedBoards}
          tasks={tasks}
          employeeId={user?.employeeId}
          canManage={canManageBoards}
          canChangeBoard={canChangeBoard}
          onOpenBoard={setSelectedBoardId}
          onOpenTask={openTask}
          onNewBoard={openNewBoard}
          onArchiveBoard={archiveBoard}
        />
      )}

      <BoardFormDialog
        open={boardDialogOpen}
        onOpenChange={setBoardDialogOpen}
        board={editingBoard}
        assignees={assignees}
        saving={saving}
        onSave={saveBoard}
      />
      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        board={selectedBoard}
        assignees={assignees}
        defaultStageId={defaultStageId}
        saving={saving}
        onCreate={createTask}
      />
      <TaskDetailDialog
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
        task={selectedTask}
        board={selectedTaskBoard}
        saving={saving}
        onMove={moveTask}
        onAddUpdate={addTaskUpdate}
      />
    </>
  );
}
