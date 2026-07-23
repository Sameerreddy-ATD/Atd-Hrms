import { format } from "date-fns";
import { CalendarDays, MessageSquareText, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { TaskBoard, WorkTask } from "@/types/domain";
import {
  dueLabel,
  initials,
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  STAGE_COLORS,
  STATUS_LABELS,
} from "./task-utils";

type TaskDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: WorkTask | null;
  board: TaskBoard | null;
  saving: boolean;
  onMove: (task: WorkTask, stageId: string) => Promise<void>;
  onAddUpdate: (task: WorkTask, message: string, progress: number) => Promise<void>;
};

export function TaskDetailDialog({
  open,
  onOpenChange,
  task,
  board,
  saving,
  onMove,
  onAddUpdate,
}: TaskDetailDialogProps) {
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!open || !task) return;
    setMessage("");
    setProgress(task.progress);
  }, [open, task]);

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100dvh-1rem)] max-h-none content-start overflow-y-auto sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-4xl">
        <DialogHeader>
          <div className="space-y-3 pr-9">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={PRIORITY_STYLES[task.priority]}>
                {PRIORITY_LABELS[task.priority]}
              </Badge>
              <Badge variant="outline">{task.stage?.name ?? STATUS_LABELS[task.status]}</Badge>
              {task.boardName && <Badge variant="secondary">{task.boardName}</Badge>}
            </div>
            <DialogTitle className="text-left text-xl leading-snug sm:text-2xl">
              {task.title}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6">
            <section>
              <h3 className="mb-2 text-sm font-semibold">Description</h3>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {task.description || "No additional details were added."}
              </p>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <MessageSquareText className="h-4 w-4" />
                <h3 className="text-sm font-semibold">Activity</h3>
                <Badge variant="secondary" className="rounded-full">
                  {task.updates.length}
                </Badge>
              </div>
              <div className="space-y-3">
                {task.updates.map((entry) => (
                  <div key={entry.id} className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{entry.authorName}</p>
                      <time className="text-xs text-muted-foreground">
                        {format(new Date(entry.createdAt), "d MMM yyyy, h:mm a")}
                      </time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {entry.message}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3 border-t pt-5">
              <h3 className="text-sm font-semibold">Post an update</h3>
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Share progress, a decision, or a blocker"
                rows={3}
              />
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_auto] sm:items-center">
                <Progress value={progress} className="h-2" />
                <div className="flex items-center gap-1">
                  <Input
                    aria-label="Progress percent"
                    type="number"
                    min={0}
                    max={100}
                    value={progress}
                    onChange={(event) =>
                      setProgress(Math.max(0, Math.min(100, Number(event.target.value))))
                    }
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <Button
                  disabled={saving || !message.trim()}
                  onClick={() => void onAddUpdate(task, message.trim(), progress)}
                >
                  {saving ? "Saving..." : "Post update"}
                </Button>
              </div>
            </section>
          </div>

          <aside className="space-y-5 rounded-xl border bg-muted/25 p-4">
            {board && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Stage
                </p>
                <Select
                  value={task.stageId ?? ""}
                  onValueChange={(stageId) => void onMove(task, stageId)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {board.stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "h-2.5 w-2.5 rounded-full",
                              STAGE_COLORS[stage.color].dot,
                            )}
                          />
                          {stage.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <UserRound className="h-3.5 w-3.5" />
                Assignees
              </p>
              <div className="mt-2 space-y-2">
                {task.assignees.map((person) => (
                  <div key={person.id} className="flex items-center gap-2 text-sm">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-[10px] font-semibold text-red-800">
                      {initials(person.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{person.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {person.designation || person.employeeCode}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                Schedule
              </p>
              <p className="mt-2 text-sm">{dueLabel(task.dueDate, task.status === "COMPLETED")}</p>
              {task.startDate && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Starts {format(new Date(`${task.startDate.slice(0, 10)}T00:00:00`), "d MMM yyyy")}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                  Progress
                </span>
                <span className="tabular-nums">{task.progress}%</span>
              </div>
              <Progress value={task.progress} className="mt-2 h-2" />
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
