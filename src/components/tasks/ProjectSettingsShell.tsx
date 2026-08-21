import { ArrowLeft, Archive, Check, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import type {
  ProjectCapability,
  TaskAssignee,
  TaskBoard,
  TaskProjectRole,
} from "@/types/domain";
import { ISSUE_TYPE_LABELS } from "./task-utils";

export type ProjectSettingsSection =
  | "details"
  | "members"
  | "work-types"
  | "fields"
  | "permissions"
  | "archive";

const SECTIONS: Array<{ id: ProjectSettingsSection; label: string }> = [
  { id: "details", label: "Details" },
  { id: "members", label: "Members" },
  { id: "work-types", label: "Work Types" },
  { id: "fields", label: "Fields" },
  { id: "permissions", label: "Permissions" },
  { id: "archive", label: "Archive" },
];

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

  const assigneeById = useMemo(
    () => new Map(assignees.map((person) => [person.id, person])),
    [assignees],
  );

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
