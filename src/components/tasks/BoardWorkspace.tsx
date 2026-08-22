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
  Table2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDisplayDate } from "@/lib/india-date";
import { sprintsApi, tasksApi } from "@/services/api";
import { SprintBacklogPanel } from "./SprintBacklogPanel";
import type { TaskAssignee, TaskBoard, TaskPriority, TaskStage, WorkTask } from "@/types/domain";
import { toast } from "sonner";
import {
  dateValue,
  dueLabel,
  initials,
  issueKey,
  ISSUE_TYPE_LABELS,
  ISSUE_TYPE_STYLES,
  PRIORITY_LABELS,
  PRIORITY_MARK,
  PRIORITY_STYLES,
  STAGE_COLORS,
  STATUS_LABELS,
} from "./task-utils";

export type MoveTaskOptions = {
  rankBeforeTaskId?: string;
  rankAfterTaskId?: string;
};

type BoardView = "list" | "kanban" | "timeline" | "all";
type DueFilter = "ALL" | "TODAY" | "OVERDUE" | "NONE";
const VIEW_OPTIONS: Array<{ value: BoardView; label: string; Icon: LucideIcon }> = [
  { value: "kanban", label: "Board", Icon: Columns3 },
  { value: "list", label: "Backlog", Icon: LayoutList },
  { value: "all", label: "All Work", Icon: Table2 },
  { value: "timeline", label: "Timeline", Icon: CalendarRange },
];

type BoardWorkspaceProps = {
  board: TaskBoard;
  boards: TaskBoard[];
  tasks: WorkTask[];
  assignees: TaskAssignee[];
  employeeId?: string;
  loading?: boolean;
  canChangeBoard: boolean;
  canCreateWorkItem?: boolean;
  canTransitionWorkItem?: boolean;
  canManageSprint?: boolean;
  initialMineOnly?: boolean;
  onPlanChanged?: () => void;
  onBack: () => void;
  onSwitchBoard: (boardId: string) => void;
  onNewTask: (stageId?: string) => void;
  onEditBoard: () => void;
  onOpenTask: (task: WorkTask) => void;
  onMoveTask: (
    task: WorkTask,
    stageId: string,
    options?: { rankBeforeTaskId?: string; rankAfterTaskId?: string },
  ) => Promise<void>;
  onRescheduleTask?: (
    task: WorkTask,
    dates: { startDate: string | null; dueDate: string | null },
  ) => Promise<void>;
};

function TaskAvatars({ task }: { task: WorkTask }) {
  return (
    <div className="flex -space-x-1.5">
      {task.assignees.slice(0, 3).map((person, index) => (
        <span
          key={person.id}
          title={person.name}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-[9px] font-semibold",
            index % 3 === 0 && "bg-red-100 text-red-800",
            index % 3 === 1 && "bg-blue-100 text-blue-800",
            index % 3 === 2 && "bg-emerald-100 text-emerald-800",
          )}
        >
          {initials(person.name)}
        </span>
      ))}
      {task.assignees.length > 3 && (
        <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-semibold">
          +{task.assignees.length - 3}
        </span>
      )}
    </div>
  );
}

function PriorityMark({ priority }: { priority: TaskPriority }) {
  const mark = PRIORITY_MARK[priority];
  return (
    <span
      title={mark.label}
      aria-label={mark.label}
      className={cn(
        "inline-flex w-3.5 shrink-0 justify-center text-xs font-bold leading-none",
        mark.className,
      )}
    >
      {mark.glyph}
    </span>
  );
}

