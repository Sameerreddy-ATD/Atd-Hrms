import {
  CalendarDays,
  ListTree,
  MessageSquareText,
  Paperclip,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatDisplayDateTime } from "@/lib/india-date";
import { cn } from "@/lib/utils";
import { tasksApi, sprintsApi } from "@/services/api";
import type {
  TaskAssignee,
  TaskBoard,
  TaskIssueType,
  TaskPriority,
  TaskSprint,
  WorkTask,
} from "@/types/domain";
import { PeopleMultiSelect } from "./PeopleMultiSelect";
import {
  dueLabel,
  ISSUE_TYPE_LABELS,
  issueKey,
  PRIORITY_LABELS,
  PRIORITY_MARK,
  PRIORITY_STYLES,
  STATUS_LABELS,
} from "./task-utils";

type TaskDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: WorkTask | null;
  board: TaskBoard | null;
  boards?: TaskBoard[];
  assignees: TaskAssignee[];
  loading?: boolean;
  saving: boolean;
  onSave: (
    task: WorkTask,
    patch: {
      title: string;
      description: string | null;
      issueType: TaskIssueType;
      priority: TaskPriority;
      startDate: string | null;
      dueDate: string | null;
      stageId?: string;
      boardId?: string;
      assigneeEmployeeIds: string[];
      customFields?: Record<string, string | number | boolean | null>;
    },
  ) => Promise<void>;
  onArchive?: (task: WorkTask, archived: boolean) => Promise<void>;
  /** Legacy board column move — kept for callers; detail status uses onTransition. */
  onMove?: (task: WorkTask, stageId: string) => Promise<void>;
  onTransition?: (
    task: WorkTask,
    payload: { transitionId: string; comment?: string },
  ) => Promise<void>;
  onTaskUpdated?: (task: WorkTask) => void;
  onAddUpdate: (task: WorkTask, message: string, progress: number) => Promise<void>;
  onCreateSubtask?: (parent: WorkTask, title: string) => Promise<unknown>;
  onOpenTask?: (task: WorkTask) => void;
  canManageSprint?: boolean;
  onSprintChanged?: (task: WorkTask) => void;
};

const ACTIVITY_LABELS: Record<string, string> = {
  CREATED: "Created",
  COMMENT: "Comment",
  STATUS_CHANGED: "Status changed",
  PROGRESS_UPDATED: "Progress updated",
  ASSIGNEES_CHANGED: "Assignees updated",
  SPRINT_MEMBERSHIP_CHANGED: "Sprint updated",
};

