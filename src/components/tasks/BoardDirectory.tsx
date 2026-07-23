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

type BoardDirectoryProps = {
  boards: TaskBoard[];
  archivedBoards: TaskBoard[];
  tasks: WorkTask[];
  employeeId?: string;
  canManage: boolean;
  canChangeBoard: (board: TaskBoard) => boolean;
  onOpenBoard: (boardId: string) => void;
  onOpenTask: (task: WorkTask) => void;
  onNewBoard: () => void;
  onArchiveBoard: (board: TaskBoard, archived: boolean) => Promise<void>;
};

export function BoardDirectory({
  boards,
  archivedBoards,
  tasks,
  employeeId,
  canManage,
  canChangeBoard,
  onOpenBoard,
  onOpenTask,
  onNewBoard,
  onArchiveBoard,
}: BoardDirectoryProps) {
  const [showArchived, setShowArchived] = useState(false);
  const assignedTasks = useMemo(() => {
    const archivedBoardIds = new Set(archivedBoards.map((board) => board.id));
    return employeeId
      ? tasks
          .filter(
            (task) =>
              task.assignees.some((person) => person.id === employeeId) &&
              (!task.boardId || !archivedBoardIds.has(task.boardId)) &&
              !["COMPLETED", "CANCELLED"].includes(task.status),
          )
          .slice(0, 8)
      : [];
  }, [archivedBoards, employeeId, tasks]);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-8 pb-20">
      <PageHeader
        title="Task boards"
        description="All your accessible boards and assigned work in one place."
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
          <div className="flex items-center gap-2">
            <UserRoundCheck className="h-5 w-5 text-slate-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Assigned to me
            </h2>
            <Badge variant="secondary" className="rounded-full">
              {assignedTasks.length}
            </Badge>
          </div>
          {assignedTasks.length === 0 ? (
            <Card className="border-dashed shadow-none">
              <CardContent className="py-6 text-sm text-muted-foreground">
                No active tasks are assigned to you.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {assignedTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpenTask(task)}
                  className="flex w-full items-center gap-3 rounded-xl border bg-background px-3 py-3 text-left transition hover:border-red-200 hover:bg-red-50/30 sm:px-4"
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
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {boards.map((board) => (
              <Card
                key={board.id}
                className="group overflow-hidden border-border/80 shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => onOpenBoard(board.id)}
                  className="w-full p-5 text-left"
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
                  <div className="mt-5 flex items-center gap-3 text-sm">
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {archivedBoards.map((board) => (
                <Card key={board.id} className="overflow-hidden bg-muted/20 shadow-none">
                  <div className="w-full p-5 text-left opacity-75">
                    <h3 className="font-semibold">{board.name}</h3>
                    <p className="mt-4 text-sm text-muted-foreground">
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
