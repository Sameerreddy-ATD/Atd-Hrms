import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import type { Department, TaskAssignee, TaskBoard, TaskStage, TaskStatus } from "@/types/domain";
import { formatDepartmentPath } from "@/lib/department-label";
import { PeopleMultiSelect } from "./PeopleMultiSelect";
import {
  boardKeyPrefix,
  boardToForm,
  DEFAULT_BOARD_FORM,
  STAGE_COLORS,
  STATUS_LABELS,
  type BoardForm,
} from "./task-utils";

type BoardFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board?: TaskBoard | null;
  assignees: TaskAssignee[];
  departments: Department[];
  saving: boolean;
  onSave: (form: BoardForm) => Promise<void>;
};

const COLOR_OPTIONS = Object.keys(STAGE_COLORS) as TaskStage["color"][];

/** Statuses a board column can use (Cancelled is issue-only, not a column). */
const STAGE_STATUS_OPTIONS: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "BLOCKED",
  "COMPLETED",
];

function emptyBoardForm(): BoardForm {
  return {
    ...DEFAULT_BOARD_FORM,
    stages: DEFAULT_BOARD_FORM.stages.map((stage) => ({ ...stage })),
  };
}

/** Exactly one starting TODO (first) and one COMPLETED stage. */
function normalizeStageStatuses(stages: BoardForm["stages"]): BoardForm["stages"] {
  let next = stages.map((stage) => ({ ...stage }));
  if (next.length === 0) return next;

  if (!next.some((stage) => stage.status === "TODO")) {
    const startIndex = next.findIndex((stage) => stage.status !== "COMPLETED");
    const index = startIndex >= 0 ? startIndex : 0;
    next = next.map((stage, position) =>
      position === index
        ? { ...stage, status: "TODO" }
        : stage.status === "TODO"
          ? { ...stage, status: "IN_PROGRESS" }
          : stage,
    );
  } else {
    let seenTodo = false;
    next = next.map((stage) => {
      if (stage.status !== "TODO") return stage;
      if (seenTodo) return { ...stage, status: "IN_PROGRESS" };
      seenTodo = true;
      return stage;
    });
  }

  if (!next.some((stage) => stage.status === "COMPLETED")) {
    const doneIndex = [...next]
      .map((stage, index) => ({ stage, index }))
      .reverse()
      .find(({ stage }) => stage.status !== "TODO")?.index;
    if (doneIndex != null) {
      next = next.map((stage, position) =>
        position === doneIndex ? { ...stage, status: "COMPLETED" } : stage,
      );
    }
  } else {
    let seenDone = false;
    next = next.map((stage) => {
      if (stage.status !== "COMPLETED") return stage;
      if (seenDone) return { ...stage, status: "IN_PROGRESS" };
      seenDone = true;
      return stage;
    });
  }

  // Entry column must stay first — backend creates new issues in stages[0]/TODO.
  const todoIndex = next.findIndex((stage) => stage.status === "TODO");
  if (todoIndex > 0) {
    const [todoStage] = next.splice(todoIndex, 1);
    next.unshift(todoStage);
  }

  return next;
}

