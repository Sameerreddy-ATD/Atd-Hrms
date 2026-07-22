import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, isBefore, startOfToday } from "date-fns";
import { toast } from "sonner";
import {
  CalendarDays,
  ArrowLeft,
  Archive,
  ChevronRight,
  CheckCircle2,
  Clock3,
  ListTodo,
  LayoutGrid,
  List,
  Layers3,
  MessageSquareText,
  Network,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import type { TaskAssignee, TaskBoard, TaskPriority, TaskStatus, WorkTask } from "@/mock/types";
import { tasksApi } from "@/services/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/tasks")({ component: TasksPage });

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  REVIEW: "In review",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  LOW: "border-border bg-muted text-muted-foreground",
  MEDIUM:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-400",
  HIGH: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400",
  URGENT:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400",
};

const EMPTY_FORM = {
  title: "",
  description: "",
  assigneeEmployeeIds: [] as string[],
  priority: "MEDIUM" as TaskPriority,
  startDate: "",
  dueDate: "",
  boardId: "",
  stageId: "",
};

const STAGE_COLORS: Record<TaskBoard["stages"][number]["color"], string> = {
  SLATE: "bg-slate-500",
  BLUE: "bg-blue-500",
  AMBER: "bg-amber-500",
  VIOLET: "bg-violet-500",
  EMERALD: "bg-emerald-500",
  RED: "bg-red-500",
};

type BoardForm = {
  name: string;
  description: string;
  accessType: TaskBoard["accessType"];
  allowedRoles: string[];
  memberEmployeeIds: string[];
  stages: Array<{
    name: string;
    color: TaskBoard["stages"][number]["color"];
    isCompleted: boolean;
  }>;
};