export function BoardWorkspace({
  board,
  boards,
  tasks,
  assignees,
  employeeId,
  loading = false,
  canChangeBoard,
  canCreateWorkItem = true,
  canTransitionWorkItem = true,
  canManageSprint = false,
  initialMineOnly = false,
  onPlanChanged,
  onBack,
  onSwitchBoard,
  onNewTask,
  onEditBoard,
  onOpenTask,
  onMoveTask,
  onRescheduleTask,
}: BoardWorkspaceProps) {
  const [view, setView] = useState<BoardView>("kanban");
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(initialMineOnly);
  const [showArchived, setShowArchived] = useState(false);
  const [assigneeId, setAssigneeId] = useState("ALL");
  const [priority, setPriority] = useState<TaskPriority | "ALL">("ALL");
  const [stageId, setStageId] = useState("ALL");
  const [due, setDue] = useState<DueFilter>("ALL");
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const draggingTaskIdRef = useRef<string | null>(null);
  const [activeSprintId, setActiveSprintId] = useState<string | null>(null);
  const [activeSprintName, setActiveSprintName] = useState<string | null>(null);

  useEffect(() => {
    setQuery("");
    setMineOnly(initialMineOnly);
    setShowArchived(false);
    setAssigneeId("ALL");
    setPriority("ALL");
    setStageId("ALL");
    setDue("ALL");
    setCollapsedStages(new Set());
    draggingTaskIdRef.current = null;
    setDraggingTaskId(null);
    setView("kanban");
    setActiveSprintId(null);
    setActiveSprintName(null);
  }, [board.id, initialMineOnly]);

  useEffect(() => {
    void sprintsApi
      .list(board.id)
      .then(({ sprints }) => {
        const active = sprints.find((entry) => entry.status === "ACTIVE");
        setActiveSprintId(active?.id ?? null);
        setActiveSprintName(active?.name ?? null);
      })
      .catch(() => {
        setActiveSprintId(null);
        setActiveSprintName(null);
      });
  }, [board.id, tasks]);

  const boardTasks = useMemo(
    () => tasks.filter((task) => task.boardId === board.id),
    [board.id, tasks],
  );
  const visibleTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const today = startOfToday();
    return boardTasks.filter((task) => {
      if (!showArchived && task.archivedAt) return false;
      if (showArchived && !task.archivedAt) return false;
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
      const key = issueKey(task, board).toLowerCase();
      return (
        key.includes(normalized) ||
        [task.title, task.description, ...task.assignees.map((person) => person.name)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalized))
      );
    });
  }, [
    assigneeId,
    board,
    boardTasks,
    due,
    employeeId,
    mineOnly,
    priority,
    query,
    showArchived,
    stageId,
  ]);
  const sprintScopedTasks = useMemo(() => {
    if (view !== "kanban" || !activeSprintId) return visibleTasks;
    return visibleTasks.filter((task) => task.sprint?.sprintId === activeSprintId);
  }, [activeSprintId, view, visibleTasks]);

  const rankTasksByStage = useMemo(
    () =>
      new Map(
        board.stages.map((stage) => [
          stage.id,
          boardTasks
            .filter((task) => !task.archivedAt && task.stageId === stage.id)
            .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0)),
        ]),
      ),
    [board.stages, boardTasks],
  );
  const tasksByStage = useMemo(
    () =>
      new Map(
        board.stages.map((stage) => [
          stage.id,
          sprintScopedTasks
            .filter((task) => task.stageId === stage.id)
            .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0)),
        ]),
      ),
    [board.stages, sprintScopedTasks],
  );
  const cancelledTasks = visibleTasks.filter((task) => task.status === "CANCELLED");
  const activeCount = boardTasks.filter(
    (task) => !task.archivedAt && !["COMPLETED", "CANCELLED"].includes(task.status),
  ).length;

  function toggleStage(stage: TaskStage) {
    setCollapsedStages((current) => {
      const next = new Set(current);
      if (next.has(stage.id)) next.delete(stage.id);
      else next.add(stage.id);
      return next;
    });
  }

  const filtersActive =
    mineOnly ||
    showArchived ||
    assigneeId !== "ALL" ||
    priority !== "ALL" ||
    stageId !== "ALL" ||
    due !== "ALL" ||
    Boolean(query.trim());

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-3 px-3 pb-20 sm:px-5">
      {/* Jira-style project chrome */}
      <div className="flex flex-col gap-3 border-b border-border/80 pb-3 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 h-8 px-2">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Projects
          </Button>
          <span className="text-muted-foreground">/</span>
          <Select value={board.id} onValueChange={onSwitchBoard}>
            <SelectTrigger className="h-8 w-auto min-w-[10rem] max-w-[16rem] border-0 bg-transparent px-1.5 font-semibold shadow-none focus:ring-0">
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
          <span className="text-xs text-muted-foreground">
            {board.taskCount} issues · {activeCount} open
            {loading ? " · Refreshing…" : ""}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canChangeBoard && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={onEditBoard}
                data-testid="project-settings-button"
              >
                <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                Project settings
              </Button>
            )}
            {canCreateWorkItem && (
              <Button size="sm" className="h-8" onClick={() => onNewTask()} data-testid="create-work-item">
                <Plus className="mr-1.5 h-4 w-4" />
                Create
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex w-full rounded-md border bg-muted/30 p-0.5 sm:w-auto"
            role="group"
            aria-label="Board view"
          >
            {VIEW_OPTIONS.map(({ value, label, Icon }) => (
              <Button
                key={value}
                size="sm"
                variant={view === value ? "secondary" : "ghost"}
                onClick={() => setView(value)}
                className={cn(
                  "h-8 flex-1 rounded-sm sm:flex-none",
                  view === value && "bg-background shadow-sm",
                )}
              >
                <Icon className="mr-1.5 h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </div>

          <div className="flex w-full flex-col gap-2 min-[480px]:flex-row min-[480px]:flex-wrap min-[480px]:items-center lg:w-auto lg:justify-end">
            <div className="relative min-w-0 flex-1 min-[480px]:max-w-xs lg:w-64 lg:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search issues"
                className="h-8 pl-8 text-sm"
              />
            </div>
            {employeeId && (
              <Button
                size="sm"
                variant={mineOnly ? "secondary" : "outline"}
                onClick={() => setMineOnly((current) => !current)}
                className="h-8 shrink-0"
              >
                <UserRound className="mr-1.5 h-3.5 w-3.5" />
                Only my issues
              </Button>
            )}
            <Button
              size="sm"
              variant={showArchived ? "secondary" : "outline"}
              onClick={() => setShowArchived((current) => !current)}
              className="h-8 shrink-0"
            >
              {showArchived ? "Archived only" : "Show archived"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger className="h-8 w-auto min-w-[8.5rem] text-xs">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Assignee: Any</SelectItem>
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
            <SelectTrigger className="h-8 w-auto min-w-[8rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Priority: Any</SelectItem>
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stageId} onValueChange={setStageId}>
            <SelectTrigger className="h-8 w-auto min-w-[8rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Status: Any</SelectItem>
              {board.stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={due} onValueChange={(value) => setDue(value as DueFilter)}>
            <SelectTrigger className="h-8 w-auto min-w-[8rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Due: Any</SelectItem>
              <SelectItem value="TODAY">Due today</SelectItem>
              <SelectItem value="OVERDUE">Overdue</SelectItem>
              <SelectItem value="NONE">No due date</SelectItem>
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => {
                setQuery("");
                setMineOnly(false);
                setShowArchived(false);
                setAssigneeId("ALL");
                setPriority("ALL");
                setStageId("ALL");
                setDue("ALL");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {view === "list" ? (
        <SprintBacklogPanel
          board={board}
          canManageSprint={canManageSprint}
          onOpenTask={onOpenTask}
          onPlanChanged={() => onPlanChanged?.()}
        />
      ) : visibleTasks.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <ListFilter className="mb-3 h-7 w-7 text-muted-foreground" />
            <h2 className="font-semibold">No matching issues</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Clear a filter or create an issue on this board.
            </p>
            <Button className="mt-4" size="sm" onClick={() => onNewTask()}>
              <Plus className="mr-1.5 h-4 w-4" />
              Create issue
            </Button>
          </CardContent>
        </Card>
      ) : view === "all" ? (
        <AllWorkView tasks={visibleTasks} onOpenTask={onOpenTask} />
      ) : view === "kanban" ? (
        <div className="space-y-3">
          {activeSprintId && activeSprintName ? (
            <div
              className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
              data-testid="active-sprint-board-banner"
            >
              Active sprint: <span className="font-semibold">{activeSprintName}</span>
            </div>
          ) : null}
          <KanbanView
          board={board}
          tasksByStage={tasksByStage}
          rankTasksByStage={rankTasksByStage}
          draggingTaskId={draggingTaskId}
          setDraggingTaskId={setDraggingTaskId}
          draggingTaskIdRef={draggingTaskIdRef}
          canCreateWorkItem={canCreateWorkItem}
          canTransitionWorkItem={canTransitionWorkItem}
          onNewTask={onNewTask}
          onOpenTask={onOpenTask}
          onMoveTask={onMoveTask}
        />
        </div>
      ) : (
        <TimelineView
          board={board}
          tasks={visibleTasks}
          onOpenTask={onOpenTask}
          onRescheduleTask={onRescheduleTask}
        />
      )}
    </div>
  );
}

function AllWorkView({
  tasks,
  onOpenTask,
}: {
  tasks: WorkTask[];
  onOpenTask: (task: WorkTask) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border bg-background">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Key</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Assignee</th>
            <th className="px-3 py-2 font-medium">Reporter</th>
            <th className="px-3 py-2 font-medium">Due</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
              onClick={() => onOpenTask(task)}
            >
              <td className="px-3 py-2 font-mono text-xs text-primary">{issueKey(task)}</td>
              <td className={cn("px-3 py-2 text-xs font-medium", ISSUE_TYPE_STYLES[task.issueType ?? "TASK"])}>
                {ISSUE_TYPE_LABELS[task.issueType ?? "TASK"]}
              </td>
              <td className="max-w-[18rem] truncate px-3 py-2 font-medium">{task.title}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {task.stage?.name ?? STATUS_LABELS[task.status]}
              </td>
              <td className="px-3 py-2">
                <PriorityMark priority={task.priority} />
              </td>
              <td className="max-w-[8rem] truncate px-3 py-2 text-xs">
                {task.assignees.map((a) => a.name).join(", ") || "—"}
              </td>
              <td className="max-w-[8rem] truncate px-3 py-2 text-xs">
                {task.reporterName ?? task.createdByName}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {dueLabel(task.dueDate, false)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type BacklogViewProps = {
  board: TaskBoard;
  tasksByStage: Map<string, WorkTask[]>;
  cancelledTasks: WorkTask[];
  collapsedStages: Set<string>;
  onToggleStage: (stage: TaskStage) => void;
  onNewTask: (stageId?: string) => void;
  onOpenTask: (task: WorkTask) => void;
  onMoveTask: (task: WorkTask, stageId: string, options?: MoveTaskOptions) => Promise<void>;
};

function BacklogView({
  board,
  tasksByStage,
  cancelledTasks,
  collapsedStages,
  onToggleStage,
  onNewTask,
  onOpenTask,
  onMoveTask,
}: BacklogViewProps) {
  return (
    <div className="space-y-2">
      {board.stages.map((stage) => {
        const stageTasks = tasksByStage.get(stage.id) ?? [];
        const collapsed = collapsedStages.has(stage.id);
        const color = STAGE_COLORS[stage.color] ?? STAGE_COLORS.SLATE;
        return (
          <section key={stage.id} className="overflow-hidden rounded-md border bg-background">
            <button
              type="button"
              onClick={() => onToggleStage(stage)}
              className={cn(
                "flex w-full items-center gap-2 border-b bg-muted/30 px-3 py-2 text-left",
                color.text,
              )}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <span className={cn("h-2 w-2 rounded-full", color.dot)} />
              <span className="text-xs font-semibold uppercase tracking-wide">{stage.name}</span>
              <Badge variant="secondary" className="rounded-md font-normal tabular-nums">
                {stageTasks.length}
              </Badge>
            </button>
            {!collapsed && (
              <div>
                {stageTasks.map((task, index) => (
                  <div
                    key={task.id}
                    className={cn(
                      "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] sm:gap-3 sm:px-3",
                      index > 0 && "border-t",
                      "hover:bg-muted/40",
                    )}
                  >
                    <PriorityMark priority={task.priority} />
                    <button
                      type="button"
                      onClick={() => onOpenTask(task)}
                      className="hidden font-mono text-xs text-primary hover:underline sm:block"
                    >
                      {issueKey(task, board)}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenTask(task)}
                      className="min-w-0 truncate text-left text-sm font-medium hover:text-primary"
                    >
                      <span className="font-mono text-xs text-primary sm:hidden">
                        {issueKey(task, board)}{" "}
                      </span>
                      {task.title}
                    </button>
                    <span
                      className={cn(
                        "hidden text-xs text-muted-foreground lg:block",
                        task.dueDate &&
                          isBefore(dateValue(task.dueDate), startOfToday()) &&
                          task.status !== "COMPLETED" &&
                          "font-medium text-rose-600",
                      )}
                    >
                      {dueLabel(task.dueDate, task.status === "COMPLETED")}
                    </span>
                    <div className="hidden sm:block">
                      <TaskAvatars task={task} />
                    </div>
                    <Select
                      value={task.stageId ?? ""}
                      onValueChange={(nextStageId) => void onMoveTask(task, nextStageId)}
                    >
                      <SelectTrigger
                        aria-label={`Status for ${task.title}`}
                        className="h-7 w-[7.5rem] text-xs"
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
                  size="sm"
                  className="w-full justify-start rounded-none border-t text-muted-foreground"
                  onClick={() => onNewTask(stage.id)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create issue in {stage.name}
                </Button>
              </div>
            )}
          </section>
        );
      })}
      {cancelledTasks.length > 0 && (
        <section className="space-y-1 rounded-md border border-dashed p-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cancelled ({cancelledTasks.length})
          </h3>
          {cancelledTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onOpenTask(task)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/30"
            >
              <PriorityMark priority={task.priority} />
              <span className="font-mono text-xs">{issueKey(task, board)}</span>
              <span className="truncate">{task.title}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

type KanbanViewProps = {
  board: TaskBoard;
  tasksByStage: Map<string, WorkTask[]>;
  rankTasksByStage: Map<string, WorkTask[]>;
  draggingTaskId: string | null;
  setDraggingTaskId: (taskId: string | null) => void;
  draggingTaskIdRef: MutableRefObject<string | null>;
  canCreateWorkItem: boolean;
  canTransitionWorkItem: boolean;
  onNewTask: (stageId?: string) => void;
  onOpenTask: (task: WorkTask) => void;
  onMoveTask: (task: WorkTask, stageId: string, options?: MoveTaskOptions) => Promise<void>;
};

function dropOptionsForIndex(
  columnTasks: WorkTask[],
  draggedId: string,
  targetIndex: number,
): MoveTaskOptions {
  const withoutDragged = columnTasks.filter((entry) => entry.id !== draggedId);
  const clamped = Math.max(0, Math.min(targetIndex, withoutDragged.length));
  const before = withoutDragged[clamped - 1];
  const after = withoutDragged[clamped];
  return {
    ...(before ? { rankBeforeTaskId: before.id } : {}),
    ...(after ? { rankAfterTaskId: after.id } : {}),
  };
}

/** Place relative to the visible drop target, against the unfiltered column order. */
function dropOptionsFromVisibleIndex(
  visibleColumn: WorkTask[],
  fullColumn: WorkTask[],
  draggedId: string,
  targetIndex: number,
): MoveTaskOptions {
  const visibleWithout = visibleColumn.filter((entry) => entry.id !== draggedId);
  const fullWithout = fullColumn.filter((entry) => entry.id !== draggedId);
  const clamped = Math.max(0, Math.min(targetIndex, visibleWithout.length));
  const visibleBefore = visibleWithout[clamped - 1];
  const visibleAfter = visibleWithout[clamped];

  if (visibleBefore) {
    const beforeIndex = fullWithout.findIndex((entry) => entry.id === visibleBefore.id);
    const before = beforeIndex >= 0 ? fullWithout[beforeIndex] : undefined;
    const after = beforeIndex >= 0 ? fullWithout[beforeIndex + 1] : undefined;
    return {
      ...(before ? { rankBeforeTaskId: before.id } : {}),
      ...(after ? { rankAfterTaskId: after.id } : {}),
    };
  }
  if (visibleAfter) {
    const afterIndex = fullWithout.findIndex((entry) => entry.id === visibleAfter.id);
    const after = afterIndex >= 0 ? fullWithout[afterIndex] : undefined;
    const before = afterIndex > 0 ? fullWithout[afterIndex - 1] : undefined;
    return {
      ...(before ? { rankBeforeTaskId: before.id } : {}),
      ...(after ? { rankAfterTaskId: after.id } : {}),
    };
  }
  return dropOptionsForIndex(fullWithout, draggedId, fullWithout.length);
}

function KanbanView({
  board,
  tasksByStage,
  rankTasksByStage,
  draggingTaskId,
  setDraggingTaskId,
  draggingTaskIdRef,
  canCreateWorkItem,
  canTransitionWorkItem,
  onNewTask,
  onOpenTask,
  onMoveTask,
}: KanbanViewProps) {
  const allTasks = [...rankTasksByStage.values()].flat();
  const [validDropStageIds, setValidDropStageIds] = useState<Set<string> | null>(null);
  const validDropStageIdsRef = useRef<Set<string> | null>(null);
  const dragFetchTokenRef = useRef(0);

  function finishDrag() {
    draggingTaskIdRef.current = null;
    setDraggingTaskId(null);
    validDropStageIdsRef.current = null;
    setValidDropStageIds(null);
  }

  async function beginDrag(task: WorkTask) {
    if (!canTransitionWorkItem) return;
    draggingTaskIdRef.current = task.id;
    setDraggingTaskId(task.id);
    const token = ++dragFetchTokenRef.current;
    const currentStageIds = new Set<string>(task.stageId ? [task.stageId] : []);
    validDropStageIdsRef.current = currentStageIds;
    setValidDropStageIds(new Set(currentStageIds));
    try {
      const { transitions } = await tasksApi.transitions(task.id);
      if (token !== dragFetchTokenRef.current || draggingTaskIdRef.current !== task.id) {
        return;
      }
      const next = new Set(currentStageIds);
      for (const transition of transitions) {
        if (transition.toStageId) next.add(transition.toStageId);
      }
      validDropStageIdsRef.current = next;
      setValidDropStageIds(next);
    } catch (cause) {
      if (token !== dragFetchTokenRef.current) return;
      toast.error((cause as Error).message || "Could not load allowed transitions.");
      validDropStageIdsRef.current = currentStageIds;
      setValidDropStageIds(currentStageIds);
    }
  }

  function handleDropOnColumn(stage: TaskStage, targetIndex?: number) {
    if (!canTransitionWorkItem) {
      finishDrag();
      return;
    }
    const id = draggingTaskIdRef.current ?? draggingTaskId;
    const task = allTasks.find((entry) => entry.id === id);
    const allowedStages = validDropStageIdsRef.current;
    if (!task) {
      finishDrag();
      return;
    }

    if (task.stageId === stage.id) {
      finishDrag();
      const stageTasks = tasksByStage.get(stage.id) ?? [];
      const rankColumn = rankTasksByStage.get(stage.id) ?? [];
      const currentIndex = stageTasks.findIndex((entry) => entry.id === task.id);
      if (currentIndex < 0) return;
      if (targetIndex === undefined) {
        if (currentIndex === stageTasks.length - 1) return;
      } else if (targetIndex === currentIndex || targetIndex === currentIndex + 1) {
        return;
      }
      const index = targetIndex ?? stageTasks.filter((entry) => entry.id !== task.id).length;
      const options = dropOptionsFromVisibleIndex(stageTasks, rankColumn, task.id, index);
      void onMoveTask(task, stage.id, options);
      return;
    }

    if (allowedStages && !allowedStages.has(stage.id)) {
      finishDrag();
      const fromName =
        board.stages.find((entry) => entry.id === task.stageId)?.name ??
        task.workflowStatus?.name ??
        "the current status";
      toast.error(`This work item cannot move directly from ${fromName} to ${stage.name}.`);
      return;
    }

    finishDrag();
    const stageTasks = tasksByStage.get(stage.id) ?? [];
    const rankColumn = rankTasksByStage.get(stage.id) ?? [];
    const index = targetIndex ?? stageTasks.filter((entry) => entry.id !== task.id).length;
    const options = dropOptionsFromVisibleIndex(stageTasks, rankColumn, task.id, index);
    void onMoveTask(task, stage.id, options);
  }

  return (
    <div className="overflow-x-auto pb-3">
      <div
        className="grid min-w-max gap-2"
        style={{ gridTemplateColumns: `repeat(${board.stages.length}, minmax(240px, 1fr))` }}
      >
        {board.stages.map((stage) => {
          const stageTasks = tasksByStage.get(stage.id) ?? [];
          const color = STAGE_COLORS[stage.color] ?? STAGE_COLORS.SLATE;
          const isValidDropTarget =
            !!draggingTaskId &&
            (validDropStageIds == null || validDropStageIds.has(stage.id));
          const isInvalidDropTarget =
            !!draggingTaskId && validDropStageIds != null && !validDropStageIds.has(stage.id);
          return (
            <section
              key={stage.id}
              className={cn(
                "flex max-h-[min(72dvh,680px)] min-h-[280px] w-[260px] flex-col rounded-md border border-border/80 bg-muted/20 xl:w-auto",
                isValidDropTarget && "ring-2 ring-primary/40 border-primary/50",
                isInvalidDropTarget && "opacity-50",
              )}
              onDragOver={(event) => {
                if (isInvalidDropTarget) return;
                event.preventDefault();
              }}
              onDrop={() => handleDropOnColumn(stage)}
            >
              <header className="flex items-center justify-between gap-2 border-b border-border/60 px-2.5 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", color.dot)} />
                  <h2 className="truncate text-xs font-semibold uppercase tracking-wide">
                    {stage.name}
                  </h2>
                </div>
                <span className="rounded bg-background px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {stageTasks.length}
                </span>
              </header>
              <div className="flex-1 space-y-1.5 overflow-y-auto px-1.5 py-1.5">
                {stageTasks.map((task, index) => (
                  <div
                    key={task.id}
                    draggable={canTransitionWorkItem}
                    onDragStart={() => {
                      void beginDrag(task);
                    }}
                    onDragEnd={() => {
                      setDraggingTaskId(null);
                      window.setTimeout(() => {
                        if (draggingTaskIdRef.current === task.id) {
                          finishDrag();
                        }
                      }, 0);
                    }}
                    onDragOver={(event) => {
                      if (!canTransitionWorkItem || isInvalidDropTarget) return;
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleDropOnColumn(stage, index);
                    }}
                    className={cn(
                      "rounded-md border border-border/70 bg-background px-2.5 py-2 text-left shadow-sm transition hover:border-primary/40",
                      canTransitionWorkItem && "cursor-grab active:cursor-grabbing",
                      draggingTaskId === task.id && "opacity-50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenTask(task)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start gap-1.5">
                        <PriorityMark priority={task.priority} />
                        <span
                          title={ISSUE_TYPE_LABELS[task.issueType ?? "TASK"]}
                          className={cn(
                            "mt-0.5 shrink-0 text-[10px] font-bold uppercase",
                            ISSUE_TYPE_STYLES[task.issueType ?? "TASK"],
                          )}
                        >
                          {(task.issueType ?? "TASK").slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-medium leading-snug">
                          {task.title}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {issueKey(task, board)}
                        </span>
                        <div className="flex items-center gap-2">
                          {task.dueDate && (
                            <span
                              className={cn(
                                "text-[10px] text-muted-foreground",
                                isBefore(dateValue(task.dueDate), startOfToday()) &&
                                  task.status !== "COMPLETED" &&
                                  "font-medium text-rose-600",
                              )}
                            >
                              {formatDisplayDate(task.dueDate)}
                            </span>
                          )}
                          <TaskAvatars task={task} />
                        </div>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
              {canCreateWorkItem && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="m-1.5 h-8 justify-start text-xs text-muted-foreground"
                  onClick={() => onNewTask(stage.id)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Create issue
                </Button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TimelineView({
  board,
  tasks,
  onOpenTask,
  onRescheduleTask,
}: {
  board: TaskBoard;
  tasks: WorkTask[];
  onOpenTask: (task: WorkTask) => void;
  onRescheduleTask?: (
    task: WorkTask,
    dates: { startDate: string | null; dueDate: string | null },
  ) => Promise<void>;
}) {
  const today = startOfToday();
  const rangeStart = startOfMonth(subMonths(today, 1));
  const rangeEnd = endOfMonth(addMonths(today, 1));
  const totalDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  const datedTasks = tasks.filter((task) => task.startDate || task.dueDate);
  const undatedTasks = tasks.filter((task) => !task.startDate && !task.dueDate);
  const groups = new Map<string, { name: string; tasks: WorkTask[] }>();
  const dragOriginRef = useRef<{ taskId: string; clientX: number; start: Date; end: Date } | null>(
    null,
  );
  const [dragPreview, setDragPreview] = useState<{
    taskId: string;
    left: number;
    width: number;
  } | null>(null);

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

  function dayFromClientX(clientX: number, rect: DOMRect) {
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)));
    return Math.round(ratio * (totalDays - 1));
  }

  function handleBarPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    task: WorkTask,
    track: HTMLDivElement | null,
  ) {
    if (!onRescheduleTask || !track) return;
    event.preventDefault();
    event.stopPropagation();
    const start = dateValue(task.startDate || task.dueDate!);
    const end = dateValue(task.dueDate || task.startDate!);
    dragOriginRef.current = { taskId: task.id, clientX: event.clientX, start, end };
    const left = Math.min(
      98,
      Math.max(0, (differenceInCalendarDays(start, rangeStart) / totalDays) * 100),
    );
    const width = Math.max(
      4,
      Math.min(100 - left, ((differenceInCalendarDays(end, start) + 1) / totalDays) * 100),
    );
    setDragPreview({ taskId: task.id, left, width });
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    function onMove(moveEvent: PointerEvent) {
      const origin = dragOriginRef.current;
      if (!origin || origin.taskId !== task.id || !track) return;
      const rect = track.getBoundingClientRect();
      const deltaDays =
        dayFromClientX(moveEvent.clientX, rect) - dayFromClientX(origin.clientX, rect);
      const nextStart = new Date(origin.start);
      nextStart.setDate(nextStart.getDate() + deltaDays);
      const nextEnd = new Date(origin.end);
      nextEnd.setDate(nextEnd.getDate() + deltaDays);
      const nextLeft = Math.min(
        98,
        Math.max(0, (differenceInCalendarDays(nextStart, rangeStart) / totalDays) * 100),
      );
      const nextWidth = Math.max(
        4,
        Math.min(
          100 - nextLeft,
          ((differenceInCalendarDays(nextEnd, nextStart) + 1) / totalDays) * 100,
        ),
      );
      setDragPreview({ taskId: task.id, left: nextLeft, width: nextWidth });
    }

    async function onUp(upEvent: PointerEvent) {
      target.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const origin = dragOriginRef.current;
      dragOriginRef.current = null;
      setDragPreview(null);
      if (!origin || origin.taskId !== task.id || !track) return;
      const rect = track.getBoundingClientRect();
      const deltaDays =
        dayFromClientX(upEvent.clientX, rect) - dayFromClientX(origin.clientX, rect);
      if (deltaDays === 0) {
        onOpenTask(task);
        return;
      }
      const nextStart = new Date(origin.start);
      nextStart.setDate(nextStart.getDate() + deltaDays);
      const nextEnd = new Date(origin.end);
      nextEnd.setDate(nextEnd.getDate() + deltaDays);
      await onRescheduleTask?.(task, {
        startDate: format(nextStart, "yyyy-MM-dd"),
        dueDate: format(nextEnd, "yyyy-MM-dd"),
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {[...groups.entries()].map(([key, group]) => (
          <div key={key} className="rounded-md border bg-card p-3">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                {initials(group.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{group.name}</p>
                <p className="text-xs text-muted-foreground">{group.tasks.length} issues</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {group.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpenTask(task)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition hover:border-primary/40",
                    PRIORITY_STYLES[task.priority],
                  )}
                >
                  <span className="font-mono text-[11px] opacity-80">{issueKey(task, board)}</span>
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
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Add a start or due date to display issues on the timeline.
          </div>
        )}
        {undatedTasks.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-4 py-3 text-sm">
            <ChevronRight className="h-4 w-4" />
            <span className="font-medium">No dates</span>
            <Badge variant="secondary">{undatedTasks.length}</Badge>
          </div>
        )}
      </div>
      <div className="hidden overflow-x-auto rounded-md border md:block">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[260px_1fr] border-b bg-muted/30">
            <div className="border-r px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">
              Assignee
            </div>
            <div className="grid grid-cols-3">
              {monthLabels.map((label) => (
                <div
                  key={label}
                  className="border-r px-3 py-2.5 text-sm font-semibold last:border-r-0"
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
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                    {initials(group.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">{group.tasks.length} issues</p>
                  </div>
                </div>
                <div className="relative bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px)] bg-[size:33.333%_100%]">
                  <span
                    className="absolute bottom-0 top-0 z-10 w-px bg-primary"
                    style={{ left: `${todayPosition}%` }}
                  />
                  {group.tasks.map((task, index) => {
                    const start = dateValue(task.startDate || task.dueDate!);
                    const end = dateValue(task.dueDate || task.startDate!);
                    const left =
                      dragPreview?.taskId === task.id
                        ? dragPreview.left
                        : Math.min(
                            98,
                            Math.max(
                              0,
                              (differenceInCalendarDays(start, rangeStart) / totalDays) * 100,
                            ),
                          );
                    const width =
                      dragPreview?.taskId === task.id
                        ? dragPreview.width
                        : Math.max(
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
                        onClick={() => {
                          if (!onRescheduleTask) onOpenTask(task);
                        }}
                        onPointerDown={(event) => {
                          const track = event.currentTarget.parentElement as HTMLDivElement | null;
                          handleBarPointerDown(event, task, track);
                        }}
                        title={`${issueKey(task, board)} ${task.title}: ${dueLabel(task.dueDate, task.status === "COMPLETED")}${
                          onRescheduleTask ? " · drag to move dates" : ""
                        }`}
                        className={cn(
                          "absolute z-20 truncate rounded border px-2 py-1 text-left text-xs font-medium shadow-sm transition hover:ring-2 hover:ring-primary/30",
                          onRescheduleTask && "cursor-grab active:cursor-grabbing",
                          PRIORITY_STYLES[task.priority],
                        )}
                        style={{ left: `${left}%`, width: `${width}%`, top: 10 + index * 34 }}
                      >
                        <span className="font-mono opacity-70">{issueKey(task, board)}</span>{" "}
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
              Add a start or due date to display issues on the timeline.
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
