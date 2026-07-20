import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, isBefore, startOfToday } from "date-fns";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  ListTodo,
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
import type { TaskAssignee, TaskPriority, TaskStatus, WorkTask } from "@/mock/types";
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
};

const PAGE_SIZE = 100;

function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
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
        const [taskRows, employeeRows] = await Promise.all([
          tasksApi.list(nextScope, { limit: PAGE_SIZE, offset: 0 }),
          tasksApi.assignees().catch(() => []),
        ]);
        setTasks(taskRows);
        setHasMore(taskRows.length === PAGE_SIZE);
        setAssignees(employeeRows);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [scope],
  );

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await tasksApi.list(scope, { limit: PAGE_SIZE, offset: tasks.length });
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
        title="Tasks & Daily Logs"
        description="Plan work, update progress, and keep daily activity in one place."
        actions={
          canAssign ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Assign task
            </Button>
          ) : undefined
        }
      />

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
        <section className="overflow-hidden rounded-lg border bg-card" aria-label="Team progress">
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

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
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

      {hasMore && !query && status === "active" && (
        <div className="text-center">
          <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Loading tasks..." : "Load more tasks"}
          </Button>
        </div>
      )}

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
          <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
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