const DEFAULT_BOARD_FORM: BoardForm = {
  name: "",
  description: "",
  accessType: "OPEN" as TaskBoard["accessType"],
  allowedRoles: [] as string[],
  memberEmployeeIds: [] as string[],
  stages: [
    { name: "To do", color: "SLATE" as const, isCompleted: false },
    { name: "In progress", color: "AMBER" as const, isCompleted: false },
    { name: "In review", color: "BLUE" as const, isCompleted: false },
    { name: "Done", color: "EMERALD" as const, isCompleted: true },
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

const PAGE_SIZE = 100;

function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [archivedBoards, setArchivedBoards] = useState<TaskBoard[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardForm, setBoardForm] = useState<BoardForm>(DEFAULT_BOARD_FORM);
  const [scope, setScope] = useState<"mine" | "team">(user?.employeeId ? "mine" : "team");
  const [status, setStatus] = useState("active");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<WorkTask | null>(null);
  const [logMessage, setLogMessage] = useState("");
  const [logMinutes, setLogMinutes] = useState("");
  const [logProgress, setLogProgress] = useState(0);
  const [logStatus, setLogStatus] = useState<TaskStatus>("IN_PROGRESS");

  const load = useCallback(
    async (nextScope: "mine" | "team" = scope) => {
      setLoading(true);
      setError("");
      try {
        const [taskRows, employeeRows, boardRows, archivedRows] = await Promise.all([
          tasksApi.list(nextScope, {
            limit: PAGE_SIZE,
            offset: 0,
            boardId: activeBoardId ?? undefined,
          }),
          tasksApi.assignees().catch(() => []),
          tasksApi.boards(),
          tasksApi.boards(true),
        ]);
        setTasks(taskRows);
        setHasMore(taskRows.length === PAGE_SIZE);
        setAssignees(employeeRows);
        setBoards(boardRows);
        setArchivedBoards(archivedRows);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [scope, activeBoardId],
  );

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await tasksApi.list(scope, {
        limit: PAGE_SIZE,
        offset: tasks.length,
        boardId: activeBoardId ?? undefined,
      });
      setTasks((current) => [...current, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load(scope);
  }, [load, scope]);

  const visibleTasks = useMemo(() => {
    const search = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesStatus =
        status === "all" ||
        (status === "active"
          ? !["COMPLETED", "CANCELLED"].includes(task.status)
          : task.status === status);
      const assigneeText = task.assignees
        .map((assignee) => `${assignee.name} ${assignee.department ?? ""}`)
        .join(" ");
      const text = `${task.title} ${task.description ?? ""} ${assigneeText}`.toLowerCase();
      return matchesStatus && (!search || text.includes(search));
    });
  }, [query, status, tasks]);

  const counts = useMemo(
    () => ({
      active: tasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status)).length,
      overdue: tasks.filter(
        (task) =>
          task.dueDate &&
          !["COMPLETED", "CANCELLED"].includes(task.status) &&
          isBefore(new Date(`${task.dueDate}T00:00:00`), startOfToday()),
      ).length,
      review: tasks.filter((task) => task.status === "REVIEW").length,
      completed: tasks.filter((task) => task.status === "COMPLETED").length,
    }),
    [tasks],
  );

  const teamProgress = useMemo(() => {
    const people = new Map<
      string,
      TaskAssignee & {
        taskCount: number;
        completed: number;
        progressTotal: number;
        updates: number;
      }
    >();
    for (const task of tasks) {
      for (const assignee of task.assignees) {
        const current = people.get(assignee.id) ?? {
          ...assignee,
          taskCount: 0,
          completed: 0,
          progressTotal: 0,
          updates: 0,
        };
        current.taskCount += 1;
        current.completed += task.status === "COMPLETED" ? 1 : 0;
        current.progressTotal += task.progress;
        current.updates += task.updates.filter(
          (entry) => entry.authorName === assignee.name,
        ).length;
        people.set(assignee.id, current);
      }
    }
    return [...people.values()]
      .map((person) => ({
        ...person,
        averageProgress: Math.round(person.progressTotal / person.taskCount),
      }))
      .sort((a, b) => b.averageProgress - a.averageProgress || a.name.localeCompare(b.name));
  }, [tasks]);

  function openTask(task: WorkTask) {
    setSelected(task);
    setLogMessage("");
    setLogMinutes("");
    setLogProgress(task.progress);
    setLogStatus(task.status === "TODO" ? "IN_PROGRESS" : task.status);
  }

  async function createTask(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || form.assigneeEmployeeIds.length === 0)
      return toast.error("Task title and at least one assignee are required");
    if (form.startDate && form.dueDate && form.dueDate < form.startDate)
      return toast.error("Due date cannot be before the start date");
    setSaving(true);
    try {
      await tasksApi.create({
        ...form,
        description: form.description || null,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        boardId: form.boardId || null,
        stageId: form.stageId || null,
      });
      setForm(EMPTY_FORM);
      setCreateOpen(false);
      setScope("team");
      await load("team");
      toast.success("Task assigned successfully");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function createBoard(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const board = await tasksApi.createBoard(boardForm);
      setBoards((rows) => [board, ...rows]);
      setBoardForm(DEFAULT_BOARD_FORM);
      setBoardOpen(false);
      setActiveBoardId(board.id);
      toast.success("Board created successfully");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function moveTaskToStage(task: WorkTask, stageId: string) {
    try {
      const updated = await tasksApi.update(task.id, { stageId });
      setTasks((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      if (selected?.id === updated.id) setSelected(updated);
      toast.success("Task stage updated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function addLog(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || logMessage.trim().length < 2) return toast.error("Add a short work update");
    setSaving(true);
    try {
      const updated = await tasksApi.addLog(selected.id, {
        message: logMessage,
        progress: logProgress,
        status: logStatus,
        minutesWorked: logMinutes ? Number(logMinutes) : undefined,
      });
      setTasks((rows) => rows.map((task) => (task.id === updated.id ? updated : task)));
      setSelected(updated);
      setLogMessage("");
      setLogMinutes("");
      toast.success("Daily log added");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const canAssign = assignees.length > 0;
  const activeBoard = boards.find((board) => board.id === activeBoardId) ?? null;
  const filteredAssignees = assignees.filter((employee) =>
    `${employee.name} ${employee.employeeCode} ${employee.department ?? ""}`
      .toLowerCase()
      .includes(assigneeQuery.trim().toLowerCase()),
  );

  function toggleAssignee(employeeId: string, selected: boolean) {
    setForm((current) => ({
      ...current,
      assigneeEmployeeIds: selected
        ? [...new Set([...current.assigneeEmployeeIds, employeeId])]
        : current.assigneeEmployeeIds.filter((id) => id !== employeeId),
    }));
  }
  const summaryCards: Array<{
    label: string;
    value: number;
    icon: typeof ListTodo;
    color: string;
  }> = [
    {
      label: "Active",
      value: counts.active,
      icon: ListTodo,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Overdue",
      value: counts.overdue,
      icon: Clock3,
      color: "text-red-600 dark:text-red-400",
    },
    {
      label: "In review",
      value: counts.review,
      icon: MessageSquareText,
      color: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Completed",
      value: counts.completed,
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={activeBoard ? activeBoard.name : "Task Boards"}
        description={
          activeBoard
            ? activeBoard.description ||
              `${activeBoard.taskCount} tasks across ${activeBoard.stages.length} stages.`
            : "Organize assignments into focused team boards and track your work in one place."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {activeBoard && (
              <Button variant="outline" onClick={() => setActiveBoardId(null)}>
                <ArrowLeft className="h-4 w-4" />
                Boards
              </Button>
            )}
            {!activeBoard && canAssign && (
              <Button variant="outline" onClick={() => setBoardOpen(true)}>
                <Plus className="h-4 w-4" />
                New board
              </Button>
            )}
            {activeBoard &&
              (user?.role === "developer_admin" || activeBoard.createdByUserId === user?.id) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    void tasksApi
                      .archiveBoard(activeBoard.id, true)
                      .then(() => {
                        setBoards((rows) => rows.filter((board) => board.id !== activeBoard.id));
                        setArchivedBoards((rows) => [activeBoard, ...rows]);
                        setActiveBoardId(null);
                        toast.success("Board archived");
                      })
                      .catch((err) => toast.error((err as Error).message));
                  }}
                >
                  <Archive className="h-4 w-4" />
                  Archive
                </Button>
              )}
            {canAssign && (
              <Button
                onClick={() => {
                  const stage = activeBoard?.stages[0];
                  setForm({
                    ...EMPTY_FORM,
                    boardId: activeBoard?.id ?? "",
                    stageId: stage?.id ?? "",
                  });
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Assign task
              </Button>
            )}
          </div>
        }
      />

      {!activeBoard ? (
        <div className="space-y-7">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <UserRound className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">Assigned to me</h2>
              <Badge variant="secondary">
                {tasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status)).length}
              </Badge>
            </div>
            <div className="space-y-2">
              {tasks
                .filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status))
                .slice(0, 5)
                .map((task) => (
                  <button
                    key={task.id}
                    onClick={() => openTask(task)}
                    className="flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition hover:border-primary/40 hover:shadow-sm"
                  >
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", PRIORITY_STYLES[task.priority])}
                    >
                      {task.priority}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {task.boardName ?? "Uncategorized"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              {tasks.length === 0 && (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No tasks are currently assigned to you.
                </p>
              )}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">Boards</h2>
              <Badge variant="secondary">{boards.length}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {boards.map((board) => (
                <button
                  key={board.id}
                  onClick={() => {
                    setScope("team");
                    setActiveBoardId(board.id);
                  }}
                  className="group rounded-xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Layers3 className="h-5 w-5" />
                    </span>
                    <Badge variant="outline">
                      {board.accessType === "OPEN"
                        ? "Open"
                        : board.accessType === "ROLE_GATED"
                          ? "Role access"
                          : "Member access"}
                    </Badge>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{board.name}</h3>
                  <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                    {board.description || "Team task board"}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                    <span>{board.openTaskCount} open</span>
                    <span>{board.stages.length} stages</span>
                    <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </div>
                </button>
              ))}
              {boards.length === 0 && (
                <div className="rounded-xl border border-dashed p-8 text-center sm:col-span-2 xl:col-span-3">
                  <LayoutGrid className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 font-medium">No boards available</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create a board to organize tasks by workflow stage.
                  </p>
                </div>
              )}
            </div>
          </section>

          {archivedBoards.length > 0 && (
            <details className="rounded-lg border bg-card">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
                <Archive className="h-4 w-4" />
                Archived boards<Badge variant="secondary">{archivedBoards.length}</Badge>
              </summary>
              <div className="border-t p-3 text-sm text-muted-foreground">
                {archivedBoards.map((board) => (
                  <div
                    key={board.id}
                    className="flex items-center justify-between gap-3 px-2 py-1.5"
                  >
                    <span>{board.name}</span>
                    {(user?.role === "developer_admin" || board.createdByUserId === user?.id) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void tasksApi
                            .archiveBoard(board.id, false)
                            .then((restored) => {
                              setArchivedBoards((rows) =>
                                rows.filter((item) => item.id !== board.id),
                              );
                              setBoards((rows) => [restored, ...rows]);
                              toast.success("Board restored");
                            })
                            .catch((err) => toast.error((err as Error).message));
                        }}
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {summaryCards.map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="rounded-lg">
                <CardContent className="flex items-center justify-between p-3 sm:p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold">{value}</p>
                  </div>
                  <Icon className={cn("h-5 w-5", color)} />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <Tabs value={scope} onValueChange={(value) => setScope(value as "mine" | "team")}>
              <TabsList className="grid w-full grid-cols-2 sm:w-[260px]">
                <TabsTrigger value="mine">My tasks</TabsTrigger>
                <TabsTrigger value="team">Team tasks</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex min-w-0 flex-col gap-2 min-[420px]:flex-row">
              <div className="hidden rounded-md border p-1 sm:flex">
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === "list" ? "default" : "ghost"}
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                  List
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === "board" ? "default" : "ghost"}
                  onClick={() => setViewMode("board")}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Board
                </Button>
              </div>
              <div className="relative min-w-0 flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search tasks"
                  className="pl-9"
                />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full min-[420px]:w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {scope === "team" && !loading && !error && teamProgress.length > 0 && (
            <section
              className="overflow-hidden rounded-lg border bg-card"
              aria-label="Team progress"
            >
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <Network className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Team progress</h2>
                  <p className="text-xs text-muted-foreground">
                    Progress for employees visible in your organization hierarchy.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto p-3 sm:p-4">
                <div className="flex min-w-max items-stretch gap-3">
                  {teamProgress.map((person) => (
                    <article
                      key={person.id}
                      className="relative w-[240px] shrink-0 rounded-md border bg-background p-3 after:absolute after:-right-3 after:top-1/2 after:h-px after:w-3 after:bg-border last:after:hidden"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{person.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {person.designation ?? person.department ?? person.employeeCode}
                          </p>
                        </div>
                        <strong className="text-sm tabular-nums text-primary">
                          {person.averageProgress}%
                        </strong>
                      </div>
                      <Progress className="mt-3 h-2" value={person.averageProgress} />
                      <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                        <span>{person.taskCount} tasks</span>
                        <span>{person.completed} completed</span>
                        <span>{person.updates} logs</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          )}

          {loading && <LoadingState label="Loading tasks" />}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}
          {!loading && !error && visibleTasks.length === 0 && (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <ListTodo className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No tasks found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Assigned work and daily progress will appear here.
              </p>
            </div>
          )}

          <div
            className={cn(
              "grid gap-3 lg:grid-cols-2 2xl:grid-cols-3",
              viewMode === "board" && "sm:hidden",
            )}
          >
            {visibleTasks.map((task) => {
              const overdue =
                task.dueDate &&
                !["COMPLETED", "CANCELLED"].includes(task.status) &&
                isBefore(new Date(`${task.dueDate}T00:00:00`), startOfToday());
              return (
                <button
                  key={task.id}
                  onClick={() => openTask(task)}
                  className="rounded-lg border bg-card p-4 text-left shadow-sm transition [content-visibility:auto] [contain-intrinsic-size:210px] hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-blue-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-foreground">{task.title}</h3>
                      <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                        {task.description || "No description added."}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 text-[10px]", PRIORITY_STYLES[task.priority])}
                    >
                      {task.priority}
                    </Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <UserRound className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {task.assignees.length === 1
                          ? task.assignees[0]?.name
                          : `${task.assignees[0]?.name} +${task.assignees.length - 1}`}
                      </span>
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      {STATUS_LABELS[task.status]}
                    </Badge>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span>Progress</span>
                      <span className="font-medium">{task.progress}%</span>
                    </div>
                    <Progress value={task.progress} className="h-2" />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        overdue && "font-medium text-red-600 dark:text-red-400",
                      )}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      {task.dueDate
                        ? `${overdue ? "Overdue" : "Due"} ${format(new Date(`${task.dueDate}T00:00:00`), "dd MMM")}`
                        : "No due date"}
                    </span>
                    <span>{task.updateCount} logs</span>
                  </div>
                </button>
              );
            })}
          </div>

          {viewMode === "board" && activeBoard && (
            <div className="hidden overflow-x-auto pb-3 sm:block">
              <div className="flex min-w-max items-start gap-3">
                {activeBoard.stages.map((stage) => {
                  const stageTasks = visibleTasks.filter((task) => task.stageId === stage.id);
                  return (
                    <section
                      key={stage.id}
                      className="w-[290px] shrink-0 rounded-xl bg-muted/45 p-3"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        const task = visibleTasks.find(
                          (item) => item.id === event.dataTransfer.getData("text/task-id"),
                        );
                        if (task && task.stageId !== stage.id) void moveTaskToStage(task, stage.id);
                      }}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn("h-2.5 w-2.5 rounded-full", STAGE_COLORS[stage.color])}
                          />
                          <h3 className="text-sm font-semibold uppercase tracking-wide">
                            {stage.name}
                          </h3>
                        </div>
                        <Badge variant="secondary">{stageTasks.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {stageTasks.map((task) => (
                          <button
                            key={task.id}
                            draggable
                            onDragStart={(event) =>
                              event.dataTransfer.setData("text/task-id", task.id)
                            }
                            onClick={() => openTask(task)}
                            className="w-full cursor-grab rounded-lg border bg-card p-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md active:cursor-grabbing"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="line-clamp-2 text-sm font-semibold">{task.title}</p>
                              <Badge
                                variant="outline"
                                className={cn("text-[9px]", PRIORITY_STYLES[task.priority])}
                              >
                                {task.priority}
                              </Badge>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                              <span className="truncate">
                                {task.assignees[0]?.name}
                                {task.assignees.length > 1 ? ` +${task.assignees.length - 1}` : ""}
                              </span>
                              <span>{task.progress}%</span>
                            </div>
                            {task.dueDate && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Due {format(new Date(`${task.dueDate}T00:00:00`), "dd MMM")}
                              </p>
                            )}
                          </button>
                        ))}
                        {stageTasks.length === 0 && (
                          <div className="rounded-lg border border-dashed bg-background/60 p-4 text-center text-xs text-muted-foreground">
                            No tasks
                          </div>
                        )}
                        {canAssign && (
                          <Button
                            variant="ghost"
                            className="w-full justify-start text-muted-foreground"
                            onClick={() => {
                              setForm({
                                ...EMPTY_FORM,
                                boardId: activeBoard.id,
                                stageId: stage.id,
                              });
                              setCreateOpen(true);
                            }}
                          >
                            <Plus className="h-4 w-4" />
                            Add task
                          </Button>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}

          {hasMore && !query && status === "active" && (
            <div className="text-center">
              <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? "Loading tasks..." : "Load more tasks"}
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={boardOpen} onOpenChange={setBoardOpen}>
        <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New task board</DialogTitle>
          </DialogHeader>
          <form onSubmit={createBoard} className="space-y-5">
            <div>
              <Label>Board name</Label>
              <Input
                className="mt-1.5"
                value={boardForm.name}
                onChange={(event) =>
                  setBoardForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="e.g. Engineering sprint"
                required
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                className="mt-1.5"
                value={boardForm.description}
                onChange={(event) =>
                  setBoardForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Purpose and expected outcomes"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Workflow stages</Label>
                <span className="text-xs text-muted-foreground">
                  {boardForm.stages.length} stages
                </span>
              </div>
              <div className="space-y-2">
                {boardForm.stages.map((stage, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border bg-muted/25 p-2.5"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-xs font-semibold">
                      {index + 1}
                    </span>
                    <Input
                      value={stage.name}
                      onChange={(event) =>
                        setBoardForm((current) => ({
                          ...current,
                          stages: current.stages.map((item, stageIndex) =>
                            stageIndex === index ? { ...item, name: event.target.value } : item,
                          ),
                        }))
                      }
                      required
                    />
                    <label className="flex items-center gap-2 whitespace-nowrap text-xs">
                      <Checkbox
                        checked={stage.isCompleted}
                        onCheckedChange={(checked) =>
                          setBoardForm((current) => ({
                            ...current,
                            stages: current.stages.map((item, stageIndex) => ({
                              ...item,
                              isCompleted:
                                stageIndex === index
                                  ? checked === true
                                  : checked === true
                                    ? false
                                    : item.isCompleted,
                            })),
                          }))
                        }
                      />
                      Done
                    </label>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed"
                  disabled={boardForm.stages.length >= 12}
                  onClick={() =>
                    setBoardForm((current) => ({
                      ...current,
                      stages: [
                        ...current.stages,
                        { name: "New stage", color: "VIOLET", isCompleted: false },
                      ],
                    }))
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add custom stage
                </Button>
              </div>
            </div>
            <div>
              <Label>Board access</Label>
              <Select
                value={boardForm.accessType}
                onValueChange={(accessType: TaskBoard["accessType"]) =>
                  setBoardForm((current) => ({ ...current, accessType }))
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open — everyone with Tasks access</SelectItem>
                  <SelectItem value="ROLE_GATED">Role-gated</SelectItem>
                  <SelectItem value="MEMBER_GATED">Member-gated</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Module access is checked first, followed by this board-specific rule.
              </p>
            </div>
            {boardForm.accessType === "ROLE_GATED" && (
              <div className="grid gap-2 sm:grid-cols-2">
                {BOARD_ROLES.map((role) => (
                  <label
                    key={role}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <Checkbox
                      checked={boardForm.allowedRoles.includes(role)}
                      onCheckedChange={(checked) =>
                        setBoardForm((current) => ({
                          ...current,
                          allowedRoles:
                            checked === true
                              ? [...current.allowedRoles, role]
                              : current.allowedRoles.filter((item) => item !== role),
                        }))
                      }
                    />
                    {role
                      .replaceAll("_", " ")
                      .toLowerCase()
                      .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                  </label>
                ))}
              </div>
            )}
            {boardForm.accessType === "MEMBER_GATED" && (
              <div>
                <Label>Select members</Label>
                <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                  {assignees.map((employee) => (
                    <label
                      key={employee.id}
                      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                    >
                      <Checkbox
                        checked={boardForm.memberEmployeeIds.includes(employee.id)}
                        onCheckedChange={(checked) =>
                          setBoardForm((current) => ({
                            ...current,
                            memberEmployeeIds:
                              checked === true
                                ? [...current.memberEmployeeIds, employee.id]
                                : current.memberEmployeeIds.filter((id) => id !== employee.id),
                          }))
                        }
                      />
                      <span>
                        <span className="block text-sm font-medium">{employee.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {employee.department ?? employee.employeeCode}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBoardOpen(false)}>
                Cancel
              </Button>
              <Button disabled={saving}>{saving ? "Creating..." : "Create board"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign a task</DialogTitle>
          </DialogHeader>
          <form onSubmit={createTask} className="space-y-4">
            <div>
              <Label>Task title</Label>
              <Input
                className="mt-1.5"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="What needs to be done?"
                autoFocus
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                className="mt-1.5 min-h-24"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Expected result, context, or instructions"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Board</Label>
                <Select
                  value={form.boardId || "none"}
                  onValueChange={(boardId) => {
                    const board = boards.find((item) => item.id === boardId);
                    setForm({
                      ...form,
                      boardId: boardId === "none" ? "" : boardId,
                      stageId: board?.stages[0]?.id ?? "",
                    });
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Uncategorized</SelectItem>
                    {boards.map((board) => (
                      <SelectItem key={board.id} value={board.id}>
                        {board.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stage</Label>
                <Select
                  value={form.stageId || "none"}
                  disabled={!form.boardId}
                  onValueChange={(stageId) =>
                    setForm({ ...form, stageId: stageId === "none" ? "" : stageId })
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select stage</SelectItem>
                    {boards
                      .find((board) => board.id === form.boardId)
                      ?.stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Assign to</Label>
                  <span className="text-xs text-muted-foreground">
                    {form.assigneeEmployeeIds.length} selected
                  </span>
                </div>
                <div className="mt-1.5 rounded-md border bg-background p-2">
                  <Input
                    value={assigneeQuery}
                    onChange={(event) => setAssigneeQuery(event.target.value)}
                    placeholder="Search employees"
                    className="mb-2 h-9"
                  />
                  <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                    {filteredAssignees.map((employee) => {
                      const checked = form.assigneeEmployeeIds.includes(employee.id);
                      return (
                        <label
                          key={employee.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleAssignee(employee.id, value === true)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {employee.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {employee.department ?? employee.employeeCode}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div>
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(value) => setForm({ ...form, priority: value as TaskPriority })}
                >
                  <SelectTrigger className="mt-1.5">
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
              <div>
                <Label>Start date</Label>
                <Input
                  type="date"
                  className="mt-1.5"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Due date</Label>
                <Input
                  type="date"
                  className="mt-1.5"
                  value={form.dueDate}
                  min={form.startDate || undefined}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button disabled={saving}>{saving ? "Assigning..." : "Assign task"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && (
          <DialogContent className="h-[100dvh] w-screen max-w-none overflow-y-auto rounded-none p-4 sm:h-auto sm:max-h-[94vh] sm:w-full sm:max-w-3xl sm:rounded-lg sm:p-6">
            <DialogHeader>
              <DialogTitle className="pr-6">{selected.title}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={PRIORITY_STYLES[selected.priority]}>
                {selected.priority}
              </Badge>
              <Badge variant="secondary">{STATUS_LABELS[selected.status]}</Badge>
              <Badge variant="outline">
                {selected.assignees.length}{" "}
                {selected.assignees.length === 1 ? "assignee" : "assignees"}
              </Badge>
              {selected.dueDate && (
                <Badge variant="outline">
                  Due {format(new Date(`${selected.dueDate}T00:00:00`), "dd MMM yyyy")}
                </Badge>
              )}
            </div>
            {selected.description && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {selected.description}
              </p>
            )}
            {selected.boardId && (
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Board</p>
                  <p className="mt-1 text-sm font-medium">{selected.boardName}</p>
                </div>
                <div>
                  <Label>Workflow stage</Label>
                  <Select
                    value={selected.stageId}
                    onValueChange={(stageId) => void moveTaskToStage(selected, stageId)}
                  >
                    <SelectTrigger className="mt-1.5 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {boards
                        .find((board) => board.id === selected.boardId)
                        ?.stages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            {stage.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Assigned members
              </p>
              <div className="flex flex-wrap gap-2">
                {selected.assignees.map((assignee) => (
                  <Badge key={assignee.id} variant="secondary" className="py-1.5">
                    {assignee.name}
                    {assignee.department ? ` · ${assignee.department}` : ""}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span>Progress</span>
                <strong>{selected.progress}%</strong>
              </div>
              <Progress value={selected.progress} />
            </div>
            <form onSubmit={addLog} className="space-y-3 rounded-lg border bg-muted/30 p-3 sm:p-4">
              <div>
                <Label>Daily work update</Label>
                <Textarea
                  className="mt-1.5 min-h-20 bg-background"
                  value={logMessage}
                  onChange={(e) => setLogMessage(e.target.value)}
                  placeholder="What did you complete today? Mention blockers or next steps."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Status</Label>
                  <Select
                    value={logStatus}
                    onValueChange={(value) => {
                      const next = value as TaskStatus;
                      setLogStatus(next);
                      if (next === "COMPLETED") setLogProgress(100);
                    }}
                  >
                    <SelectTrigger className="mt-1.5 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS)
                        .filter(([key]) => key !== "CANCELLED")
                        .map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Progress %</Label>
                  <Input
                    className="mt-1.5 bg-background"
                    type="number"
                    min="0"
                    max="100"
                    value={logProgress}
                    onChange={(e) => setLogProgress(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Minutes worked</Label>
                  <Input
                    className="mt-1.5 bg-background"
                    type="number"
                    min="0"
                    max="1440"
                    value={logMinutes}
                    onChange={(e) => setLogMinutes(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button className="w-full sm:w-auto" disabled={saving}>
                  {saving ? "Saving..." : "Add daily log"}
                </Button>
              </div>
            </form>
            <div>
              <h3 className="mb-3 font-semibold">Activity</h3>
              <div className="space-y-3">
                {selected.updates.length === 0 && (
                  <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                    No daily logs yet.
                  </p>
                )}
                {selected.updates.map((entry) => (
                  <div
                    key={entry.id}
                    className="border-l-2 border-blue-200 dark:border-blue-800 pl-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <p className="text-sm font-medium">{entry.authorName}</p>
                      <time className="text-xs text-muted-foreground">
                        {format(new Date(entry.createdAt), "dd MMM, hh:mm a")}
                      </time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {entry.message}
                    </p>
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                      {entry.status && <span>{STATUS_LABELS[entry.status]}</span>}
                      {entry.progress !== undefined && <span>{entry.progress}%</span>}
                      {entry.minutesWorked !== undefined && <span>{entry.minutesWorked} min</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
