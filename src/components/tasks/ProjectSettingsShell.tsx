import { ArrowLeft, Archive, Check, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { tasksApi } from "@/services/api";
import type {
  ProjectCapability,
  TaskAssignee,
  TaskBoard,
  TaskProjectRole,
  TaskStatusCategory,
  TaskWorkflow,
} from "@/types/domain";
import { ISSUE_TYPE_LABELS } from "./task-utils";

export type ProjectSettingsSection =
  | "details"
  | "members"
  | "work-types"
  | "fields"
  | "workflow"
  | "permissions"
  | "archive";

const SECTIONS: Array<{ id: ProjectSettingsSection; label: string }> = [
  { id: "details", label: "Details" },
  { id: "members", label: "Members" },
  { id: "work-types", label: "Work Types" },
  { id: "fields", label: "Fields" },
  { id: "workflow", label: "Workflow" },
  { id: "permissions", label: "Permissions" },
  { id: "archive", label: "Archive" },
];

const STATUS_CATEGORIES: TaskStatusCategory[] = ["TODO", "IN_PROGRESS", "DONE"];

const CATEGORY_LABELS: Record<TaskStatusCategory, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

const WORK_TYPES = ["EPIC", "STORY", "TASK", "BUG", "IMPROVEMENT", "SUBTASK"] as const;

const ROLE_OPTIONS: TaskProjectRole[] = [
  "PROJECT_ADMIN",
  "PROJECT_LEAD",
  "MEMBER",
  "VIEWER",
];

const CAPABILITY_LABELS: Array<{ key: ProjectCapability; label: string }> = [
  { key: "CREATE_WORK_ITEM", label: "Create Work Item" },
  { key: "EDIT_WORK_ITEM", label: "Edit Work Item" },
  { key: "ASSIGN_WORK_ITEM", label: "Assign" },
  { key: "TRANSITION_WORK_ITEM", label: "Transition" },
  { key: "MANAGE_PROJECT", label: "Manage Project" },
  { key: "ARCHIVE_PROJECT", label: "Archive" },
  { key: "VIEW_REPORTS", label: "View Reports" },
  { key: "VIEW_PROJECT", label: "View Project" },
];

const ROLE_CAPABILITIES: Record<TaskProjectRole, readonly ProjectCapability[]> = {
  PROJECT_ADMIN: [
    "VIEW_PROJECT",
    "CREATE_WORK_ITEM",
    "EDIT_WORK_ITEM",
    "ASSIGN_WORK_ITEM",
    "TRANSITION_WORK_ITEM",
    "MANAGE_PROJECT",
    "ARCHIVE_PROJECT",
    "VIEW_REPORTS",
  ],
  PROJECT_LEAD: [
    "VIEW_PROJECT",
    "CREATE_WORK_ITEM",
    "EDIT_WORK_ITEM",
    "ASSIGN_WORK_ITEM",
    "TRANSITION_WORK_ITEM",
    "ARCHIVE_PROJECT",
    "VIEW_REPORTS",
  ],
  MEMBER: [
    "VIEW_PROJECT",
    "CREATE_WORK_ITEM",
    "EDIT_WORK_ITEM",
    "ASSIGN_WORK_ITEM",
    "TRANSITION_WORK_ITEM",
  ],
  VIEWER: ["VIEW_PROJECT", "VIEW_REPORTS"],
};

type ProjectSettingsShellProps = {
  board: TaskBoard;
  assignees: TaskAssignee[];
  saving: boolean;
  canManage: boolean;
  canArchive: boolean;
  initialSection?: ProjectSettingsSection;
  onBack: () => void;
  onSaveDetails: (patch: {
    name: string;
    keyPrefix: string;
    description: string | null;
    leadEmployeeId: string | null;
    accessType: TaskBoard["accessType"];
  }) => Promise<void>;
  onSaveMembers: (members: Array<{ employeeId: string; role: TaskProjectRole }>) => Promise<void>;
  onArchive: (archived: boolean) => Promise<void>;
};

function roleLabel(role: TaskProjectRole) {
  return role.replace(/_/g, " ");
}

export function ProjectSettingsShell({
  board,
  assignees,
  saving,
  canManage,
  canArchive,
  initialSection = "details",
  onBack,
  onSaveDetails,
  onSaveMembers,
  onArchive,
}: ProjectSettingsShellProps) {
  const { t } = useTranslation();
  const [section, setSection] = useState<ProjectSettingsSection>(initialSection);
  const [name, setName] = useState(board.name);
  const [keyPrefix, setKeyPrefix] = useState(board.keyPrefix ?? "");
  const [description, setDescription] = useState(board.description ?? "");
  const [leadEmployeeId, setLeadEmployeeId] = useState(board.leadEmployeeId ?? "");
  const [accessType, setAccessType] = useState(board.accessType);
  const [memberRows, setMemberRows] = useState<Array<{ employeeId: string; role: TaskProjectRole }>>(
    () =>
      (board.members?.length
        ? board.members
        : board.memberEmployeeIds.map((employeeId) => ({
            employeeId,
            role: "MEMBER" as TaskProjectRole,
          }))
      ).map((row) => ({ employeeId: row.employeeId, role: row.role })),
  );
  const [archiveConfirm, setArchiveConfirm] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(true);
  const [workflows, setWorkflows] = useState<TaskWorkflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusCategory, setNewStatusCategory] = useState<TaskStatusCategory>("IN_PROGRESS");
  const [newTransitionName, setNewTransitionName] = useState("");
  const [newTransitionFrom, setNewTransitionFrom] = useState("");
  const [newTransitionTo, setNewTransitionTo] = useState("");
  const [newTransitionCommentRequired, setNewTransitionCommentRequired] = useState(false);

  useEffect(() => {
    setName(board.name);
    setKeyPrefix(board.keyPrefix ?? "");
    setDescription(board.description ?? "");
    setLeadEmployeeId(board.leadEmployeeId ?? "");
    setAccessType(board.accessType);
    setMemberRows(
      (board.members?.length
        ? board.members
        : board.memberEmployeeIds.map((employeeId) => ({
            employeeId,
            role: "MEMBER" as TaskProjectRole,
          }))
      ).map((row) => ({ employeeId: row.employeeId, role: row.role })),
    );
  }, [board]);

  useEffect(() => {
    if (section !== "workflow") return;
    let cancelled = false;
    void (async () => {
      setWorkflowsLoading(true);
      try {
        const result = await tasksApi.workflows(board.id);
        if (cancelled) return;
        setWorkflows(result.workflows);
        setSelectedWorkflowId((current) => {
          if (current && result.workflows.some((workflow) => workflow.id === current)) {
            return current;
          }
          return result.workflows[0]?.id ?? "";
        });
      } catch (cause) {
        if (!cancelled) {
          toast.error((cause as Error).message || "Could not load workflows.");
          setWorkflows([]);
        }
      } finally {
        if (!cancelled) setWorkflowsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [board.id, section]);

  const assigneeById = useMemo(
    () => new Map(assignees.map((person) => [person.id, person])),
    [assignees],
  );

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null,
    [selectedWorkflowId, workflows],
  );

  const statusNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const status of selectedWorkflow?.statuses ?? []) {
      map.set(status.id, status.name);
    }
    return map;
  }, [selectedWorkflow]);

  async function refreshWorkflows(preferId?: string) {
    const result = await tasksApi.workflows(board.id);
    setWorkflows(result.workflows);
    const nextId =
      (preferId && result.workflows.some((workflow) => workflow.id === preferId)
        ? preferId
        : undefined) ??
      selectedWorkflowId ??
      result.workflows[0]?.id ??
      "";
    setSelectedWorkflowId(
      result.workflows.some((workflow) => workflow.id === nextId)
        ? nextId
        : (result.workflows[0]?.id ?? ""),
    );
  }

  function selectSection(next: ProjectSettingsSection) {
    setSection(next);
    setMobileNavOpen(false);
  }

  return (
    <div
      className="mx-auto w-full max-w-[1200px] space-y-4 px-3 pb-20 sm:px-5"
      data-testid="project-settings-shell"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/80 pb-3 pt-1">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 h-8 px-2">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {board.name}
        </Button>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-base font-semibold">{t("pages.tasks.projectSettings")}</h1>
        {board.archived && (
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
            Archived
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        {/* Mobile section picker */}
        <div className="md:hidden">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            onClick={() => setMobileNavOpen((open) => !open)}
            data-testid="project-settings-mobile-nav"
          >
            {SECTIONS.find((entry) => entry.id === section)?.label ?? "Settings"}
            <span className="text-muted-foreground">{mobileNavOpen ? "Hide" : "Sections"}</span>
          </Button>
          {mobileNavOpen && (
            <nav className="mt-2 grid gap-1 rounded-lg border bg-card p-2" aria-label="Settings sections">
              {SECTIONS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => selectSection(entry.id)}
                  className={cn(
                    "rounded-md px-3 py-2 text-left text-sm",
                    section === entry.id ? "bg-muted font-medium" : "hover:bg-muted/60",
                  )}
                  data-testid={`settings-nav-${entry.id}`}
                >
                  {entry.label}
                </button>
              ))}
            </nav>
          )}
        </div>

        {/* Desktop sidebar */}
        <nav
          className="hidden w-48 shrink-0 flex-col gap-0.5 md:flex"
          aria-label="Settings sections"
        >
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => selectSection(entry.id)}
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm",
                section === entry.id
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              data-testid={`settings-nav-${entry.id}`}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <section className="min-w-0 flex-1 rounded-xl border bg-card p-4 sm:p-5" data-testid={`settings-panel-${section}`}>
          {section === "details" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Project details</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Changing the project key does not rewrite existing issue keys.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="settings-name">Name</Label>
                  <Input
                    id="settings-name"
                    value={name}
                    disabled={!canManage || board.archived}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="settings-key">Key</Label>
                  <Input
                    id="settings-key"
                    value={keyPrefix}
                    disabled={!canManage || board.archived}
                    onChange={(event) => setKeyPrefix(event.target.value.toUpperCase())}
                    maxLength={8}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Access Type</Label>
                  <Select
                    value={accessType}
                    disabled={!canManage || board.archived}
                    onValueChange={(value) => setAccessType(value as TaskBoard["accessType"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="DEPARTMENT_GATED">Department gated</SelectItem>
                      <SelectItem value="MEMBER_GATED">Member gated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Lead</Label>
                  <Select
                    value={leadEmployeeId || "__none__"}
                    disabled={!canManage || board.archived}
                    onValueChange={(value) => setLeadEmployeeId(value === "__none__" ? "" : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select lead" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No lead</SelectItem>
                      {assignees.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="settings-description">Description</Label>
                  <Textarea
                    id="settings-description"
                    value={description}
                    disabled={!canManage || board.archived}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                  />
                </div>
              </div>
              {canManage && !board.archived && (
                <Button
                  type="button"
                  disabled={saving || name.trim().length < 2}
                  onClick={() =>
                    void onSaveDetails({
                      name: name.trim(),
                      keyPrefix: keyPrefix.trim().toUpperCase(),
                      description: description.trim() || null,
                      leadEmployeeId: leadEmployeeId || null,
                      accessType,
                    })
                  }
                >
                  {saving ? t("pages.tasks.saving") : t("pages.tasks.saveChanges")}
                </Button>
              )}
            </div>
          )}

          {section === "members" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Members</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Project roles refine capabilities inside this project. Backend authorization remains authoritative.
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Member</th>
                      <th className="px-3 py-2 font-medium">Project Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberRows.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-3 py-6 text-muted-foreground">
                          No members on this project.
                        </td>
                      </tr>
                    ) : (
                      memberRows.map((row) => {
                        const person = assigneeById.get(row.employeeId);
                        return (
                          <tr key={row.employeeId} className="border-t">
                            <td className="px-3 py-2">
                              <div className="font-medium">{person?.name ?? row.employeeId}</div>
                              <div className="text-xs text-muted-foreground">
                                {person?.employeeCode ?? ""}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {canManage && !board.archived ? (
                                <Select
                                  value={row.role}
                                  onValueChange={(value) =>
                                    setMemberRows((current) =>
                                      current.map((entry) =>
                                        entry.employeeId === row.employeeId
                                          ? { ...entry, role: value as TaskProjectRole }
                                          : entry,
                                      ),
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-8 w-[11rem]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ROLE_OPTIONS.map((role) => (
                                      <SelectItem key={role} value={role}>
                                        {roleLabel(role)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span>{roleLabel(row.role)}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {canManage && !board.archived && memberRows.length > 0 && (
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void onSaveMembers(memberRows)}
                >
                  {saving ? t("pages.tasks.saving") : "Save member roles"}
                </Button>
              )}
            </div>
          )}

          {section === "work-types" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Work types</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Foundation work types supported by this project. Workflow-per-type is not configured yet.
                </p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {WORK_TYPES.map((type) => (
                  <li
                    key={type}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    data-testid={`work-type-${type}`}
                  >
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span className="font-medium">{ISSUE_TYPE_LABELS[type] ?? type}</span>
                    <span className="text-xs text-muted-foreground">{type}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {section === "fields" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Fields</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Existing custom field definitions for this project.
                </p>
              </div>
              {(board.customFieldDefs?.length ?? 0) === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
                  No custom fields defined yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {board.customFieldDefs!.map((field) => (
                    <li key={field.key} className="rounded-lg border px-3 py-2 text-sm">
                      <div className="font-medium">{field.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {field.key} · {field.type}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {section === "workflow" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold">Workflow</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Statuses and transitions for this project. Board columns stay mapped via stage.
                </p>
              </div>

              {workflowsLoading ? (
                <p className="text-sm text-muted-foreground">Loading workflows…</p>
              ) : workflows.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
                  No workflows configured for this project yet.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Workflow</Label>
                    <Select value={selectedWorkflowId} onValueChange={setSelectedWorkflowId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select workflow" />
                      </SelectTrigger>
                      <SelectContent>
                        {workflows.map((workflow) => (
                          <SelectItem key={workflow.id} value={workflow.id}>
                            {workflow.name}
                            {workflow.isDefault ? " (default)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedWorkflow && (
                    <>
                      <div className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Statuses
                        </h3>
                        <ul className="space-y-2">
                          {selectedWorkflow.statuses.map((status) => (
                            <li
                              key={status.id}
                              className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                {canManage && !board.archived ? (
                                  <Input
                                    className="h-8"
                                    defaultValue={status.name}
                                    onBlur={(event) => {
                                      const name = event.target.value.trim();
                                      if (!name || name === status.name) return;
                                      setWorkflowBusy(true);
                                      void tasksApi
                                        .updateWorkflowStatus(status.id, { name })
                                        .then(() => refreshWorkflows(selectedWorkflow.id))
                                        .catch((cause) =>
                                          toast.error(
                                            (cause as Error).message || "Could not rename status.",
                                          ),
                                        )
                                        .finally(() => setWorkflowBusy(false));
                                    }}
                                  />
                                ) : (
                                  <div className="font-medium">{status.name}</div>
                                )}
                                <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                                  <span>{CATEGORY_LABELS[status.category]}</span>
                                  {status.isInitial && (
                                    <span className="rounded bg-muted px-1.5 py-0.5">Initial</span>
                                  )}
                                  {status.isTerminal && (
                                    <span className="rounded bg-muted px-1.5 py-0.5">Terminal</span>
                                  )}
                                  <span
                                    className={cn(
                                      "rounded px-1.5 py-0.5",
                                      status.active === false
                                        ? "bg-amber-50 text-amber-800"
                                        : "bg-emerald-50 text-emerald-800",
                                    )}
                                  >
                                    {status.active === false ? "Inactive" : "Active"}
                                  </span>
                                </div>
                              </div>
                              {canManage && !board.archived && (
                                <div className="flex flex-wrap gap-2">
                                  <Select
                                    value={status.category}
                                    onValueChange={(value) => {
                                      setWorkflowBusy(true);
                                      void tasksApi
                                        .updateWorkflowStatus(status.id, {
                                          category: value as TaskStatusCategory,
                                        })
                                        .then(() => refreshWorkflows(selectedWorkflow.id))
                                        .catch((cause) =>
                                          toast.error(
                                            (cause as Error).message ||
                                              "Could not update category.",
                                          ),
                                        )
                                        .finally(() => setWorkflowBusy(false));
                                    }}
                                  >
                                    <SelectTrigger className="h-8 w-[9rem]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {STATUS_CATEGORIES.map((category) => (
                                        <SelectItem key={category} value={category}>
                                          {CATEGORY_LABELS[category]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={workflowBusy}
                                    onClick={() => {
                                      setWorkflowBusy(true);
                                      void tasksApi
                                        .updateWorkflowStatus(status.id, {
                                          active: status.active === false,
                                        })
                                        .then(() => refreshWorkflows(selectedWorkflow.id))
                                        .catch((cause) =>
                                          toast.error(
                                            (cause as Error).message ||
                                              "Could not update status.",
                                          ),
                                        )
                                        .finally(() => setWorkflowBusy(false));
                                    }}
                                  >
                                    {status.active === false ? "Activate" : "Deactivate"}
                                  </Button>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>

                        {canManage && !board.archived && (
                          <div className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
                            <Input
                              placeholder="New status name"
                              value={newStatusName}
                              onChange={(event) => setNewStatusName(event.target.value)}
                            />
                            <Select
                              value={newStatusCategory}
                              onValueChange={(value) =>
                                setNewStatusCategory(value as TaskStatusCategory)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_CATEGORIES.map((category) => (
                                  <SelectItem key={category} value={category}>
                                    {CATEGORY_LABELS[category]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              disabled={workflowBusy || newStatusName.trim().length < 2}
                              onClick={() => {
                                setWorkflowBusy(true);
                                void tasksApi
                                  .createWorkflowStatus(selectedWorkflow.id, {
                                    name: newStatusName.trim(),
                                    category: newStatusCategory,
                                  })
                                  .then(() => {
                                    setNewStatusName("");
                                    return refreshWorkflows(selectedWorkflow.id);
                                  })
                                  .catch((cause) =>
                                    toast.error(
                                      (cause as Error).message || "Could not add status.",
                                    ),
                                  )
                                  .finally(() => setWorkflowBusy(false));
                              }}
                            >
                              Add status
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Transitions
                        </h3>
                        <ul className="space-y-2">
                          {selectedWorkflow.transitions.map((transition) => (
                            <li
                              key={transition.id}
                              className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0 text-sm">
                                <div className="font-medium">{transition.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {statusNameById.get(transition.fromStatusId) ??
                                    transition.fromStatusId}{" "}
                                  →{" "}
                                  {statusNameById.get(transition.toStatusId) ??
                                    transition.toStatusId}
                                  {transition.commentRequired ? " · comment required" : ""}
                                  {transition.active ? "" : " · inactive"}
                                </div>
                              </div>
                              {canManage && !board.archived && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={workflowBusy}
                                  onClick={() => {
                                    setWorkflowBusy(true);
                                    void tasksApi
                                      .updateWorkflowTransition(transition.id, {
                                        active: !transition.active,
                                      })
                                      .then(() => refreshWorkflows(selectedWorkflow.id))
                                      .catch((cause) =>
                                        toast.error(
                                          (cause as Error).message ||
                                            "Could not update transition.",
                                        ),
                                      )
                                      .finally(() => setWorkflowBusy(false));
                                  }}
                                >
                                  {transition.active ? "Deactivate" : "Activate"}
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>

                        {canManage && !board.archived && (
                          <div className="space-y-2 rounded-lg border border-dashed p-3">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Input
                                placeholder="Transition name"
                                value={newTransitionName}
                                onChange={(event) => setNewTransitionName(event.target.value)}
                              />
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={newTransitionCommentRequired}
                                  onChange={(event) =>
                                    setNewTransitionCommentRequired(event.target.checked)
                                  }
                                  className="h-4 w-4 rounded border"
                                />
                                Comment required
                              </label>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                              <Select
                                value={newTransitionFrom || undefined}
                                onValueChange={setNewTransitionFrom}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="From status" />
                                </SelectTrigger>
                                <SelectContent>
                                  {selectedWorkflow.statuses.map((status) => (
                                    <SelectItem key={status.id} value={status.id}>
                                      {status.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={newTransitionTo || undefined}
                                onValueChange={setNewTransitionTo}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="To status" />
                                </SelectTrigger>
                                <SelectContent>
                                  {selectedWorkflow.statuses.map((status) => (
                                    <SelectItem key={status.id} value={status.id}>
                                      {status.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                disabled={
                                  workflowBusy ||
                                  newTransitionName.trim().length < 2 ||
                                  !newTransitionFrom ||
                                  !newTransitionTo ||
                                  newTransitionFrom === newTransitionTo
                                }
                                onClick={() => {
                                  setWorkflowBusy(true);
                                  void tasksApi
                                    .createWorkflowTransition(selectedWorkflow.id, {
                                      name: newTransitionName.trim(),
                                      fromStatusId: newTransitionFrom,
                                      toStatusId: newTransitionTo,
                                      commentRequired: newTransitionCommentRequired,
                                    })
                                    .then(() => {
                                      setNewTransitionName("");
                                      setNewTransitionFrom("");
                                      setNewTransitionTo("");
                                      setNewTransitionCommentRequired(false);
                                      return refreshWorkflows(selectedWorkflow.id);
                                    })
                                    .catch((cause) =>
                                      toast.error(
                                        (cause as Error).message || "Could not add transition.",
                                      ),
                                    )
                                    .finally(() => setWorkflowBusy(false));
                                }}
                              >
                                Add transition
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {section === "permissions" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Permissions
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Read-only capability summary by project role. Your role:{" "}
                  <span className="font-medium text-foreground">
                    {board.myRole ? roleLabel(board.myRole) : "—"}
                  </span>
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Capability</th>
                      {ROLE_OPTIONS.map((role) => (
                        <th key={role} className="px-2 py-2 font-medium">
                          {roleLabel(role)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CAPABILITY_LABELS.map((cap) => (
                      <tr key={cap.key} className="border-t">
                        <td className="px-3 py-2">{cap.label}</td>
                        {ROLE_OPTIONS.map((role) => (
                          <td key={role} className="px-2 py-2 text-center">
                            {ROLE_CAPABILITIES[role].includes(cap.key) ? (
                              <Check className="mx-auto h-4 w-4 text-emerald-600" />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {section === "archive" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Archive className="h-4 w-4" />
                  Archive project
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Soft archive only — work items and issue keys are preserved and remain historically readable.
                </p>
              </div>
              {board.archived ? (
                <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-sm text-amber-900">This project is archived.</p>
                  {canArchive && (
                    <Button type="button" disabled={saving} onClick={() => void onArchive(false)}>
                      Restore project
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <p className="text-sm">
                    Type <span className="font-semibold">{board.name}</span> to confirm archive.
                  </p>
                  <Input
                    value={archiveConfirm}
                    onChange={(event) => setArchiveConfirm(event.target.value)}
                    placeholder={board.name}
                    disabled={!canArchive}
                    data-testid="archive-confirm-input"
                  />
                  {canArchive && (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={saving || archiveConfirm !== board.name}
                      onClick={() => void onArchive(true)}
                      data-testid="archive-project-button"
                    >
                      Archive project
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
