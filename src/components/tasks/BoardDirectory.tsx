import {
  Archive,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
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
import { cn } from "@/lib/utils";
import type { TaskBoard, WorkTask } from "@/types/domain";
import { initials, PRIORITY_LABELS, PRIORITY_STYLES } from "./task-utils";

const ASSIGNED_PREVIEW = 8;

type BoardDirectoryProps = {
  boards: TaskBoard[];
  archivedBoards: TaskBoard[];
  tasks: WorkTask[];
  assignedTotal: number;
  employeeId?: string;
  canManage: boolean;
  canChangeBoard: (board: TaskBoard) => boolean;
  onOpenBoard: (boardId: string) => void;
  onOpenTask: (task: WorkTask) => void;
  onNewBoard: () => void;
  onArchiveBoard: (board: TaskBoard, archived: boolean) => Promise<void>;
  onViewAllAssigned: () => void;
};

export function BoardDirectory({
  boards,
  archivedBoards,
  tasks,
  assignedTotal,
  employeeId,
  canManage,
  canChangeBoard,
  onOpenBoard,
  onOpenTask,
  onNewBoard,
  onArchiveBoard,
  onViewAllAssigned,
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
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 pb-20 sm:px-6">
      <PageHeader
        title="Task boards"
        description="Shared boards you can access, plus your personal assigned inbox."
        actions={
          canManage ? (
            <Button onClick={onNewBoard} className="bg-red-600 hover:bg-red-700">
              <Plus className="mr-2 h-4 w-4" />
              New board
            </Button>
          ) : undefined
        }
      />

      {employeeId && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <UserRoundCheck className="h-5 w-5 text-slate-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Assigned to me
            </h2>
            <Badge variant="secondary" className="rounded-full">
              {assignedTotal || assignedTasks.length}
            </Badge>
            {(assignedTotal > ASSIGNED_PREVIEW || hasMoreAssigned) && (
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
                {showAllAssigned ? "Filter on a board" : "View all"}
              </Button>
            )}
          </div>
          {assignedTasks.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              No active tasks are assigned to you.
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleAssigned.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpenTask(task)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border/80 bg-background px-3 py-2.5 text-left transition hover:border-primary/30 hover:bg-muted/30 sm:px-4"
                >
                  <Badge variant="outline" className={PRIORITY_STYLES[task.priority]}>
                    {PRIORITY_LABELS[task.priority]}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
                  {task.boardName && (
                    <span className="hidden text-xs text-muted-foreground sm:block">
                      {task.boardName}
                    </span>
                  )}
                  <span className="hidden h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase text-muted-foreground sm:flex">
                    {initials(task.assignees[0]?.name ?? task.title)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
              {hasMoreAssigned && !showAllAssigned && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-center text-muted-foreground"
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
          <LayoutGrid className="h-5 w-5 text-slate-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Boards</h2>
          <Badge variant="secondary" className="rounded-full">
            {boards.length}
          </Badge>
        </div>
        {boards.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="flex flex-col items-center py-14 text-center">
              <Layers3 className="mb-3 h-7 w-7 text-muted-foreground" />
              <h3 className="font-semibold">No active boards</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {canManage
                  ? "Create a board to organize ownership and workflow."
                  : "You have not been given access to a board yet."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {boards.map((board) => (
              <Card
                key={board.id}
                className="group overflow-hidden border-border/80 shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => onOpenBoard(board.id)}
                  className="w-full p-4 text-left sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold">{board.name}</h3>
                      {board.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {board.description}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </div>
                  <div className="mt-4 flex items-center gap-3 text-sm">
                    <Badge variant="outline" className="font-normal">
                      {board.accessType === "OPEN"
                        ? "Open"
                        : board.accessType === "ROLE_GATED"
                          ? "Role-gated"
                          : "Member-gated"}
                    </Badge>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Layers3 className="h-4 w-4" />
                      <strong className="font-semibold text-foreground">
                        {board.openTaskCount}
                      </strong>
                      open
                    </span>
                  </div>
                </button>
                {canChangeBoard(board) && (
                  <div className="flex justify-end border-t bg-muted/20 px-3 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => void onArchiveBoard(board, true)}
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      Archive
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {archivedBoards.length > 0 && (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowArchived((current) => !current)}
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600"
          >
            <ChevronDown className={cn("h-4 w-4 transition", !showArchived && "-rotate-90")} />
            <Archive className="h-4 w-4" />
            Archived
            <Badge variant="secondary" className="rounded-full">
              {archivedBoards.length}
            </Badge>
          </button>
          {showArchived && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {archivedBoards.map((board) => (
                <Card key={board.id} className="overflow-hidden bg-muted/20 shadow-none">
                  <div className="w-full p-4 text-left opacity-75 sm:p-5">
                    <h3 className="font-semibold">{board.name}</h3>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {board.taskCount} total tasks
                    </p>
                  </div>
                  {canChangeBoard(board) && (
                    <div className="flex justify-end border-t px-3 py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void onArchiveBoard(board, false)}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Restore
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
