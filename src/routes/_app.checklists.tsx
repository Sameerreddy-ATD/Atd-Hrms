import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmployeePicker } from "@/components/common/EmployeePicker";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableToolbar } from "@/components/common/TableToolbar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { checklistsApi, employeesApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/india-date";
import type { User } from "@/types/domain";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  ListTodo,
  Plus,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_app/checklists")({ component: ChecklistsPage });

type ChecklistRow = Awaited<ReturnType<typeof checklistsApi.list>>[number];
type TemplateRow = Awaited<ReturnType<typeof checklistsApi.templates>>[number];

const NO_LINK = "__none__";
const LINK_OPTIONS = [
  { value: NO_LINK, label: "No link" },
  { value: "/employees", label: "Employees" },
  { value: "/assets", label: "Assets" },
  { value: "/users", label: "User Logins" },
  { value: "/face-security", label: "Face security" },
  { value: "/id-card", label: "ID card" },
  { value: "/employee-services", label: "Employee requests" },
  { value: "/announcements", label: "Announcements" },
  { value: "/branches", label: "Branches" },
  { value: "/devices", label: "Devices" },
  { value: "/holidays", label: "Holidays" },
  { value: "/leave/policy", label: "Leave policy" },
  { value: "/checklists", label: "Checklists" },
  { value: "/dashboard", label: "Dashboard" },
  { value: "/talent", label: "Talent acquisition" },
  { value: "/onboarding", label: "Onboarding" },
  { value: "/people-changes", label: "People changes" },
  { value: "/performance", label: "Performance" },
  { value: "/offboarding", label: "Offboarding" },
  { value: "/lms", label: "Learning" },
];

type TemplateDraft = {
  name: string;
  kind: "ONBOARDING" | "OFFBOARDING";
  isActive: boolean;
  items: Array<{ title: string; linkPath: string }>;
};

function emptyDraft(kind: "ONBOARDING" | "OFFBOARDING" = "ONBOARDING"): TemplateDraft {
  return {
    name: kind === "ONBOARDING" ? "Onboarding checklist" : "Offboarding checklist",
    kind,
    isActive: true,
    items: [{ title: "", linkPath: NO_LINK }],
  };
}

