import { createFileRoute } from "@tanstack/react-router";
import { format, isBefore, isSameDay, parseISO, startOfToday } from "date-fns";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  MessageSquareText,
  Plus,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type {
  TaskAssignee,
  TaskBoard,
  TaskPriority,
  TaskStage,
  TaskStatus,
  WorkTask,
} from "@/mock/types";
import { tasksApi } from "@/services/api";

export const Route = createFileRoute("/_app/tasks")({ component: TasksPage });

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  REVIEW: "In review",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  TODO: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  IN_PROGRESS:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  BLOCKED:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
  REVIEW:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
  COMPLETED:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  CANCELLED: "border-border bg-muted text-muted-foreground",
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  LOW: "text-muted-foreground",
  MEDIUM: "text-sky-700 dark:text-sky-300",
  HIGH: "text-amber-700 dark:text-amber-300",
  URGENT: "text-rose-700 dark:text-rose-300",
};

const STAGE_COLORS: Record<TaskStage["color"], string> = {
  SLATE: "bg-slate-400",
  BLUE: "bg-sky-500",
  AMBER: "bg-amber-500",
  VIOLET: "bg-violet-500",
  EMERALD: "bg-emerald-500",
  RED: "bg-rose-500",
};

const EMPTY_TASK = {
  title: "",
  description: "",
  assigneeEmployeeIds: [] as string[],
  priority: "MEDIUM" as TaskPriority,
  startDate: "",
  dueDate: "",
  boardId: "",
  stageId: "",
};

type BoardForm = {
  name: string;
  description: string;
  accessType: TaskBoard["accessType"];
  allowedRoles: string[];
  memberEmployeeIds: string[];
  stages: Array<{ name: string; color: TaskStage["color"]; status: TaskStatus }>;
};

const DEFAULT_BOARD: BoardForm = {
  name: "",
  description: "",
  accessType: "OPEN",
  allowedRoles: [],
  memberEmployeeIds: [],
  stages: [
    { name: "To do", color: "SLATE", status: "TODO" },
    { name: "In progress", color: "BLUE", status: "IN_PROGRESS" },
    { name: "In review", color: "VIOLET", status: "REVIEW" },
    { name: "Completed", color: "EMERALD", status: "COMPLETED" },
  ],
};

const BOARD_ROLES = [
  "MAIN_ADMIN",
  "CEO",
  "HR",
  "MANAGER",
  "EMPLOYEE",
  "SALES",
  "DRIVER",
  "FIELD_STAFF",
];

function dateValue(value: string) {
  return parseISO(`${value}T00:00:00`);
}