export function BoardFormDialog({
  open,
  onOpenChange,
  board,
  assignees,
  departments,
  saving,
  onSave,
}: BoardFormDialogProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<BoardForm>(emptyBoardForm);
  const [memberQuery, setMemberQuery] = useState("");
  const [departmentQuery, setDepartmentQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const next = board ? boardToForm(board) : emptyBoardForm();
    setForm({ ...next, stages: normalizeStageStatuses(next.stages) });
    setMemberQuery("");
    setDepartmentQuery("");
    setError("");
  }, [board, open]);

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return assignees;
    return assignees.filter((person) =>
      [person.name, person.employeeCode, person.designation, person.department]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [assignees, memberQuery]);

  const departmentOptions = useMemo(
    () =>
      [...departments].sort((left, right) =>
        formatDepartmentPath(left, departments).localeCompare(
          formatDepartmentPath(right, departments),
        ),
      ),
    [departments],
  );

  const filteredDepartments = useMemo(() => {
    const query = departmentQuery.trim().toLowerCase();
    if (!query) return departmentOptions;
    return departmentOptions.filter((department) =>
      formatDepartmentPath(department, departments).toLowerCase().includes(query),
    );
  }, [departmentOptions, departmentQuery, departments]);

  function updateStage(index: number, patch: Partial<BoardForm["stages"][number]>) {
    setForm((current) => ({
      ...current,
      stages: current.stages.map((stage, position) =>
        position === index ? { ...stage, ...patch } : stage,
      ),
    }));
  }

  function moveStage(index: number, direction: -1 | 1) {
    setForm((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.stages.length) return current;
      // Keep the To do stage pinned at the top.
      if (current.stages[index]?.status === "TODO" && direction === 1) return current;
      if (current.stages[target]?.status === "TODO" && direction === -1) return current;
      const stages = [...current.stages];
      [stages[index], stages[target]] = [stages[target], stages[index]];
      return { ...current, stages: normalizeStageStatuses(stages) };
    });
  }

  function setStageStatus(index: number, status: TaskStatus) {
    setForm((current) => {
      if (status === "CANCELLED") return current;
      const stages = current.stages.map((stage, position) => {
        if (position === index) return { ...stage, status };
        // Exactly one Start and one Done.
        if (status === "TODO" && stage.status === "TODO") {
          return { ...stage, status: "IN_PROGRESS" as const };
        }
        if (status === "COMPLETED" && stage.status === "COMPLETED") {
          return { ...stage, status: "IN_PROGRESS" as const };
        }
        return stage;
      });
      return { ...current, stages: normalizeStageStatuses(stages) };
    });
  }

  function removeStage(index: number) {
    setForm((current) => {
      if (current.stages.length <= 2) return current;
      const stages = current.stages.filter((_, position) => position !== index);
      return { ...current, stages: normalizeStageStatuses(stages) };
    });
  }

  function validate() {
    if (form.name.trim().length < 2) return "Enter a project name.";
    if (!form.keyPrefix.trim() || form.keyPrefix.trim().length < 2) {
      return "Enter a project key (e.g. OPS).";
    }
    if (!/^[A-Z][A-Z0-9]{1,7}$/i.test(form.keyPrefix.trim())) {
      return "Project key must be 2–8 letters/numbers (e.g. OPS).";
    }
    if (form.stages.length < 2) return "Add at least two stages.";
    if (form.stages.some((stage) => stage.name.trim().length < 2)) {
      return "Every stage needs a clear name.";
    }
    if (
      new Set(form.stages.map((stage) => stage.name.trim().toLowerCase())).size !==
      form.stages.length
    ) {
      return "Stage names must be unique.";
    }
    if (!form.stages.some((stage) => stage.status === "TODO")) {
      return "Keep one stage as the starting To do stage.";
    }
    if (!form.stages.some((stage) => stage.status === "COMPLETED")) {
      return "Mark one stage as Done.";
    }
    if (form.accessType === "DEPARTMENT_GATED" && form.allowedDepartmentIds.length === 0) {
      return "Select at least one organization unit.";
    }
    if (form.accessType === "MEMBER_GATED" && form.memberEmployeeIds.length === 0) {
      return "Select at least one member.";
    }
    return "";
  }

  async function submit() {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setError("");
    await onSave({
      ...form,
      name: form.name.trim(),
      keyPrefix: form.keyPrefix.trim().toUpperCase(),
      description: form.description.trim(),
      stages: form.stages.map((stage) => ({ ...stage, name: stage.name.trim() })),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[720px]">
        <DialogHeader className="border-b px-5 py-5 sm:px-7">
          <DialogTitle>
            {board ? t("pages.tasks.projectSettings") : t("pages.tasks.createProject")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Define the workflow and exactly who can access it.
          </p>
        </DialogHeader>

        <div className="space-y-7 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <div className="space-y-2">
              <Label htmlFor="board-name">
                Project name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="board-name"
                autoFocus
                value={form.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setForm((current) => ({
                    ...current,
                    name,
                    keyPrefix:
                      current.keyPrefix && board
                        ? current.keyPrefix
                        : boardKeyPrefix(name) || current.keyPrefix,
                  }));
                }}
                placeholder="e.g. Operations"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="board-key">
                Key <span className="text-destructive">*</span>
              </Label>
              <Input
                id="board-key"
                value={form.keyPrefix}
                onChange={(event) =>
                  setForm({
                    ...form,
                    keyPrefix: event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 8),
                  })
                }
                placeholder="OPS"
                maxLength={8}
                className="font-mono uppercase"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Issues will be numbered like {form.keyPrefix || "OPS"}-1, {form.keyPrefix || "OPS"}-2.
          </p>

          <div className="space-y-2">
            <Label htmlFor="board-description">Description</Label>
            <Textarea
              id="board-description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="What does this project coordinate?"
              rows={2}
              maxLength={1000}
            />
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Stages</Label>
              <span className="text-xs text-muted-foreground">
                {form.stages.length} stages · pick a type for each
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              One stage must be <span className="font-medium text-foreground">To do</span> (start)
              and one must be <span className="font-medium text-foreground">Completed</span> (done).
              Middle stages can be In progress, In review, or Blocked.
            </p>
            <div className="space-y-2">
              {form.stages.map((stage, index) => {
                const color = STAGE_COLORS[stage.color] ?? STAGE_COLORS.SLATE;
                return (
                  <div
                    key={stage.id ?? `new-${index}`}
                    className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 rounded-xl border bg-muted/25 p-2 sm:grid-cols-[auto_auto_minmax(0,1fr)_9.5rem_auto]"
                  >
                    <GripVertical className="hidden h-4 w-4 text-muted-foreground sm:block" />
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 items-center gap-2">
                      <Select
                        value={stage.color}
                        onValueChange={(value) =>
                          updateStage(index, { color: value as TaskStage["color"] })
                        }
                      >
                        <SelectTrigger
                          aria-label={`Color for ${stage.name}`}
                          className="h-9 w-10 shrink-0 border-0 px-2 shadow-none"
                        >
                          <span className={cn("h-5 w-5 rounded-full", color.soft)}>
                            <span className={cn("m-1.5 block h-2 w-2 rounded-full", color.dot)} />
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {COLOR_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              <span className="flex items-center gap-2">
                                <span
                                  className={cn("h-3 w-3 rounded-full", STAGE_COLORS[option].dot)}
                                />
                                {option[0] + option.slice(1).toLowerCase()}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        aria-label={`Stage ${index + 1} name`}
                        value={stage.name}
                        onChange={(event) => updateStage(index, { name: event.target.value })}
                        maxLength={80}
                        className="h-9 min-w-0 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                      />
                    </div>
                    <Select
                      value={stage.status}
                      onValueChange={(value) => setStageStatus(index, value as TaskStatus)}
                    >
                      <SelectTrigger
                        aria-label={`Status for ${stage.name}`}
                        className="h-9 w-full text-xs sm:text-sm"
                      >
                        <SelectValue>{STATUS_LABELS[stage.status]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="col-span-3 flex justify-end sm:col-span-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${stage.name} up`}
                        disabled={index === 0 || stage.status === "TODO"}
                        onClick={() => moveStage(index, -1)}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${stage.name} down`}
                        disabled={index === form.stages.length - 1 || stage.status === "TODO"}
                        onClick={() => moveStage(index, 1)}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${stage.name}`}
                        disabled={form.stages.length <= 2}
                        onClick={() => removeStage(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed"
              disabled={form.stages.length >= 12}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  stages: [
                    ...current.stages,
                    { name: "New stage", color: "VIOLET", status: "IN_PROGRESS" },
                  ],
                }))
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Add custom stage
            </Button>
          </section>

          <section className="space-y-3">
            <Label>Access</Label>
            <div className="grid grid-cols-3 rounded-xl border bg-muted/30 p-1">
              {[
                ["OPEN", "Open"],
                ["DEPARTMENT_GATED", "Unit-gated"],
                ["MEMBER_GATED", "Member-gated"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      accessType: value as TaskBoard["accessType"],
                      allowedDepartmentIds:
                        value === "DEPARTMENT_GATED" ? form.allowedDepartmentIds : [],
                      memberEmployeeIds: value === "MEMBER_GATED" ? form.memberEmployeeIds : [],
                    })
                  }
                  className={cn(
                    "rounded-lg px-2 py-2 text-xs font-medium transition sm:text-sm",
                    form.accessType === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {form.accessType === "OPEN" && (
              <p className="text-sm text-muted-foreground">
                Everyone with Work Planner access can view and contribute to this board.
              </p>
            )}

            {form.accessType === "DEPARTMENT_GATED" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Only people in the selected organization units can open this board.
                </p>
                <Input
                  value={departmentQuery}
                  onChange={(event) => setDepartmentQuery(event.target.value)}
                  placeholder="Search organization units"
                />
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                  {filteredDepartments.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">No units found.</p>
                  ) : (
                    filteredDepartments.map((department) => {
                      const selected = form.allowedDepartmentIds.includes(department.id);
                      const label = formatDepartmentPath(department, departments);
                      return (
                        <button
                          key={department.id}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              allowedDepartmentIds: selected
                                ? form.allowedDepartmentIds.filter((id) => id !== department.id)
                                : [...form.allowedDepartmentIds, department.id],
                            })
                          }
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                            selected
                              ? "bg-primary/10 text-foreground"
                              : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span className="truncate">{label}</span>
                          {selected ? <span className="text-xs font-medium">Selected</span> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {form.accessType === "MEMBER_GATED" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Only checked employees can open this board. Tick everyone who should have access.
                </p>
                <PeopleMultiSelect
                  label="Board members"
                  people={filteredMembers}
                  selectedIds={form.memberEmployeeIds}
                  onChange={(memberEmployeeIds) => setForm({ ...form, memberEmployeeIds })}
                  query={memberQuery}
                  onQueryChange={setMemberQuery}
                  searchPlaceholder="Search employees to include"
                  emptyLabel="No employees found."
                  listClassName="max-h-52"
                />
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Custom fields</Label>
                <p className="text-xs text-muted-foreground">
                  Optional text, number, or select fields on tasks.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    customFieldDefs: [
                      ...current.customFieldDefs,
                      {
                        key: `field_${current.customFieldDefs.length + 1}`,
                        label: "New field",
                        type: "text",
                      },
                    ],
                  }))
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add field
              </Button>
            </div>
            {form.customFieldDefs.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                No custom fields yet.
              </p>
            ) : (
              <div className="space-y-2">
                {form.customFieldDefs.map((field, index) => (
                  <div
                    key={`${field.key}-${index}`}
                    className="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_auto]"
                  >
                    <Input
                      aria-label="Field key"
                      value={field.key}
                      placeholder="key"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          customFieldDefs: current.customFieldDefs.map((entry, position) =>
                            position === index ? { ...entry, key: event.target.value } : entry,
                          ),
                        }))
                      }
                    />
                    <Input
                      aria-label="Field label"
                      value={field.label}
                      placeholder="Label"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          customFieldDefs: current.customFieldDefs.map((entry, position) =>
                            position === index ? { ...entry, label: event.target.value } : entry,
                          ),
                        }))
                      }
                    />
                    <Select
                      value={field.type}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          customFieldDefs: current.customFieldDefs.map((entry, position) =>
                            position === index
                              ? { ...entry, type: value as "text" | "number" | "select" }
                              : entry,
                          ),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <span className="capitalize">{field.type}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="select">Select</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove field"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          customFieldDefs: current.customFieldDefs.filter(
                            (_entry, position) => position !== index,
                          ),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="border-t bg-background px-5 py-4 sm:px-7">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="bg-red-600 hover:bg-red-700"
          >
            {saving
              ? t("pages.tasks.saving")
              : board
                ? t("pages.tasks.saveChanges")
                : t("pages.tasks.createBoard")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
