import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { TaskAssignee, TaskBoard, TaskPriority } from "@/types/domain";
import { initials, PRIORITY_LABELS, STAGE_COLORS } from "./task-utils";

export type TaskFormValue = {
  title: string;
  description: string;
  assigneeEmployeeIds: string[];
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
    setForm(emptyTask(defaultStageId || board?.stages[0]?.id || ""));
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
      setError("Enter a clear task title.");
      return;
    }
    if (form.assigneeEmployeeIds.length === 0) {
      setError("Select at least one assignee.");
      return;
    }
    if (!form.stageId) {
      setError("Select a starting stage.");
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
          <DialogTitle>New task</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Add work to <span className="font-medium text-foreground">{board.name}</span>.
          </p>
        </DialogHeader>
        <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="space-y-2">
            <Label htmlFor="new-task-title">
              Task title <span className="text-destructive">*</span>
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
              <Label>Starting stage</Label>
              <Select
                value={form.stageId}
                onValueChange={(stageId) => setForm({ ...form, stageId })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {board.stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn("h-2.5 w-2.5 rounded-full", STAGE_COLORS[stage.color].dot)}
                        />
                        {stage.name}
                      </span>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-task-start">Start date</Label>
              <Input
                id="new-task-start"
                type="date"
                value={form.startDate}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-task-due">Due date</Label>
              <Input
                id="new-task-due"
                type="date"
                min={form.startDate || undefined}
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Assignees</Label>
              <span className="text-xs text-muted-foreground">
                {form.assigneeEmployeeIds.length} selected
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search employees"
                className="pl-9"
              />
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border p-2">
              {availableAssignees.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No employees are available under this board’s access rules.
                </p>
              ) : (
                availableAssignees.map((person) => {
                  const selected = form.assigneeEmployeeIds.includes(person.id);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          assigneeEmployeeIds: selected
                            ? form.assigneeEmployeeIds.filter((id) => id !== person.id)
                            : [...form.assigneeEmployeeIds, person.id],
                        })
                      }
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                        selected ? "bg-red-50 text-red-950" : "hover:bg-muted",
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold">
                        {initials(person.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{person.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {person.designation || person.employeeCode}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded border",
                          selected && "border-red-600 bg-red-600 text-white",
                        )}
                      >
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

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
          <Button
            disabled={saving}
            onClick={() => void submit()}
            className="bg-red-600 hover:bg-red-700"
          >
            {saving ? "Creating..." : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