function ChecklistsPage() {
  const { user } = useAuth();
  const canOperate = user?.role === "hr" || user?.role === "developer_admin";
  const canEditTemplates = user?.role === "developer_admin";
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [kindFilter, setKindFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const reload = useCallback(async () => {
    if (!canOperate) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [checklistRows, people, templateRows] = await Promise.all([
        checklistsApi.list(),
        employeesApi.list().catch(() => []),
        canEditTemplates ? checklistsApi.templates().catch(() => []) : Promise.resolve([]),
      ]);
      setRows(checklistRows);
      setEmployees((people as User[]).filter((person) => person.active && person.employeeId));
      setTemplates(templateRows);
    } catch (error) {
      toast.error((error as Error).message || "Unable to load checklists");
    } finally {
      setLoading(false);
    }
  }, [canOperate, canEditTemplates]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (kindFilter !== "all" && row.kind !== kindFilter) return false;
      if (!search) return true;
      return `${row.employeeName} ${row.employeeCode} ${row.templateName} ${row.kind}`
        .toLowerCase()
        .includes(search);
    });
  }, [rows, statusFilter, kindFilter, query]);

  const openInstances = rows.filter((row) => row.status === "OPEN").length;
  const openItems = rows.reduce(
    (sum, row) => sum + row.items.filter((item) => !item.completed).length,
    0,
  );
  const completedInstances = rows.filter((row) => row.status === "COMPLETED").length;

  async function start(kind: "ONBOARDING" | "OFFBOARDING") {
    if (!employeeId) return;
    try {
      await checklistsApi.start(employeeId, kind);
      toast.success(`${kind === "ONBOARDING" ? "Onboarding" : "Offboarding"} started`);
      setStatusFilter("OPEN");
      await reload();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function toggleItem(itemId: string, completed: boolean) {
    try {
      await checklistsApi.toggleItem(itemId, completed);
      await reload();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function setInstanceStatus(id: string, status: "OPEN" | "COMPLETED" | "CANCELLED") {
    try {
      await checklistsApi.setStatus(id, status);
      toast.success(
        status === "COMPLETED"
          ? "Checklist marked complete"
          : status === "CANCELLED"
            ? "Checklist cancelled"
            : "Checklist reopened",
      );
      await reload();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  function beginCreateTemplate() {
    setEditingTemplateId(null);
    setTemplateDraft(emptyDraft("ONBOARDING"));
  }

  function beginEditTemplate(template: TemplateRow) {
    setEditingTemplateId(template.id);
    setTemplateDraft({
      name: template.name,
      kind: template.kind === "OFFBOARDING" ? "OFFBOARDING" : "ONBOARDING",
      isActive: template.isActive,
      items: template.items.map((item) => ({
        title: item.title,
        linkPath: item.linkPath || NO_LINK,
      })),
    });
  }

  async function saveTemplate() {
    if (!templateDraft) return;
    if (templateDraft.items.some((item) => item.title.trim().length < 2)) {
      toast.error("Every item needs a title");
      return;
    }
    setSavingTemplate(true);
    const payloadItems = templateDraft.items.map((item) => ({
      title: item.title.trim(),
      linkPath: !item.linkPath || item.linkPath === NO_LINK ? null : item.linkPath,
    }));
    try {
      if (editingTemplateId) {
        await checklistsApi.saveTemplate(editingTemplateId, {
          name: templateDraft.name.trim(),
          isActive: templateDraft.isActive,
          items: payloadItems,
        });
        toast.success("Template saved — new starts use these items");
      } else {
        await checklistsApi.createTemplate({
          name: templateDraft.name.trim(),
          kind: templateDraft.kind,
          isActive: templateDraft.isActive,
          items: payloadItems,
        });
        toast.success("Template created");
      }
      setEditingTemplateId(null);
      setTemplateDraft(null);
      await reload();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingTemplate(false);
    }
  }

  async function removeTemplate(template: TemplateRow) {
    try {
      const result = await checklistsApi.deleteTemplate(template.id);
      toast.success(
        result.deactivated
          ? "Template deactivated (existing checklists kept)"
          : "Template deleted",
      );
      if (editingTemplateId === template.id) {
        setEditingTemplateId(null);
        setTemplateDraft(null);
      }
      await reload();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  if (!canOperate) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loading) return <LoadingState label="Loading checklists" />;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 pb-16 sm:px-6">
      <PageHeader
        title="Onboarding & offboarding"
        description={
          canEditTemplates
            ? "HR works each hire/exit checklist. Developer Admin adds, edits, or removes the process templates."
            : "For each new hire or exit, work through what to provide and what data to collect. Tick items as you complete them."
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Open checklists" value={openInstances} icon={ClipboardList} tone="warning" />
        <StatCard label="Open items" value={openItems} icon={ListTodo} tone="info" />
        <StatCard
          label="Completed"
          value={completedInstances}
          icon={CheckCircle2}
          tone="success"
        />
      </section>

      <Tabs defaultValue="instances" className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="instances">Checklists ({visible.length})</TabsTrigger>
          {canEditTemplates && (
            <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="instances" className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end">
            <EmployeePicker
              className="min-w-[220px] flex-1 space-y-1.5"
              employees={employees}
              value={employeeId}
              onChange={setEmployeeId}
            />
            <Button disabled={!employeeId} onClick={() => void start("ONBOARDING")}>
              Start onboarding
            </Button>
            <Button
              variant="outline"
              disabled={!employeeId}
              onClick={() => void start("OFFBOARDING")}
            >
              Start offboarding
            </Button>
          </div>

          <TableToolbar>
            <Input
              className="min-w-48 flex-1"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search employee or template"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="ONBOARDING">Onboarding</SelectItem>
                <SelectItem value="OFFBOARDING">Offboarding</SelectItem>
              </SelectContent>
            </Select>
          </TableToolbar>

          {visible.length === 0 ? (
            <EmptyState
              title="No checklists"
              description="Start onboarding or offboarding for an employee, or clear filters."
            />
          ) : (
            <div className="space-y-4">
              {visible.map((row) => {
                const pct =
                  row.totalCount === 0
                    ? 0
                    : Math.round((row.completedCount / row.totalCount) * 100);
                return (
                  <section key={row.id} className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-semibold">
                          {row.employeeName}{" "}
                          <span className="text-muted-foreground">· {row.employeeCode}</span>
                        </h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {row.kind === "ONBOARDING" ? "Onboarding" : "Offboarding"} ·{" "}
                          {row.templateName} · started{" "}
                          {formatDisplayDate(row.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={row.status} />
                        {row.status === "OPEN" && (
                          <>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                  Mark complete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Mark checklist complete?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Any remaining open items will be marked done automatically. Use
                                    Reopen later if work was closed too early.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => void setInstanceStatus(row.id, "COMPLETED")}
                                  >
                                    Mark complete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void setInstanceStatus(row.id, "CANCELLED")}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                        {row.status !== "OPEN" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void setInstanceStatus(row.id, "OPEN")}
                          >
                            Reopen
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>
                          {row.completedCount}/{row.totalCount} items
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            pct === 100 ? "bg-emerald-500" : "bg-primary",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      {row.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 rounded-md border border-border/70 bg-background px-3 py-2.5"
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={item.completed}
                            disabled={row.status === "CANCELLED" || row.status === "COMPLETED"}
                            onCheckedChange={(checked) =>
                              void toggleItem(item.id, checked === true)
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "text-sm font-medium",
                                item.completed && "text-muted-foreground line-through",
                              )}
                            >
                              {item.title}
                            </p>
                            {item.completedAt && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                Done {formatDisplayDateTime(item.completedAt)}
                              </p>
                            )}
                          </div>
                          {item.linkPath && (
                            <Button asChild size="sm" variant="ghost" className="shrink-0">
                              <a href={item.linkPath}>
                                Open
                                <ExternalLink className="ml-1 h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </TabsContent>

        {canEditTemplates && (
          <TabsContent value="templates" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Templates define what HR must provide and collect. Editing a template does not change
                checklists already in progress.
              </p>
              <Button onClick={beginCreateTemplate}>
                <Plus className="mr-2 h-4 w-4" /> New template
              </Button>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {templates.map((template) => (
                <div key={template.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{template.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {template.kind} · {template.items.length} items · {template.instanceCount}{" "}
                        instances · {template.isActive ? "Active" : "Inactive"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => beginEditTemplate(template)}>
                        Edit
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost">
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove this template?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {template.instanceCount > 0
                                ? "It has existing checklists, so it will be deactivated instead of deleted."
                                : "This permanently deletes the unused template."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void removeTemplate(template)}>
                              Confirm
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {template.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-2 text-muted-foreground">
                        <span>{item.title}</span>
                        {item.linkPath && (
                          <span className="shrink-0 font-mono text-[11px]">{item.linkPath}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {templateDraft && (
              <div className="rounded-xl border bg-card p-4 sm:p-5">
                <h3 className="font-semibold">
                  {editingTemplateId ? "Edit template" : "New template"}
                  {editingTemplateId ? ` · ${templateDraft.kind}` : ""}
                </h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-1">
                    <Label>Name</Label>
                    <Input
                      value={templateDraft.name}
                      onChange={(event) =>
                        setTemplateDraft((current) =>
                          current ? { ...current, name: event.target.value } : current,
                        )
                      }
                    />
                  </div>
                  {!editingTemplateId && (
                    <div className="space-y-1.5">
                      <Label>Kind</Label>
                      <Select
                        value={templateDraft.kind}
                        onValueChange={(value) =>
                          setTemplateDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  kind: value === "OFFBOARDING" ? "OFFBOARDING" : "ONBOARDING",
                                }
                              : current,
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ONBOARDING">Onboarding</SelectItem>
                          <SelectItem value="OFFBOARDING">Offboarding</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select
                      value={templateDraft.isActive ? "active" : "inactive"}
                      onValueChange={(value) =>
                        setTemplateDraft((current) =>
                          current ? { ...current, isActive: value === "active" } : current,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {templateDraft.items.map((item, index) => (
                    <div
                      key={index}
                      className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_200px_auto]"
                    >
                      <Input
                        value={item.title}
                        placeholder="What HR should provide or collect"
                        onChange={(event) =>
                          setTemplateDraft((current) => {
                            if (!current) return current;
                            const items = [...current.items];
                            items[index] = { ...items[index], title: event.target.value };
                            return { ...current, items };
                          })
                        }
                      />
                      <Select
                        value={item.linkPath || NO_LINK}
                        onValueChange={(value) =>
                          setTemplateDraft((current) => {
                            if (!current) return current;
                            const items = [...current.items];
                            items[index] = { ...items[index], linkPath: value };
                            return { ...current, items };
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Link" />
                        </SelectTrigger>
                        <SelectContent>
                          {LINK_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={templateDraft.items.length <= 1}
                        onClick={() =>
                          setTemplateDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  items: current.items.filter((_, i) => i !== index),
                                }
                              : current,
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setTemplateDraft((current) =>
                        current
                          ? {
                              ...current,
                              items: [...current.items, { title: "", linkPath: NO_LINK }],
                            }
                          : current,
                      )
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add item
                  </Button>
                  <Button disabled={savingTemplate} onClick={() => void saveTemplate()}>
                    {savingTemplate ? "Saving..." : editingTemplateId ? "Save template" : "Create template"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingTemplateId(null);
                      setTemplateDraft(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
