import { format } from "date-fns";
import { CalendarDays, MessageSquareText, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import type { TaskAssignee, TaskBoard, TaskPriority, WorkTask } from "@/types/domain";
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
  assignees: TaskAssignee[];
  loading?: boolean;
  saving: boolean;
  onSave: (
    task: WorkTask,
    patch: {
      title: string;
      description: string | null;
      priority: TaskPriority;
      startDate: string | null;
      dueDate: string | null;
      stageId?: string;
      assigneeEmployeeIds: string[];
    },
  ) => Promise<void>;
  onMove: (task: WorkTask, stageId: string) => Promise<void>;
  onAddUpdate: (task: WorkTask, message: string, progress: number) => Promise<void>;
};

const ACTIVITY_LABELS: Record<string, string> = {
  CREATED: "Created",
  COMMENT: "Comment",
  STATUS_CHANGED: "Status changed",
  PROGRESS_UPDATED: "Progress updated",
  ASSIGNEES_CHANGED: "Assignees updated",
  DETAILS_UPDATED: "Details updated",
};

export function TaskDetailDialog({
  open,
  onOpenChange,
  task,
  board,
  assignees,
  loading = false,
  saving,
  onSave,
  onMove,
  onAddUpdate,
}: TaskDetailDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [stageId, setStageId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open || !task) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setStartDate(task.startDate ?? "");
    setDueDate(task.dueDate ?? "");
    setStageId(task.stageId ?? "");
    setAssigneeIds(task.assignees.map((person) => person.id));
    setAssigneeQuery("");
    setMessage("");
    setProgress(task.progress);
    setFormError("");
  }, [open, task]);

  const availableAssignees = useMemo(() => {
    const allowed = assignees.filter((person) => {
      if (!board) return true;
      if (board.accessType === "MEMBER_GATED") return board.memberEmployeeIds.includes(person.id);
      if (board.accessType === "ROLE_GATED") {
        return !!person.role && board.allowedRoles.includes(person.role);
      }
      return true;
    });
    const selected = new Map(assignees.map((person) => [person.id, person]));
    for (const id of assigneeIds) {
      const person = selected.get(id);
      if (person && !allowed.some((entry) => entry.id === id)) allowed.push(person);
    }
    const normalized = assigneeQuery.trim().toLowerCase();
    if (!normalized) return allowed;
    return allowed.filter((person) =>
      [person.name, person.employeeCode, person.designation, person.department]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [assigneeIds, assigneeQuery, assignees, board]);

  const dirty =
    !!task &&
    (title.trim() !== task.title ||
      description.trim() !== (task.description ?? "") ||
      priority !== task.priority ||
      (startDate || null) !== (task.startDate ?? null) ||
      (dueDate || null) !== (task.dueDate ?? null) ||
      (stageId || "") !== (task.stageId ?? "") ||
      assigneeIds.slice().sort().join() !==
        task.assignees
          .map((person) => person.id)
          .slice()
          .sort()
          .join());

  async function saveDetails() {
    if (!task) return;
    if (!title.trim()) {
      setFormError("Enter a clear task title.");
      return;
    }
    if (assigneeIds.length === 0) {
      setFormError("Select at least one assignee.");
      return;
    }
    if (startDate && dueDate && dueDate < startDate) {
      setFormError("Due date cannot be before the start date.");
      return;
    }
    setFormError("");
    await onSave(task, {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      startDate: startDate || null,
      dueDate: dueDate || null,
      stageId: stageId || undefined,
      assigneeEmployeeIds: assigneeIds,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100dvh-1rem)] max-h-none content-start overflow-y-auto sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-4xl">
        {loading && !task ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading task…</div>
        ) : !task ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Task not available.</div>
        ) : (
          <>
            <DialogHeader>
              <div className="space-y-3 pr-9">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={PRIORITY_STYLES[priority]}>
                    {PRIORITY_LABELS[priority]}
                  </Badge>
                  <Badge variant="outline">
                    {board?.stages.find((stage) => stage.id === stageId)?.name ??
                      task.stage?.name ??
                      STATUS_LABELS[task.status]}
                  </Badge>
                  {task.boardName && <Badge variant="secondary">{task.boardName}</Badge>}
                </div>
                <DialogTitle className="sr-only">{task.title}</DialogTitle>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-auto border-0 bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0 sm:text-2xl"
                  placeholder="Task title"
                />
              </div>
            </DialogHeader>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-6">
                <section className="space-y-2">
                  <Label htmlFor="task-description">Description</Label>
                  <Textarea
                    id="task-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Add context, links, or acceptance criteria"
                    rows={5}
                    className="min-h-[120px] resize-y"
                  />
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4" />
                    <h3 className="text-sm font-semibold">Activity</h3>
                    <Badge variant="secondary" className="rounded-full">
                      {task.updates?.length ?? task.updateCount ?? 0}
                    </Badge>
                  </div>
                  <div className="space-y-0 divide-y rounded-lg border">
                    {(task.updates ?? []).length === 0 ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground">No activity yet.</p>
                    ) : (
                      (task.updates ?? []).map((entry) => (
                        <div key={entry.id} className="px-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">
                              {entry.authorName}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                {ACTIVITY_LABELS[entry.activityType] ?? entry.activityType}
                              </span>
                            </p>
                            <time className="text-xs text-muted-foreground">
                              {format(new Date(entry.createdAt), "d MMM yyyy, h:mm a")}
                            </time>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                            {entry.message}
                          </p>
                        </div>
                      ))
                    )}
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

              <aside className="space-y-5 rounded-xl border bg-muted/20 p-4">
                {board && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Stage
                    </p>
                    <Select
                      value={stageId}
                      onValueChange={(value) => {
                        setStageId(value);
                        if (value !== task.stageId) void onMove(task, value);
                      }}
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
                                  STAGE_COLORS[stage.color]?.dot ?? "bg-slate-500",
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

                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={priority}
                    onValueChange={(value) => setPriority(value as TaskPriority)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((value) => (
                        <SelectItem key={value} value={value}>
                          {PRIORITY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <UserRound className="h-3.5 w-3.5" />
                    Assignees
                  </p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={assigneeQuery}
                      onChange={(event) => setAssigneeQuery(event.target.value)}
                      placeholder="Search people"
                      className="pl-8"
                    />
                  </div>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-background p-1">
                    {availableAssignees.map((person) => {
                      const selected = assigneeIds.includes(person.id);
                      return (
                        <button
                          key={person.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                            selected && "bg-primary/5",
                          )}
                          onClick={() =>
                            setAssigneeIds((current) =>
                              selected
                                ? current.filter((id) => id !== person.id)
                                : [...current, person.id],
                            )
                          }
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                            {initials(person.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{person.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {person.designation || person.employeeCode}
                            </span>
                          </span>
                          {selected && <span className="text-xs text-primary">Selected</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Schedule
                  </p>
                  <div className="grid gap-2">
                    <div>
                      <Label htmlFor="task-start" className="text-xs text-muted-foreground">
                        Start
                      </Label>
                      <Input
                        id="task-start"
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="task-due" className="text-xs text-muted-foreground">
                        Due
                      </Label>
                      <Input
                        id="task-due"
                        type="date"
                        value={dueDate}
                        onChange={(event) => setDueDate(event.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {dueLabel(dueDate || undefined, task.status === "COMPLETED")}
                  </p>
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

                {formError && <p className="text-sm text-destructive">{formError}</p>}

                <Button
                  className="w-full"
                  disabled={saving || !dirty}
                  onClick={() => void saveDetails()}
                >
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </aside>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
