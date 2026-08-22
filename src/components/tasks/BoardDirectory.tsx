import {
  Archive,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Layers3,
  Plus,
  RotateCcw,
  UserRoundCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/PageHeader";
import { formatDepartmentPathById } from "@/lib/department-label";
import { cn } from "@/lib/utils";
import type { Department, TaskBoard, WorkTask } from "@/types/domain";
import { boardKeyPrefix, dueLabel, initials, issueKey, PRIORITY_MARK } from "./task-utils";
import { PlannerGlobalSearch } from "./PlannerGlobalSearch";

const ASSIGNED_PREVIEW = 8;
const GATED_UNITS_LABEL_MAX = 72;

type BoardDirectoryProps = {
  boards: TaskBoard[];
  archivedBoards: TaskBoard[];
  tasks: WorkTask[];
  assignedTotal: number;
  departments?: Department[];
  employeeId?: string;
  canManage: boolean;
  canChangeBoard: (board: TaskBoard) => boolean;
  onOpenBoard: (boardId: string) => void;
  onOpenTask: (task: WorkTask) => void;
  onNewBoard: () => void;
  onArchiveBoard: (board: TaskBoard, archived: boolean) => Promise<void>;
  onViewAllAssigned: () => void;
  onOpenSavedViews: () => void;
  onSearchSelect: (taskId: string) => void;
};

function gatedUnitsSubtitle(board: TaskBoard, departments: Department[]): string {
  if (departments.length === 0 || board.allowedDepartmentIds.length === 0) {
    return "Unit-gated";
  }
  const names = board.allowedDepartmentIds
    .map((id) => formatDepartmentPathById(departments, id, ""))
    .map((label) => label.trim())
    .filter(Boolean);
  if (names.length === 0) return "Unit-gated";
  const joined = names.join(", ");
  if (joined.length <= GATED_UNITS_LABEL_MAX) return joined;
  return `${joined.slice(0, GATED_UNITS_LABEL_MAX - 1).trimEnd()}…`;
}

function PriorityMark({ priority }: { priority: WorkTask["priority"] }) {
  const mark = PRIORITY_MARK[priority];
  return (
    <span
      title={mark.label}
      aria-label={mark.label}
      className={cn(
        "inline-flex w-4 justify-center text-sm font-bold leading-none",
        mark.className,
      )}
    >
      {mark.glyph}
    </span>
  );
}

export function BoardDirectory({
  boards,
  archivedBoards,
  tasks,
  assignedTotal: _assignedTotal,
  departments = [],
  employeeId,
  canManage,
  canChangeBoard,
  onOpenBoard,
  onOpenTask,
  onNewBoard,
  onArchiveBoard,
  onViewAllAssigned,
  onOpenSavedViews,
  onSearchSelect,
}: BoardDirectoryProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [showAllAssigned, setShowAllAssigned] = useState(false);

  const assignedTasks = useMemo(() => {
    const archivedBoardIds = new Set(archivedBoards.map((board) => board.id));
    return employeeId
      ? tasks.filter(
          (task) =>
            task.assignees.some((person) => person.id === employeeId) &&
            (!task.boardId || !archivedBoardIds.has(task.boardId)) &&
            !["COMPLETED", "CANCELLED"].includes(task.status),
        )
      : [];
  }, [archivedBoards, employeeId, tasks]);

  const visibleAssigned = showAllAssigned
    ? assignedTasks
    : assignedTasks.slice(0, ASSIGNED_PREVIEW);
  const hasMoreAssigned = assignedTasks.length > ASSIGNED_PREVIEW;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-8 px-4 pb-20 sm:px-6">
      <PageHeader
        title="Work Planner"
        description="My Work and Projects — plan, track, and complete work items."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PlannerGlobalSearch onSelect={onSearchSelect} />
            <Button variant="outline" onClick={onOpenSavedViews} data-testid="open-saved-views">
              Saved views
            </Button>
            {canManage ? (
              <Button onClick={onNewBoard}>
                <Plus className="mr-2 h-4 w-4" />
                Create project
              </Button>
            ) : null}
          </div>
        }
      />

      {employeeId && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <UserRoundCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">My Work</h2>
            <Badge variant="secondary" className="rounded-md font-normal tabular-nums">
              {assignedTasks.length}
            </Badge>
            {(assignedTasks.length > ASSIGNED_PREVIEW || hasMoreAssigned) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-8 text-muted-foreground"
                onClick={() => {
                  if (!showAllAssigned && hasMoreAssigned) {
                    setShowAllAssigned(true);
                    return;
                  }
                  onViewAllAssigned();
                }}
              >
                {showAllAssigned ? "Open on a board" : "View all"}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Assigned to me · active issues</p>
          {assignedTasks.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No active issues are assigned to you.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border bg-background">
              {visibleAssigned.map((task, index) => {
                const key = issueKey(task);
                const mark = PRIORITY_MARK[task.priority];
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted/50 sm:px-4",
                      index > 0 && "border-t",
                    )}
                  >
                    <PriorityMark priority={task.priority} />
                    <span className="hidden w-16 shrink-0 font-mono text-xs text-primary sm:block">
                      {key}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {task.title}
                    </span>
                    {task.boardName && (
                      <span className="hidden max-w-[10rem] truncate text-xs text-muted-foreground md:block">
                        {task.boardName}
                      </span>
                    )}
                    <span className="hidden text-xs text-muted-foreground lg:block">
                      {dueLabel(task.dueDate, false)}
                    </span>
                    <span
                      className="hidden h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase text-muted-foreground sm:flex"
                      title={mark.label}
                    >
                      {initials(task.assignees[0]?.name ?? task.title)}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
              {hasMoreAssigned && !showAllAssigned && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-center rounded-none border-t text-muted-foreground"
                  onClick={() => setShowAllAssigned(true)}
                >
                  Show {assignedTasks.length - ASSIGNED_PREVIEW} more
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Projects</h2>
          <Badge variant="secondary" className="rounded-md font-normal tabular-nums">
            {boards.length}
          </Badge>
        </div>
        {boards.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="flex flex-col items-center py-14 text-center">
              <Layers3 className="mb-3 h-7 w-7 text-muted-foreground" />
              <h3 className="font-semibold">No projects yet</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {canManage
                  ? "Create a project board with stages to start tracking issues."
                  : "You have not been given access to a project board yet."}
              </p>
              {canManage && (
                <Button className="mt-4" onClick={onNewBoard}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create project
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-md border bg-background">
            {boards.map((board, index) => (
              <div
                key={board.id}
                className={cn("flex items-stretch gap-0", index > 0 && "border-t")}
              >
                <button
                  type="button"
                  onClick={() => onOpenBoard(board.id)}
                  data-testid={`project-open-${board.keyPrefix ?? board.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left transition hover:bg-muted/50 sm:px-4"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-xs font-bold text-primary">
                    {board.keyPrefix || boardKeyPrefix(board.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{board.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {board.description ||
                        (board.accessType === "OPEN"
                          ? "Open project"
                          : board.accessType === "DEPARTMENT_GATED"
                            ? gatedUnitsSubtitle(board, departments)
                            : "Member-gated")}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
                    <strong className="font-semibold text-foreground">{board.openTaskCount}</strong>{" "}
                    open · {board.taskCount} total
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                {canChangeBoard(board) && (
                  <div className="flex items-center border-l px-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => void onArchiveBoard(board, true)}
                    >
                      <Archive className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Archive</span>
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {archivedBoards.length > 0 && (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowArchived((current) => !current)}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"
          >
            <ChevronDown className={cn("h-4 w-4 transition", !showArchived && "-rotate-90")} />
            <Archive className="h-4 w-4" />
            Archived projects
            <Badge variant="secondary" className="rounded-md font-normal tabular-nums">
              {archivedBoards.length}
            </Badge>
          </button>
          {showArchived && (
            <div className="overflow-hidden rounded-md border bg-muted/20">
              {archivedBoards.map((board, index) => (
                <div
                  key={board.id}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3 py-3 sm:px-4",
                    index > 0 && "border-t",
                  )}
                >
                  <div className="min-w-0 opacity-75">
                    <p className="truncate text-sm font-medium">{board.name}</p>
                    <p className="text-xs text-muted-foreground">{board.taskCount} total issues</p>
                  </div>
                  {canChangeBoard(board) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void onArchiveBoard(board, false)}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restore
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
