import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isBefore,
  isSameDay,
  startOfMonth,
  startOfToday,
  subMonths,
} from "date-fns";
import {
  ArrowLeft,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Columns3,
  LayoutList,
  ListFilter,
  Plus,
  Search,
  Settings2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TaskAssignee, TaskBoard, TaskPriority, TaskStage, WorkTask } from "@/types/domain";
import {
  dateValue,
  dueLabel,
  initials,
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  STAGE_COLORS,
} from "./task-utils";

type BoardView = "list" | "kanban" | "timeline";
type DueFilter = "ALL" | "TODAY" | "OVERDUE" | "NONE";
const VIEW_OPTIONS: Array<{ value: BoardView; label: string; Icon: LucideIcon }> = [
  { value: "list", label: "List", Icon: LayoutList },
  { value: "kanban", label: "Kanban", Icon: Columns3 },
  { value: "timeline", label: "Timeline", Icon: CalendarRange },
];

type BoardWorkspaceProps = {
  board: TaskBoard;
  boards: TaskBoard[];
  tasks: WorkTask[];
  assignees: TaskAssignee[];
  employeeId?: string;
  canChangeBoard: boolean;
  onBack: () => void;
  onSwitchBoard: (boardId: string) => void;
  onNewTask: (stageId?: string) => void;
  onEditBoard: () => void;
  onOpenTask: (task: WorkTask) => void;
  onMoveTask: (task: WorkTask, stageId: string) => Promise<void>;
};

function TaskAvatars({ task }: { task: WorkTask }) {
  return (
    <div className="flex -space-x-2">
      {task.assignees.slice(0, 3).map((person, index) => (
        <span
          key={person.id}
          title={person.name}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border-2 border-background text-[10px] font-semibold",
            index % 3 === 0 && "bg-red-100 text-red-800",
            index % 3 === 1 && "bg-blue-100 text-blue-800",
            index % 3 === 2 && "bg-emerald-100 text-emerald-800",
          )}
        >
          {initials(person.name)}
        </span>
      ))}
      {task.assignees.length > 3 && (
        <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold">
          +{task.assignees.length - 3}
        </span>
      )}
    </div>
  );
}