export function TaskDetailDialog({
  open,
  onOpenChange,
  task,
  board,
  boards = [],
  assignees,
  loading = false,
  saving,
  onSave,
  onArchive,
  onTransition,
  onTaskUpdated,
  onAddUpdate,
  onCreateSubtask,
  onOpenTask,
  canManageSprint = false,
  onSprintChanged,
}: TaskDetailDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [issueType, setIssueType] = useState<TaskIssueType>("TASK");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [stageId, setStageId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [formError, setFormError] = useState("");
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [subtasks, setSubtasks] = useState<WorkTask[]>([]);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [attachments, setAttachments] = useState<
    Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string }>
  >([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [pendingCommentTransitionId, setPendingCommentTransitionId] = useState<string | null>(null);
  const [transitionComment, setTransitionComment] = useState("");
  const [sprintOptions, setSprintOptions] = useState<TaskSprint[]>([]);
  const [sprintBusy, setSprintBusy] = useState(false);

  const sprintEligible =
    issueType === "STORY" ||
    issueType === "TASK" ||
    issueType === "BUG" ||
    issueType === "IMPROVEMENT";

  useEffect(() => {
    if (!open || !task?.boardId) {
      setSprintOptions([]);
      return;
    }
    void sprintsApi
      .list(task.boardId)
      .then(({ sprints }) =>
        setSprintOptions(
          sprints.filter((entry) => entry.status === "PLANNED" || entry.status === "ACTIVE"),
        ),
      )
      .catch(() => setSprintOptions([]));
  }, [open, task?.boardId, task?.sprint?.sprintId]);

  useEffect(() => {
    if (!open || !task) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setIssueType(task.issueType ?? "TASK");
    setStartDate(task.startDate ?? "");
    setDueDate(task.dueDate ?? "");
    setStageId(task.stageId ?? "");
    setBoardId(task.boardId ?? "");
    setAssigneeIds(task.assignees.map((person) => person.id));
    setAssigneeQuery("");
    setMessage("");
    setProgress(task.progress);
    setFormError("");
    setSubtaskTitle("");
    setPendingCommentTransitionId(null);
    setTransitionComment("");
    const nextFields: Record<string, string> = {};
    const fieldBoard = boards.find((entry) => entry.id === (task.boardId ?? "")) ?? board;
    for (const def of fieldBoard?.customFieldDefs ?? []) {
      const value = task.customFields?.[def.key];
      nextFields[def.key] = value == null ? "" : String(value);
    }
    setCustomFields(nextFields);
  }, [board, boards, open, task]);

  async function applySprintMembership(sprintId: string | null) {
    if (!task || !canManageSprint) return;
    setSprintBusy(true);
    try {
      const updated = await tasksApi.setSprintMembership(task.id, { sprintId });
      onSprintChanged?.(updated);
      onTaskUpdated?.(updated);
    } finally {
      setSprintBusy(false);
    }
  }

  useEffect(() => {
    if (!open || !task) {
      setSubtasks([]);
      setAttachments([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [childRows, files] = await Promise.all([
          tasksApi.list("team", {
            parentTaskId: task.id,
            boardId: task.boardId,
            limit: 100,
            detail: "summary",
          }),
          tasksApi.listAttachments(task.id).catch(() => []),
        ]);
        if (!cancelled) {
          setSubtasks(childRows);
          setAttachments(files);
        }
      } catch {
        if (!cancelled) {
          setSubtasks([]);
          setAttachments([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, task]);

  const activeBoard = useMemo(
    () => boards.find((entry) => entry.id === boardId) ?? board,
    [board, boardId, boards],
  );

  const availableAssignees = useMemo(() => {
    const allowed = assignees.filter((person) => {
      if (!activeBoard) return true;
      if (activeBoard.accessType === "MEMBER_GATED") {
        return activeBoard.memberEmployeeIds.includes(person.id);
      }
      if (activeBoard.accessType === "DEPARTMENT_GATED") {
        return (
          !!person.departmentId &&
          activeBoard.allowedDepartmentIds.includes(person.departmentId)
        );
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
  }, [activeBoard, assigneeIds, assigneeQuery, assignees]);

  const dirty =
    !!task &&
    (title.trim() !== task.title ||
      description.trim() !== (task.description ?? "") ||
      priority !== task.priority ||
      issueType !== (task.issueType ?? "TASK") ||
      (startDate || null) !== (task.startDate ?? null) ||
      (dueDate || null) !== (task.dueDate ?? null) ||
      (stageId || "") !== (task.stageId ?? "") ||
      (boardId || "") !== (task.boardId ?? "") ||
      assigneeIds.slice().sort().join() !==
        task.assignees
          .map((person) => person.id)
          .slice()
          .sort()
          .join() ||
      (activeBoard?.customFieldDefs ?? []).some((def) => {
        const previous = task.customFields?.[def.key];
        const next = customFields[def.key] ?? "";
        return String(previous ?? "") !== next;
      }));

  const availableTransitions = task?.availableTransitions ?? [];
  const currentStatusLabel =
    task?.workflowStatus?.name ??
    activeBoard?.stages.find((stage) => stage.id === (task?.stageId ?? stageId))?.name ??
    task?.stage?.name ??
    (task ? STATUS_LABELS[task.status] : "Status");

  async function applyTransition(transitionId: string, comment?: string) {
    if (!task) return;
    setTransitionBusy(true);
    setFormError("");
    try {
      if (onTransition) {
        await onTransition(task, { transitionId, comment });
      } else {
        const updated = await tasksApi.transition(task.id, {
          version: task.version,
          transitionId,
          ...(comment?.trim() ? { comment: comment.trim() } : {}),
        });
        onTaskUpdated?.(updated);
      }
      setPendingCommentTransitionId(null);
      setTransitionComment("");
    } catch (cause) {
      setFormError((cause as Error).message || "Could not apply that transition.");
    } finally {
      setTransitionBusy(false);
    }
  }

  async function requestTransition(transitionId: string, commentRequired: boolean) {
    if (commentRequired) {
      setPendingCommentTransitionId(transitionId);
      setTransitionComment("");
      return;
    }
    await applyTransition(transitionId);
  }

  async function saveDetails() {
    if (!task) return;
    if (!title.trim()) {
      setFormError("Enter a clear issue summary.");
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
    const nextCustom: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(task.customFields ?? {})) {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      ) {
        nextCustom[key] = value;
      }
    }
    for (const def of activeBoard?.customFieldDefs ?? []) {
      const raw = customFields[def.key]?.trim() ?? "";
      if (!raw) {
        nextCustom[def.key] = null;
        continue;
      }
      nextCustom[def.key] = def.type === "number" ? Number(raw) : raw;
    }
    const boardChanged = Boolean(boardId && boardId !== (task.boardId ?? ""));
    await onSave(task, {
      title: title.trim(),
      description: description.trim() || null,
      issueType,
      priority,
      startDate: startDate || null,
      dueDate: dueDate || null,
      // Same-board stage changes go through transitions; avoid a second versioned write.
      ...(boardChanged ? { stageId: stageId || undefined, boardId } : {}),
      assigneeEmployeeIds: assigneeIds,
      customFields: nextCustom,
    });
  }

  async function uploadAttachment(file: File) {
    if (!task) return;
    setAttachmentBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      await tasksApi.addAttachment(task.id, {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        contentBase64: btoa(binary),
      });
      setAttachments(await tasksApi.listAttachments(task.id));
    } catch (cause) {
      setFormError((cause as Error).message || "Unable to upload attachment.");
    } finally {
      setAttachmentBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:w-[min(96vw,56rem)] sm:max-w-none"
      >
        {loading && !task ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading issue…</div>
        ) : !task ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Issue not available.
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-3 border-b px-4 py-4 pr-12 text-left sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-primary">
                  {issueKey(task, activeBoard)}
                </span>
                <Badge variant="outline" className={PRIORITY_STYLES[priority]}>
                  <span className={cn("mr-1 font-bold", PRIORITY_MARK[priority].className)}>
                    {PRIORITY_MARK[priority].glyph}
                  </span>
                  {PRIORITY_LABELS[priority]}
                </Badge>
                <Badge variant="outline">{currentStatusLabel}</Badge>
                {task.boardName && <Badge variant="secondary">{task.boardName}</Badge>}
                {task.parentTaskId && <Badge variant="outline">Subtask</Badge>}
              </div>
              <SheetTitle className="sr-only">{task.title}</SheetTitle>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-auto border-0 bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0 sm:text-2xl"
                placeholder="Issue summary"
              />
            </SheetHeader>

            <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-6 px-4 py-5 sm:px-6">
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

                {(activeBoard?.customFieldDefs?.length ?? 0) > 0 && (
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Custom fields</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {activeBoard!.customFieldDefs!.map((field) => (
                        <div key={field.key} className="space-y-1.5">
                          <Label htmlFor={`cf-${field.key}`}>{field.label}</Label>
                          <Input
                            id={`cf-${field.key}`}
                            type={field.type === "number" ? "number" : "text"}
                            value={customFields[field.key] ?? ""}
                            onChange={(event) =>
                              setCustomFields((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            placeholder={field.type === "select" ? "Enter a value" : undefined}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {!task.parentTaskId && (
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <ListTree className="h-4 w-4" />
                      <h3 className="text-sm font-semibold">Subtasks</h3>
                      <Badge variant="secondary" className="rounded-md font-normal">
                        {subtasks.length || task.subtaskCount || 0}
                      </Badge>
                    </div>
                    <div className="space-y-0 divide-y rounded-md border">
                      {subtasks.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-muted-foreground">No subtasks yet.</p>
                      ) : (
                        subtasks.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                            onClick={() => onOpenTask?.(child)}
                          >
                            <span className="min-w-0 truncate">
                              <span className="mr-2 font-mono text-xs text-primary">
                                {issueKey(child, activeBoard)}
                              </span>
                              <span className="font-medium">{child.title}</span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {STATUS_LABELS[child.status]} · {child.progress}%
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                    {onCreateSubtask && (
                      <div className="flex gap-2">
                        <Input
                          value={subtaskTitle}
                          onChange={(event) => setSubtaskTitle(event.target.value)}
                          placeholder="Add a subtask"
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && subtaskTitle.trim()) {
                              event.preventDefault();
                              void onCreateSubtask(task, subtaskTitle.trim()).then(() => {
                                setSubtaskTitle("");
                                void tasksApi
                                  .list("team", {
                                    parentTaskId: task.id,
                                    boardId: task.boardId,
                                    limit: 100,
                                    detail: "summary",
                                  })
                                  .then(setSubtasks)
                                  .catch(() => undefined);
                              });
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={saving || !subtaskTitle.trim()}
                          onClick={() =>
                            void onCreateSubtask(task, subtaskTitle.trim()).then(() => {
                              setSubtaskTitle("");
                              void tasksApi
                                .list("team", {
                                  parentTaskId: task.id,
                                  boardId: task.boardId,
                                  limit: 100,
                                  detail: "summary",
                                })
                                .then(setSubtasks)
                                .catch(() => undefined);
                            })
                          }
                        >
                          Add
                        </Button>
                      </div>
                    )}
                  </section>
                )}

                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    <h3 className="text-sm font-semibold">Attachments</h3>
                    <Badge variant="secondary" className="rounded-md font-normal">
                      {attachments.length}
                    </Badge>
                  </div>
                  <div className="space-y-0 divide-y rounded-md border">
                    {attachments.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground">No files attached.</p>
                    ) : (
                      attachments.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                        >
                          <span className="truncate font-medium">{file.fileName}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {Math.max(1, Math.round(file.sizeBytes / 1024))} KB
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <Input
                    type="file"
                    disabled={attachmentBusy || saving}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadAttachment(file);
                      event.target.value = "";
                    }}
                  />
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4" />
                    <h3 className="text-sm font-semibold">Activity</h3>
                    <Badge variant="secondary" className="rounded-md font-normal">
                      {task.updates?.length ?? task.updateCount ?? 0}
                    </Badge>
                  </div>
                  <div className="space-y-0 divide-y rounded-md border">
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
                              {formatDisplayDateTime(entry.createdAt)}
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
                  <h3 className="text-sm font-semibold">Add a comment</h3>
                  <Textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Share progress. Mention people with @employeeCode"
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
                      {saving ? "Saving..." : "Comment"}
                    </Button>
                  </div>
                </section>
              </div>

              <aside className="space-y-5 border-t bg-muted/20 px-4 py-5 lg:border-l lg:border-t-0 sm:px-5">
                {boards.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Project
                    </p>
                    <Select
                      value={boardId}
                      onValueChange={(value) => {
                        setBoardId(value);
                        const next = boards.find((entry) => entry.id === value);
                        const startStage =
                          next?.stages.find((stage) => stage.status === "TODO") ?? next?.stages[0];
                        setStageId(startStage?.id ?? "");
                        const nextFields: Record<string, string> = { ...customFields };
                        for (const def of next?.customFieldDefs ?? []) {
                          if (!(def.key in nextFields)) nextFields[def.key] = "";
                        }
                        setCustomFields(nextFields);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select project" />
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
                )}

                {activeBoard && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </p>
                    <div className="rounded-md border bg-background px-3 py-2 text-sm font-medium">
                      {currentStatusLabel}
                    </div>
                    {boardId === (task.boardId ?? "") ? (
                      <>
                        {availableTransitions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No transitions available.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {availableTransitions.map((transition) => (
                              <Button
                                key={transition.id}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-auto justify-start whitespace-normal py-2 text-left"
                                disabled={saving || transitionBusy}
                                onClick={() =>
                                  void requestTransition(transition.id, transition.commentRequired)
                                }
                              >
                                {transition.name}
                                <span className="ml-auto pl-2 text-xs font-normal text-muted-foreground">
                                  → {transition.toStatusName}
                                </span>
                              </Button>
                            ))}
                          </div>
                        )}
                        {pendingCommentTransitionId && (
                          <div className="space-y-2 rounded-md border border-dashed p-2">
                            <Label htmlFor="transition-comment" className="text-xs">
                              Comment required
                            </Label>
                            <Textarea
                              id="transition-comment"
                              value={transitionComment}
                              onChange={(event) => setTransitionComment(event.target.value)}
                              rows={2}
                              placeholder="Add a comment for this transition"
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={
                                  saving || transitionBusy || !transitionComment.trim()
                                }
                                onClick={() =>
                                  void applyTransition(
                                    pendingCommentTransitionId,
                                    transitionComment.trim(),
                                  )
                                }
                              >
                                {transitionBusy ? "Applying..." : "Apply"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={transitionBusy}
                                onClick={() => {
                                  setPendingCommentTransitionId(null);
                                  setTransitionComment("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Save the project change to move this issue onto the new board workflow.
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Issue type</Label>
                  <Select
                    value={issueType}
                    onValueChange={(value) => setIssueType(value as TaskIssueType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ISSUE_TYPE_LABELS) as TaskIssueType[]).map((value) => (
                        <SelectItem key={value} value={value}>
                          {ISSUE_TYPE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2" data-testid="work-item-sprint-field">
                  <Label>Sprint</Label>
                  {issueType === "EPIC" ? (
                    <p className="text-sm text-muted-foreground">Epics are not sprint-planned.</p>
                  ) : issueType === "SUBTASK" ? (
                    <p className="text-sm text-muted-foreground">
                      {task?.sprint
                        ? `${task.sprint.name} (${task.sprint.status}) — inherited from parent`
                        : "Backlog — inherited from parent"}
                    </p>
                  ) : sprintEligible ? (
                    canManageSprint ? (
                      <Select
                        value={task?.sprint?.sprintId ?? "backlog"}
                        disabled={sprintBusy || saving}
                        onValueChange={(value) =>
                          void applySprintMembership(value === "backlog" ? null : value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Backlog" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="backlog">Backlog</SelectItem>
                          {sprintOptions.map((entry) => (
                            <SelectItem key={entry.id} value={entry.id}>
                              {entry.name} ({entry.status})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm">
                        {task?.sprint
                          ? `${task.sprint.name} (${task.sprint.status})`
                          : "Backlog"}
                      </p>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">Not sprint-eligible.</p>
                  )}
                </div>

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
                          <span className="flex items-center gap-2">
                            <span className={cn("font-bold", PRIORITY_MARK[value].className)}>
                              {PRIORITY_MARK[value].glyph}
                            </span>
                            {PRIORITY_LABELS[value]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <PeopleMultiSelect
                  label="Assignees"
                  people={availableAssignees}
                  selectedIds={assigneeIds}
                  onChange={setAssigneeIds}
                  query={assigneeQuery}
                  onQueryChange={setAssigneeQuery}
                  searchPlaceholder="Search people"
                  emptyLabel="No people available on this board."
                  listClassName="max-h-40 rounded-md bg-background"
                />

                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Dates
                  </p>
                  <div className="grid gap-2">
                    <div>
                      <Label htmlFor="task-start" className="text-xs text-muted-foreground">
                        Start
                      </Label>
                      <DateField id="task-start" value={startDate} onChange={setStartDate} />
                    </div>
                    <div>
                      <Label htmlFor="task-due" className="text-xs text-muted-foreground">
                        Due
                      </Label>
                      <DateField
                        id="task-due"
                        value={dueDate}
                        min={startDate || undefined}
                        onChange={setDueDate}
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
                {onArchive && (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={saving}
                    onClick={() => void onArchive(task, !task.archivedAt)}
                  >
                    {task.archivedAt ? "Restore from archive" : "Archive issue"}
                  </Button>
                )}
              </aside>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
