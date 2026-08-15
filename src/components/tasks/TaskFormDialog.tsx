import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { TaskAssignee, TaskBoard, TaskIssueType, TaskPriority } from "@/types/domain";
import { PeopleMultiSelect } from "./PeopleMultiSelect";
import { ISSUE_TYPE_LABELS, PRIORITY_LABELS, STAGE_COLORS } from "./task-utils";

export type TaskFormValue = {
  title: string;
  description: string;
  assigneeEmployeeIds: string[];
  issueType: TaskIssueType;
  priority: TaskPriority;
  startDate: string;
  dueDate: string;
  stageId: string;
};

type TaskFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board: TaskBoard | null;
  assignees: TaskAssignee[];
  defaultStageId?: string;
  saving: boolean;
  onCreate: (form: TaskFormValue) => Promise<void>;
};

function emptyTask(stageId = ""): TaskFormValue {
  return {
    title: "",
    description: "",
    assigneeEmployeeIds: [],
    issueType: "TASK",
    priority: "MEDIUM",
    startDate: "",
    dueDate: "",
    stageId,
  };
}

export function TaskFormDialog({
  open,
  onOpenChange,
  board,
  assignees,
  defaultStageId,
  saving,
  onCreate,
}: TaskFormDialogProps) {
  const [form, setForm] = useState<TaskFormValue>(emptyTask());
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const startStageId =
      defaultStageId ||
      board?.stages.find((stage) => stage.status === "TODO")?.id ||
      board?.stages[0]?.id ||
      "";
    setForm(emptyTask(startStageId));
    setQuery("");
    setError("");
  }, [board, defaultStageId, open]);

  const availableAssignees = useMemo(() => {
    const allowed = assignees.filter((person) => {
      if (!board) return false;
      if (board.accessType === "MEMBER_GATED") return board.memberEmployeeIds.includes(person.id);
      if (board.accessType === "ROLE_GATED") {
        return !!person.role && board.allowedRoles.includes(person.role);
      }
      return true;
    });
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allowed;
    return allowed.filter((person) =>
      [person.name, person.employeeCode, person.designation, person.department]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [assignees, board, query]);

  async function submit() {
    if (!form.title.trim()) {
      setError("Enter a clear issue summary.");
      return;
    }
    if (form.assigneeEmployeeIds.length === 0) {
      setError("Select at least one assignee.");
      return;
    }
    if (!form.stageId) {
      setError("Select a starting status.");
      return;
    }
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) {
      setError("Due date cannot be before the start date.");
      return;
    }
    setError("");
    await onCreate({ ...form, title: form.title.trim(), description: form.description.trim() });
  }

  if (!board) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-5 sm:px-7">
          <DialogTitle>Create issue</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Add work to <span className="font-medium text-foreground">{board.name}</span>.
          </p>
        </DialogHeader>
        <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="space-y-2">
            <Label htmlFor="new-task-title">
              Summary <span className="text-destructive">*</span>
            </Label>
            <Input
              id="new-task-title"
              autoFocus
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="What needs to be done?"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-task-description">Description</Label>
            <Textarea
              id="new-task-description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Add context or a clear definition of done"
              rows={3}
              maxLength={5000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Issue type</Label>
              <Select
                value={form.issueType}
                onValueChange={(issueType) =>
                  setForm({ ...form, issueType: issueType as TaskIssueType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ISSUE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(priority) =>
                  setForm({ ...form, priority: priority as TaskPriority })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.stageId}
                onValueChange={(stageId) => setForm({ ...form, stageId })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {board.stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            (STAGE_COLORS[stage.color] ?? STAGE_COLORS.SLATE).dot,
                          )}
                        />
                        {stage.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-task-start">Start date</Label>
              <DateField
                id="new-task-start"
                value={form.startDate}
                onChange={(next) => setForm({ ...form, startDate: next })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-task-due">Due date</Label>
              <DateField
                id="new-task-due"
                min={form.startDate || undefined}
                value={form.dueDate}
                onChange={(next) => setForm({ ...form, dueDate: next })}
              />
            </div>
          </div>

          <PeopleMultiSelect
            label="Assignees"
            people={availableAssignees}
            selectedIds={form.assigneeEmployeeIds}
            onChange={(assigneeEmployeeIds) => setForm({ ...form, assigneeEmployeeIds })}
            query={query}
            onQueryChange={setQuery}
            searchPlaceholder="Search employees"
            emptyLabel="No employees are available under this board’s access rules."
          />

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
        <DialogFooter className="border-t bg-background px-5 py-4 sm:px-7">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