function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge variant="outline" className={cn("font-medium", PRIORITY_STYLES[priority])}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function BoardWorkspace({
  board,
  boards,
  tasks,
  assignees,
  employeeId,
  canChangeBoard,
  onBack,
  onSwitchBoard,
  onNewTask,
  onEditBoard,
  onOpenTask,
  onMoveTask,
}: BoardWorkspaceProps) {
  const [view, setView] = useState<BoardView>("list");
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [assigneeId, setAssigneeId] = useState("ALL");
  const [priority, setPriority] = useState<TaskPriority | "ALL">("ALL");
  const [stageId, setStageId] = useState("ALL");
  const [due, setDue] = useState<DueFilter>("ALL");
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  useEffect(() => {
    setQuery("");
    setMineOnly(false);
    setAssigneeId("ALL");
    setPriority("ALL");
    setStageId("ALL");
    setDue("ALL");
    setCollapsedStages(new Set());
  }, [board.id]);

  const boardTasks = useMemo(
    () => tasks.filter((task) => task.boardId === board.id),
    [board.id, tasks],
  );
  const visibleTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const today = startOfToday();
    return boardTasks.filter((task) => {
      if (mineOnly && employeeId && !task.assignees.some((person) => person.id === employeeId)) {
        return false;
      }
      if (assigneeId !== "ALL" && !task.assignees.some((person) => person.id === assigneeId)) {
        return false;
      }
      if (priority !== "ALL" && task.priority !== priority) return false;
      if (stageId !== "ALL" && task.stageId !== stageId) return false;
      if (due === "NONE" && task.dueDate) return false;
      if (due === "TODAY" && (!task.dueDate || !isSameDay(dateValue(task.dueDate), today))) {
        return false;
      }
      if (
        due === "OVERDUE" &&
        (!task.dueDate || !isBefore(dateValue(task.dueDate), today) || task.status === "COMPLETED")
      ) {
        return false;
      }
      if (!normalized) return true;
      return [task.title, task.description, ...task.assignees.map((person) => person.name)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [assigneeId, boardTasks, due, employeeId, mineOnly, priority, query, stageId]);

  const activeCount = boardTasks.filter(
    (task) => !["COMPLETED", "CANCELLED"].includes(task.status),
  ).length;
  const tasksByStage = useMemo(
    () =>
      new Map(
        board.stages.map((stage) => [
          stage.id,
          visibleTasks.filter((task) => task.stageId === stage.id),
        ]),
      ),
    [board.stages, visibleTasks],
  );
  const cancelledTasks = visibleTasks.filter((task) => task.status === "CANCELLED");

  function toggleStage(stage: TaskStage) {
    setCollapsedStages((current) => {
      const next = new Set(current);
      if (next.has(stage.id)) next.delete(stage.id);
      else next.add(stage.id);
      return next;
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-20">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" />
        All boards
      </Button>

      <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-red-600 via-red-500 to-rose-400 px-5 py-6 text-white shadow-lg shadow-red-900/10 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
              Work Planner
            </p>
            <h1 className="mt-1 truncate text-2xl font-semibold sm:text-3xl">{board.name}</h1>
            <p className="mt-1 text-sm text-white/85">
              {board.taskCount} tasks · {activeCount} active
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 sm:w-72 lg:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/80" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search this board"
                className="border-white/30 bg-white/10 pl-9 text-white placeholder:text-white/75 focus-visible:ring-white"
              />
            </div>
            <Button onClick={() => onNewTask()} className="bg-white text-red-600 hover:bg-white/90">
              <Plus className="mr-2 h-4 w-4" />
              New task
            </Button>
          </div>
        </div>
      </section>

      <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
        <Button
          size="sm"
          variant={stageId === "ALL" ? "secondary" : "outline"}
          onClick={() => setStageId("ALL")}
          className="shrink-0"
        >
          All <span className="ml-2 tabular-nums">{boardTasks.length}</span>
        </Button>
        {board.stages.map((stage) => {
          const color = STAGE_COLORS[stage.color];
          const count = boardTasks.filter((task) => task.stageId === stage.id).length;
          return (
            <Button
              key={stage.id}
              size="sm"
              variant="outline"
              onClick={() => setStageId(stageId === stage.id ? "ALL" : stage.id)}
              className={cn(
                "shrink-0",
                stageId === stage.id && color.soft,
                stageId === stage.id && color.text,
              )}
            >
              <span className={cn("mr-2 h-2 w-2 rounded-full", color.dot)} />
              {stage.name}
              <span className="ml-2 tabular-nums">{count}</span>
            </Button>
          );
        })}
      </div>

      <section className="space-y-3 border-y py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="scrollbar-none flex w-full flex-col gap-2 min-[480px]:flex-row min-[480px]:flex-wrap min-[480px]:items-center min-[480px]:overflow-x-auto min-[480px]:pb-1">
            {employeeId && (
              <Button
                size="sm"
                variant={mineOnly ? "secondary" : "outline"}
                onClick={() => setMineOnly((current) => !current)}
                className="w-full shrink-0 min-[480px]:w-auto"
              >
                <UserRound className="mr-2 h-4 w-4" />
                Mine
              </Button>
            )}
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger className="h-11 w-full shrink-0 min-[480px]:h-9 min-[480px]:w-[170px]">
                <SelectValue placeholder="All assignees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All assignees</SelectItem>
                {assignees.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as TaskPriority | "ALL")}
            >
              <SelectTrigger className="h-11 w-full shrink-0 min-[480px]:h-9 min-[480px]:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All priorities</SelectItem>
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger className="h-11 w-full shrink-0 min-[480px]:h-9 min-[480px]:w-[150px]">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All stages</SelectItem>
                {board.stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={due} onValueChange={(value) => setDue(value as DueFilter)}>
              <SelectTrigger className="h-11 w-full shrink-0 min-[480px]:h-9 min-[480px]:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Any due date</SelectItem>
                <SelectItem value="TODAY">Due today</SelectItem>
                <SelectItem value="OVERDUE">Overdue</SelectItem>
                <SelectItem value="NONE">No due date</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex w-full flex-col gap-2 min-[480px]:flex-row min-[480px]:items-center min-[480px]:overflow-x-auto min-[480px]:pb-1">
            <div
              className="flex w-full rounded-lg border p-1 min-[480px]:w-auto"
              role="group"
              aria-label="Board view"
            >
              {VIEW_OPTIONS.map(({ value, label, Icon }) => (
                <Button
                  key={value}
                  size="sm"
                  variant={view === value ? "default" : "ghost"}
                  onClick={() => setView(value)}
                  className={cn(
                    "h-10 flex-1 min-[480px]:h-9 min-[480px]:flex-none",
                    view === value && "bg-red-600 hover:bg-red-700",
                  )}
                >
                  <Icon className="mr-1.5 h-4 w-4" />
                  <span className="truncate">{label}</span>
                </Button>
              ))}
            </div>
            {canChangeBoard && (
              <Button
                variant="outline"
                size="icon"
                aria-label="Board settings"
                onClick={onEditBoard}
                className="shrink-0"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            )}
            <Select value={board.id} onValueChange={onSwitchBoard}>
              <SelectTrigger className="h-11 w-full shrink-0 min-[480px]:h-9 min-[480px]:w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {boards.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {visibleTasks.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <ListFilter className="mb-3 h-7 w-7 text-muted-foreground" />
            <h2 className="font-semibold">No matching tasks</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Clear a filter or add work to this board.
            </p>
          </CardContent>
        </Card>
      ) : view === "list" ? (
        <ListView
          board={board}
          tasksByStage={tasksByStage}
          cancelledTasks={cancelledTasks}
          collapsedStages={collapsedStages}
          onToggleStage={toggleStage}
          onNewTask={onNewTask}
          onOpenTask={onOpenTask}
          onMoveTask={onMoveTask}
        />
      ) : view === "kanban" ? (
        <KanbanView
          board={board}
          tasksByStage={tasksByStage}
          draggingTaskId={draggingTaskId}
          setDraggingTaskId={setDraggingTaskId}
          onNewTask={onNewTask}
          onOpenTask={onOpenTask}
          onMoveTask={onMoveTask}
        />
      ) : (
        <TimelineView tasks={visibleTasks} onOpenTask={onOpenTask} />
      )}
    </div>
  );
}

type ListViewProps = {
  board: TaskBoard;
  tasksByStage: Map<string, WorkTask[]>;
  cancelledTasks: WorkTask[];
  collapsedStages: Set<string>;
  onToggleStage: (stage: TaskStage) => void;
  onNewTask: (stageId?: string) => void;
  onOpenTask: (task: WorkTask) => void;
  onMoveTask: (task: WorkTask, stageId: string) => Promise<void>;
};

function ListView({
  board,
  tasksByStage,
  cancelledTasks,
  collapsedStages,
  onToggleStage,
  onNewTask,
  onOpenTask,
  onMoveTask,
}: ListViewProps) {
  return (
    <div className="space-y-4">
      {board.stages.map((stage) => {
        const stageTasks = tasksByStage.get(stage.id) ?? [];
        const collapsed = collapsedStages.has(stage.id);
        const color = STAGE_COLORS[stage.color];
        return (
          <section key={stage.id}>
            <button
              type="button"
              onClick={() => onToggleStage(stage)}
              className={cn(
                "mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left",
                color.text,
              )}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <span className={cn("h-2.5 w-2.5 rounded-full", color.dot)} />
              <span className="text-sm font-semibold uppercase tracking-wide">{stage.name}</span>
              <Badge variant="secondary" className="rounded-full">
                {stageTasks.length}
              </Badge>
            </button>
            {!collapsed && (
              <div className="space-y-2">
                {stageTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => onOpenTask(task)}
                    className="grid w-full cursor-pointer gap-3 rounded-xl border bg-background px-4 py-3 text-left transition hover:border-red-200 hover:bg-red-50/20 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
                  >
                    <button type="button" className="min-w-0 text-left">
                      <p className="truncate font-medium">{task.title}</p>
                      {task.description && (
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {task.description}
                        </p>
                      )}
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <TaskPriorityBadge priority={task.priority} />
                      <span
                        className={cn(
                          "text-xs text-muted-foreground",
                          task.dueDate &&
                            isBefore(dateValue(task.dueDate), startOfToday()) &&
                            task.status !== "COMPLETED" &&
                            "rounded bg-rose-100 px-2 py-1 text-rose-700",
                        )}
                      >
                        {dueLabel(task.dueDate, task.status === "COMPLETED")}
                      </span>
                    </div>
                    <TaskAvatars task={task} />
                    <Select
                      value={task.stageId ?? ""}
                      onValueChange={(nextStageId) => void onMoveTask(task, nextStageId)}
                    >
                      <SelectTrigger
                        aria-label={`Stage for ${task.title}`}
                        className="h-9 w-full sm:w-[145px]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent onClick={(event) => event.stopPropagation()}>
                        {board.stages.map((entry) => (
                          <SelectItem key={entry.id} value={entry.id}>
                            {entry.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  className="w-full justify-start border border-dashed text-muted-foreground"
                  onClick={() => onNewTask(stage.id)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add a task to {stage.name}
                </Button>
              </div>
            )}
          </section>
        );
      })}
      {cancelledTasks.length > 0 && (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          {cancelledTasks.length} cancelled tasks are hidden from workflow stages.
        </div>
      )}
    </div>
  );
}

type KanbanViewProps = {
  board: TaskBoard;
  tasksByStage: Map<string, WorkTask[]>;
  draggingTaskId: string | null;
  setDraggingTaskId: (taskId: string | null) => void;
  onNewTask: (stageId?: string) => void;
  onOpenTask: (task: WorkTask) => void;
  onMoveTask: (task: WorkTask, stageId: string) => Promise<void>;
};

function KanbanView({
  board,
  tasksByStage,
  draggingTaskId,
  setDraggingTaskId,
  onNewTask,
  onOpenTask,
  onMoveTask,
}: KanbanViewProps) {
  const allTasks = [...tasksByStage.values()].flat();
  return (
    <div className="overflow-x-auto pb-3">
      <div
        className="grid min-w-max gap-3"
        style={{ gridTemplateColumns: `repeat(${board.stages.length}, minmax(285px, 1fr))` }}
      >
        {board.stages.map((stage) => {
          const stageTasks = tasksByStage.get(stage.id) ?? [];
          const color = STAGE_COLORS[stage.color];
          return (
            <section
              key={stage.id}
              className="flex max-h-[calc(100dvh-330px)] min-h-[440px] w-[300px] flex-col rounded-xl border bg-muted/15 xl:w-auto"
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                const task = allTasks.find((entry) => entry.id === draggingTaskId);
                setDraggingTaskId(null);
                if (task && task.stageId !== stage.id) void onMoveTask(task, stage.id);
              }}
            >
              <header className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", color.dot)} />
                  <h2 className="text-sm font-semibold">{stage.name}</h2>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {stageTasks.length}
                </span>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                {stageTasks.map((task) => (
                  <Card
                    key={task.id}
                    draggable
                    onDragStart={() => setDraggingTaskId(task.id)}
                    onDragEnd={() => setDraggingTaskId(null)}
                    className={cn(
                      "cursor-grab overflow-hidden shadow-sm transition hover:border-red-200 hover:shadow-md active:cursor-grabbing",
                      draggingTaskId === task.id && "opacity-50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenTask(task)}
                      className="w-full text-left"
                    >
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="line-clamp-2 font-semibold leading-snug">{task.title}</h3>
                          <TaskPriorityBadge priority={task.priority} />
                        </div>
                        {task.description && (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {task.description}
                          </p>
                        )}
                        {task.progress > 0 && task.status !== "COMPLETED" && (
                          <div className="flex items-center gap-2">
                            <Progress value={task.progress} className="h-1.5" />
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {task.progress}%
                            </span>
                          </div>
                        )}
                      </CardContent>
                      <div className="flex items-center justify-between border-t px-4 py-3">
                        <span
                          className={cn(
                            "text-xs text-muted-foreground",
                            task.dueDate &&
                              isBefore(dateValue(task.dueDate), startOfToday()) &&
                              task.status !== "COMPLETED" &&
                              "rounded bg-rose-100 px-2 py-1 text-rose-700",
                          )}
                        >
                          {dueLabel(task.dueDate, task.status === "COMPLETED")}
                        </span>
                        <TaskAvatars task={task} />
                      </div>
                    </button>
                  </Card>
                ))}
              </div>
              <Button
                variant="ghost"
                className="m-2 justify-start"
                onClick={() => onNewTask(stage.id)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add task
              </Button>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TimelineView({
  tasks,
  onOpenTask,
}: {
  tasks: WorkTask[];
  onOpenTask: (task: WorkTask) => void;
}) {
  const today = startOfToday();
  const rangeStart = startOfMonth(subMonths(today, 1));
  const rangeEnd = endOfMonth(addMonths(today, 1));
  const totalDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  const datedTasks = tasks.filter((task) => task.startDate || task.dueDate);
  const undatedTasks = tasks.filter((task) => !task.startDate && !task.dueDate);
  const groups = new Map<string, { name: string; tasks: WorkTask[] }>();

  for (const task of datedTasks) {
    const person = task.assignees[0];
    const key = person?.id ?? "unassigned";
    const current = groups.get(key) ?? { name: person?.name ?? "Unassigned", tasks: [] };
    current.tasks.push(task);
    groups.set(key, current);
  }

  const monthLabels = [-1, 0, 1].map((offset) => format(addMonths(today, offset), "MMM yyyy"));
  const todayPosition = Math.min(
    100,
    Math.max(0, (differenceInCalendarDays(today, rangeStart) / totalDays) * 100),
  );

  return (
    <>
      <div className="space-y-3 md:hidden">
        {[...groups.entries()].map(([key, group]) => (
          <div key={key} className="rounded-lg border bg-card p-3">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-[10px] font-semibold text-red-800">
                {initials(group.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{group.name}</p>
                <p className="text-xs text-muted-foreground">{group.tasks.length} tasks</p>
              </div>
            </div>
            <div className="space-y-2">
              {group.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpenTask(task)}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-md border px-3 py-2.5 text-left text-sm transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    PRIORITY_STYLES[task.priority],
                  )}
                >
                  <span className="font-medium">{task.title}</span>
                  <span className="text-xs opacity-80">
                    {dueLabel(task.dueDate, task.status === "COMPLETED")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.size === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Add a start or due date to display tasks on the timeline.
          </div>
        )}
        {undatedTasks.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
            <ChevronRight className="h-4 w-4" />
            <span className="font-medium">No dates</span>
            <Badge variant="secondary">{undatedTasks.length}</Badge>
          </div>
        )}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[260px_1fr] border-b bg-muted/30">
            <div className="border-r px-4 py-3 text-xs font-semibold uppercase tracking-wide">
              Assignee
            </div>
            <div className="grid grid-cols-3">
              {monthLabels.map((label) => (
                <div
                  key={label}
                  className="border-r px-3 py-3 text-sm font-semibold last:border-r-0"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
          {[...groups.entries()].map(([key, group]) => {
            const rowHeight = Math.max(64, group.tasks.length * 34 + 18);
            return (
              <div
                key={key}
                className="grid grid-cols-[260px_1fr] border-b last:border-b-0"
                style={{ minHeight: rowHeight }}
              >
                <div className="flex items-start gap-3 border-r p-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-[10px] font-semibold text-red-800">
                    {initials(group.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">{group.tasks.length} tasks</p>
                  </div>
                </div>
                <div className="relative bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px)] bg-[size:33.333%_100%]">
                  <span
                    className="absolute bottom-0 top-0 z-10 w-px bg-red-500"
                    style={{ left: `${todayPosition}%` }}
                  />
                  {group.tasks.map((task, index) => {
                    const start = dateValue(task.startDate || task.dueDate!);
                    const end = dateValue(task.dueDate || task.startDate!);
                    const left = Math.min(
                      98,
                      Math.max(0, (differenceInCalendarDays(start, rangeStart) / totalDays) * 100),
                    );
                    const width = Math.max(
                      4,
                      Math.min(
                        100 - left,
                        ((differenceInCalendarDays(end, start) + 1) / totalDays) * 100,
                      ),
                    );
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onOpenTask(task)}
                        title={`${task.title}: ${dueLabel(task.dueDate, task.status === "COMPLETED")}`}
                        className={cn(
                          "absolute z-20 truncate rounded-md border px-2 py-1 text-left text-xs font-medium shadow-sm transition hover:ring-2 hover:ring-primary/30",
                          PRIORITY_STYLES[task.priority],
                        )}
                        style={{ left: `${left}%`, width: `${width}%`, top: 10 + index * 34 }}
                      >
                        {task.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {groups.size === 0 && (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Add a start or due date to display tasks on the timeline.
            </div>
          )}
          {undatedTasks.length > 0 && (
            <div className="flex items-center gap-2 border-t bg-muted/20 px-4 py-3 text-sm">
              <ChevronRight className="h-4 w-4" />
              <span className="font-medium">No dates</span>
              <Badge variant="secondary">{undatedTasks.length}</Badge>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