function dueLabel(value?: string) {
  if (!value) return "No due date";
  const date = dateValue(value);
  if (isSameDay(date, startOfToday())) return "Due today";
  if (isBefore(date, startOfToday())) return `Overdue · ${format(date, "d MMM")}`;
  return `Due ${format(date, "d MMM")}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [scope, setScope] = useState<"mine" | "team">(user?.employeeId ? "mine" : "team");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TaskStatus | "ACTIVE" | "ALL">("ACTIVE");
  const [priority, setPriority] = useState<TaskPriority | "ALL">("ALL");
  const [boardId, setBoardId] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<WorkTask | null>(null);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK);
  const [boardForm, setBoardForm] = useState<BoardForm>(DEFAULT_BOARD);
  const [saving, setSaving] = useState(false);
  const [logMessage, setLogMessage] = useState("");
  const [logStatus, setLogStatus] = useState<TaskStatus>("IN_PROGRESS");
  const [logProgress, setLogProgress] = useState(0);

  const canManage =
    !!user && ["developer_admin", "main_admin", "ceo", "hr", "manager"].includes(user.role);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [taskRows, employeeRows, boardRows] = await Promise.all([
        tasksApi.list(scope, { limit: 300 }),
        tasksApi.assignees().catch(() => []),
        tasksApi.boards(),
      ]);
      setTasks(taskRows);
      setAssignees(employeeRows);
      setBoards(boardRows);
      setSelected((current) => taskRows.find((task) => task.id === current?.id) ?? current);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleTasks = useMemo(() => {
    const search = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (boardId !== "ALL" && task.boardId !== boardId) return false;
      if (priority !== "ALL" && task.priority !== priority) return false;
      if (status === "ACTIVE" && ["COMPLETED", "CANCELLED"].includes(task.status)) return false;
      if (status !== "ALL" && status !== "ACTIVE" && task.status !== status) return false;
      if (!search) return true;
      return [
        task.title,
        task.description,
        task.boardName,
        ...task.assignees.map((entry) => entry.name),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [boardId, priority, query, status, tasks]);

  const today = startOfToday();
  const summary = useMemo(
    () => ({
      dueToday: tasks.filter(
        (task) =>
          task.dueDate && isSameDay(dateValue(task.dueDate), today) && task.status !== "COMPLETED",
      ).length,
      overdue: tasks.filter(
        (task) =>
          task.dueDate &&
          isBefore(dateValue(task.dueDate), today) &&
          !["COMPLETED", "CANCELLED"].includes(task.status),
      ).length,
      active: tasks.filter((task) => ["IN_PROGRESS", "BLOCKED", "REVIEW"].includes(task.status))
        .length,
      completed: tasks.filter((task) => task.status === "COMPLETED").length,
    }),
    [tasks, today],
  );

  const groups = useMemo(() => {
    const active = visibleTasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status));
    return [
      {
        title: "Needs attention",
        tasks: active.filter(
          (task) =>
            task.status === "BLOCKED" || (task.dueDate && isBefore(dateValue(task.dueDate), today)),
        ),
      },
      {
        title: "Today",
        tasks: active.filter(
          (task) =>
            task.status !== "BLOCKED" && task.dueDate && isSameDay(dateValue(task.dueDate), today),
        ),
      },
      {
        title: "Upcoming",
        tasks: active.filter(
          (task) =>
            task.status !== "BLOCKED" &&
            task.dueDate &&
            !isBefore(dateValue(task.dueDate), today) &&
            !isSameDay(dateValue(task.dueDate), today),
        ),
      },
      {
        title: "No due date",
        tasks: active.filter((task) => task.status !== "BLOCKED" && !task.dueDate),
      },
      {
        title: "Completed or cancelled",
        tasks: visibleTasks.filter((task) => ["COMPLETED", "CANCELLED"].includes(task.status)),
      },
    ].filter((group) => group.tasks.length > 0);
  }, [today, visibleTasks]);

  const selectedBoard = boards.find((board) => board.id === taskForm.boardId);

  function toggleAssignee(employeeId: string) {
    setTaskForm((current) => ({
      ...current,
      assigneeEmployeeIds: current.assigneeEmployeeIds.includes(employeeId)
        ? current.assigneeEmployeeIds.filter((id) => id !== employeeId)
        : [...current.assigneeEmployeeIds, employeeId],
    }));
  }

  async function createTask() {
    if (!taskForm.title.trim() || taskForm.assigneeEmployeeIds.length === 0) {
      toast.error("Add a task title and at least one assignee");
      return;
    }
    setSaving(true);
    try {
      await tasksApi.create({
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || null,
        assigneeEmployeeIds: taskForm.assigneeEmployeeIds,
        priority: taskForm.priority,
        startDate: taskForm.startDate || null,
        dueDate: taskForm.dueDate || null,
        boardId: taskForm.boardId || null,
        stageId: taskForm.stageId || null,
      });
      setTaskForm(EMPTY_TASK);
      setCreateOpen(false);
      toast.success("Task created");
      await load();
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function quickComplete(task: WorkTask) {
    try {
      const updated = await tasksApi.update(task.id, {
        version: task.version,
        status: "COMPLETED",
      });
      setTasks((current) => current.map((entry) => (entry.id === task.id ? updated : entry)));
      setSelected((current) => (current?.id === task.id ? updated : current));
      toast.success("Task completed");
    } catch (cause) {
      toast.error((cause as Error).message);
      await load();
    }
  }

  async function addUpdate() {
    if (!selected || !logMessage.trim()) return;
    setSaving(true);
    try {
      const updated = await tasksApi.addLog(selected.id, {
        version: selected.version,
        message: logMessage.trim(),
        status: logStatus,
        progress: logProgress,
      });
      setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
      setSelected(updated);
      setLogMessage("");
      toast.success("Update saved");
    } catch (cause) {
      toast.error((cause as Error).message);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function createBoard() {
    if (!boardForm.name.trim()) return toast.error("Add a workspace name");
    setSaving(true);
    try {
      await tasksApi.createBoard({
        ...boardForm,
        name: boardForm.name.trim(),
        description: boardForm.description.trim() || null,
      });
      setBoardForm(DEFAULT_BOARD);
      setBoardOpen(false);
      toast.success("Workspace created");
      await load();
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading && tasks.length === 0) return <LoadingState label="Preparing your work planner…" />;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 pb-20">
      <PageHeader
        title="Work Planner"
        description="See what needs attention, update work, and keep everyone aligned."
        actions={
          canManage ? (
            <>
              <Button variant="outline" onClick={() => setBoardOpen(true)}>
                <Settings2 className="mr-2 h-4 w-4" />
                New workspace
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New task
              </Button>
            </>
          ) : undefined
        }
      />

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Due today",
            value: summary.dueToday,
            Icon: CalendarDays,
            color: "text-sky-600",
          },
          { label: "Overdue", value: summary.overdue, Icon: Clock3, color: "text-rose-600" },
          { label: "Active", value: summary.active, Icon: CircleDot, color: "text-violet-600" },
          {
            label: "Completed",
            value: summary.completed,
            Icon: CheckCircle2,
            color: "text-emerald-600",
          },
        ].map(({ label, value, Icon, color }) => (
          <Card key={label} className="border-border/70 shadow-none">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-xl bg-muted p-2.5">
                <Icon className={cn("h-5 w-5", color)} />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 shadow-none">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {user?.employeeId && (
              <Button
                size="sm"
                variant={scope === "mine" ? "default" : "ghost"}
                onClick={() => setScope("mine")}
                className="shrink-0"
              >
                My work
              </Button>
            )}
            <Button
              size="sm"
              variant={scope === "team" ? "default" : "ghost"}
              onClick={() => setScope("team")}
              className="shrink-0"
            >
              Team work
            </Button>
            {boards.map((board) => (
              <Button
                key={board.id}
                size="sm"
                variant={boardId === board.id ? "secondary" : "ghost"}
                onClick={() => setBoardId(boardId === board.id ? "ALL" : board.id)}
                className="shrink-0"
              >
                {board.name}
              </Button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_160px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search task, person, or workspace"
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active work</SelectItem>
                <SelectItem value="ALL">All statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as typeof priority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All priorities</SelectItem>
                {(["LOW", "MEDIUM", "HIGH", "URGENT"] as TaskPriority[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {value[0] + value.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-center px-4 py-14 text-center">
            <div className="mb-3 rounded-2xl bg-sky-50 p-4 dark:bg-sky-950">
              <Sparkles className="h-6 w-6 text-sky-600" />
            </div>
            <h2 className="font-semibold">You’re all caught up</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              No tasks match these filters. Clear a filter or create a new task.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.title}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold">{group.title}</h2>
                <Badge variant="secondary" className="rounded-full">
                  {group.tasks.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {group.tasks.map((task) => (
                  <Card
                    key={task.id}
                    className="group border-border/70 shadow-none transition-colors hover:border-sky-300 hover:bg-sky-50/30 dark:hover:border-sky-900 dark:hover:bg-sky-950/20"
                  >
                    <CardContent className="flex gap-3 p-3 sm:items-center sm:p-4">
                      <button
                        type="button"
                        aria-label={`Complete ${task.title}`}
                        disabled={task.status === "COMPLETED"}
                        onClick={() => void quickComplete(task)}
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors sm:mt-0",
                          task.status === "COMPLETED"
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-border bg-background hover:border-emerald-500 hover:text-emerald-600",
                        )}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          setSelected(task);
                          setLogStatus(task.status === "COMPLETED" ? "COMPLETED" : task.status);
                          setLogProgress(task.progress);
                          setDetailOpen(true);
                        }}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p
                              className={cn(
                                "truncate font-medium",
                                task.status === "COMPLETED" && "text-muted-foreground line-through",
                              )}
                            >
                              {task.title}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              {task.boardName && <span>{task.boardName}</span>}
                              <span className={cn(PRIORITY_STYLES[task.priority])}>
                                {task.priority[0] + task.priority.slice(1).toLowerCase()}
                              </span>
                              <span
                                className={cn(
                                  task.dueDate &&
                                    isBefore(dateValue(task.dueDate), today) &&
                                    task.status !== "COMPLETED" &&
                                    "text-rose-600",
                                )}
                              >
                                {dueLabel(task.dueDate)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3 sm:justify-end">
                            <Badge
                              variant="outline"
                              className={cn("font-normal", STATUS_STYLES[task.status])}
                            >
                              {task.stage?.name ?? STATUS_LABELS[task.status]}
                            </Badge>
                            <div className="flex -space-x-2">
                              {task.assignees.slice(0, 3).map((person) => (
                                <span
                                  key={person.id}
                                  title={person.name}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-sky-100 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                                >
                                  {initials(person.name)}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        {task.progress > 0 && task.status !== "COMPLETED" && (
                          <div className="mt-3 flex items-center gap-2">
                            <Progress value={task.progress} className="h-1.5" />
                            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                              {task.progress}%
                            </span>
                          </div>
                        )}
                      </button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create task</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Start with the outcome, owner, and due date. Everything else is optional.
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Task title</Label>
              <Input
                id="task-title"
                autoFocus
                value={taskForm.title}
                onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
                placeholder="What needs to be done?"
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-description">
                Details <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="task-description"
                value={taskForm.description}
                onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })}
                placeholder="Add context or a clear definition of done"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Assignees</Label>
              <div className="max-h-40 overflow-y-auto rounded-lg border p-2">
                {assignees.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">No employees are available.</p>
                ) : (
                  assignees.map((person) => {
                    const active = taskForm.assigneeEmployeeIds.includes(person.id);
                    return (
                      <button
                        type="button"
                        key={person.id}
                        onClick={() => toggleAssignee(person.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm",
                          active
                            ? "bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100"
                            : "hover:bg-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded border",
                            active && "border-sky-600 bg-sky-600 text-white",
                          )}
                        >
                          {active && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{person.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {person.designation || person.employeeCode}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={taskForm.priority}
                  onValueChange={(value) =>
                    setTaskForm({ ...taskForm, priority: value as TaskPriority })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["LOW", "MEDIUM", "HIGH", "URGENT"] as TaskPriority[]).map((value) => (
                      <SelectItem key={value} value={value}>
                        {value[0] + value.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Workspace</Label>
                <Select
                  value={taskForm.boardId || "NONE"}
                  onValueChange={(value) =>
                    setTaskForm({
                      ...taskForm,
                      boardId: value === "NONE" ? "" : value,
                      stageId: "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No workspace</SelectItem>
                    {boards.map((board) => (
                      <SelectItem key={board.id} value={board.id}>
                        {board.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedBoard && (
              <div className="space-y-2">
                <Label>Starting stage</Label>
                <Select
                  value={taskForm.stageId || selectedBoard.stages[0]?.id}
                  onValueChange={(value) => setTaskForm({ ...taskForm, stageId: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedBoard.stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <span className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", STAGE_COLORS[stage.color])} />
                          {stage.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task-start">Start date</Label>
                <Input
                  id="task-start"
                  type="date"
                  value={taskForm.startDate}
                  onChange={(event) => setTaskForm({ ...taskForm, startDate: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-due">Due date</Label>
                <Input
                  id="task-due"
                  type="date"
                  min={taskForm.startDate || undefined}
                  value={taskForm.dueDate}
                  onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void createTask()}>
              {saving ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="h-[calc(100dvh-1rem)] max-h-none content-start overflow-y-auto sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl">
          {selected && (
            <>
              <DialogHeader>
                <div className="pr-10">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge variant="outline" className={STATUS_STYLES[selected.status]}>
                      {selected.stage?.name ?? STATUS_LABELS[selected.status]}
                    </Badge>
                    <Badge variant="outline" className={PRIORITY_STYLES[selected.priority]}>
                      {selected.priority.toLowerCase()} priority
                    </Badge>
                  </div>
                  <DialogTitle className="leading-snug">{selected.title}</DialogTitle>
                </div>
              </DialogHeader>
              <div className="grid gap-5 md:grid-cols-[1fr_250px]">
                <div className="space-y-5">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Overview</h3>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {selected.description || "No additional details were added."}
                    </p>
                  </div>
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <MessageSquareText className="h-4 w-4" />
                      <h3 className="text-sm font-semibold">Activity</h3>
                    </div>
                    <div className="space-y-3">
                      {selected.updates.map((entry) => (
                        <div key={entry.id} className="rounded-lg border border-border/70 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <p className="text-sm font-medium">{entry.authorName}</p>
                            <time className="text-xs text-muted-foreground">
                              {format(new Date(entry.createdAt), "d MMM, h:mm a")}
                            </time>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                            {entry.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <aside className="space-y-4 rounded-xl bg-muted/40 p-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Assignees
                    </p>
                    <div className="mt-2 space-y-2">
                      {selected.assignees.map((person) => (
                        <div key={person.id} className="flex items-center gap-2 text-sm">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                            {initials(person.name)}
                          </span>
                          <span className="truncate">{person.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Due
                    </p>
                    <p className="mt-1 text-sm">{dueLabel(selected.dueDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Progress
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={selected.progress} className="h-2" />
                      <span className="text-xs tabular-nums">{selected.progress}%</span>
                    </div>
                  </div>
                </aside>
              </div>
              <div className="space-y-3 border-t pt-4">
                <h3 className="text-sm font-semibold">Post an update</h3>
                <Textarea
                  value={logMessage}
                  onChange={(event) => setLogMessage(event.target.value)}
                  placeholder="Share progress, a decision, or a blocker"
                  rows={3}
                />
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Select
                    value={logStatus}
                    onValueChange={(value) => setLogStatus(value as TaskStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Progress percent"
                      type="number"
                      min={0}
                      max={100}
                      value={logProgress}
                      onChange={(event) =>
                        setLogProgress(Math.max(0, Math.min(100, Number(event.target.value))))
                      }
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <Button disabled={saving || !logMessage.trim()} onClick={() => void addUpdate()}>
                    {saving ? "Saving…" : "Post update"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={boardOpen} onOpenChange={setBoardOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <p className="text-sm text-muted-foreground">
              A workspace gives a team a shared workflow without adding visual clutter.
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input
                id="workspace-name"
                value={boardForm.name}
                onChange={(event) => setBoardForm({ ...boardForm, name: event.target.value })}
                placeholder="e.g. Operations"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-description">Description</Label>
              <Textarea
                id="workspace-description"
                value={boardForm.description}
                onChange={(event) =>
                  setBoardForm({ ...boardForm, description: event.target.value })
                }
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Access</Label>
              <Select
                value={boardForm.accessType}
                onValueChange={(value) =>
                  setBoardForm({
                    ...boardForm,
                    accessType: value as TaskBoard["accessType"],
                    allowedRoles: [],
                    memberEmployeeIds: [],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Everyone with Tasks access</SelectItem>
                  <SelectItem value="ROLE_GATED">Selected roles</SelectItem>
                  <SelectItem value="MEMBER_GATED">Selected people</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {boardForm.accessType === "ROLE_GATED" && (
              <div className="flex flex-wrap gap-2">
                {BOARD_ROLES.map((role) => {
                  const active = boardForm.allowedRoles.includes(role);
                  return (
                    <Button
                      key={role}
                      type="button"
                      size="sm"
                      variant={active ? "secondary" : "outline"}
                      onClick={() =>
                        setBoardForm({
                          ...boardForm,
                          allowedRoles: active
                            ? boardForm.allowedRoles.filter((value) => value !== role)
                            : [...boardForm.allowedRoles, role],
                        })
                      }
                    >
                      {role.replaceAll("_", " ").toLowerCase()}
                    </Button>
                  );
                })}
              </div>
            )}
            {boardForm.accessType === "MEMBER_GATED" && (
              <div className="max-h-40 overflow-y-auto rounded-lg border p-2">
                {assignees.map((person) => {
                  const active = boardForm.memberEmployeeIds.includes(person.id);
                  return (
                    <button
                      type="button"
                      key={person.id}
                      onClick={() =>
                        setBoardForm({
                          ...boardForm,
                          memberEmployeeIds: active
                            ? boardForm.memberEmployeeIds.filter((id) => id !== person.id)
                            : [...boardForm.memberEmployeeIds, person.id],
                        })
                      }
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md p-2 text-left text-sm",
                        active ? "bg-sky-50 dark:bg-sky-950" : "hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded border",
                          active && "border-sky-600 bg-sky-600 text-white",
                        )}
                      >
                        {active && <Check className="h-3.5 w-3.5" />}
                      </span>
                      {person.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="space-y-2">
              <Label>Workflow</Label>
              {boardForm.stages.map((stage, index) => (
                <div key={index} className="grid grid-cols-[1fr_140px] gap-2">
                  <Input
                    value={stage.name}
                    onChange={(event) =>
                      setBoardForm((current) => ({
                        ...current,
                        stages: current.stages.map((entry, position) =>
                          position === index ? { ...entry, name: event.target.value } : entry,
                        ),
                      }))
                    }
                  />
                  <Select
                    value={stage.status}
                    onValueChange={(value) =>
                      setBoardForm((current) => ({
                        ...current,
                        stages: current.stages.map((entry, position) =>
                          position === index ? { ...entry, status: value as TaskStatus } : entry,
                        ),
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS)
                        .filter(([value]) => value !== "CANCELLED")
                        .map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoardOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void createBoard()}>
              {saving ? "Creating…" : "Create workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
