import { createFileRoute } from "@tanstack/react-router";
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
  { value: "/profile", label: "My Profile" },
  { value: "/face-enrollment", label: "Face enrollment" },
  { value: "/id-card", label: "ID card" },
  { value: "/announcements", label: "Announcements" },
  { value: "/leave/apply", label: "Apply leave" },
  { value: "/attendance/mine", label: "My attendance" },
  { value: "/employee-services", label: "Employee requests" },
  { value: "/assets", label: "Assets (offboarding)" },
  { value: "/checklists", label: "Checklists" },
  { value: "/dashboard", label: "Dashboard" },
];

function ChecklistsPage() {
  const { user } = useAuth();
  const canManage = ["developer_admin", "main_admin", "hr"].includes(user?.role ?? "");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [kindFilter, setKindFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(null);
  const [templateDraft, setTemplateDraft] = useState<{
    name: string;
    isActive: boolean;
    items: Array<{ title: string; linkPath: string }>;
  } | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [checklistRows, people, templateRows] = await Promise.all([
        checklistsApi.list(),
        canManage ? employeesApi.list().catch(() => []) : Promise.resolve([]),
        canManage ? checklistsApi.templates().catch(() => []) : Promise.resolve([]),
      ]);
      setRows(checklistRows);
      setEmployees((people as User[]).filter((person) => person.active && person.employeeId));
      setTemplates(templateRows);
    } catch (error) {
      toast.error((error as Error).message || "Unable to load checklists");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

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

  function beginEditTemplate(template: TemplateRow) {
    setEditingTemplate(template);
    setTemplateDraft({
      name: template.name,
      isActive: template.isActive,
      items: template.items.map((item) => ({
        title: item.title,
        linkPath: item.linkPath || NO_LINK,
      })),
    });
  }

  async function saveTemplate() {
    if (!editingTemplate || !templateDraft) return;
    if (templateDraft.items.some((item) => item.title.trim().length < 2)) {
      toast.error("Every item needs a title");
      return;
    }
    setSavingTemplate(true);
    try {
      await checklistsApi.saveTemplate(editingTemplate.id, {
        name: templateDraft.name.trim(),
        isActive: templateDraft.isActive,
        items: templateDraft.items.map((item) => ({
          title: item.title.trim(),
          linkPath: !item.linkPath || item.linkPath === NO_LINK ? null : item.linkPath,
        })),
      });
      toast.success("Template saved — new starts use these items");
      setEditingTemplate(null);
      setTemplateDraft(null);
      await reload();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingTemplate(false);
    }
  }

  if (loading) return <LoadingState label="Loading checklists" />;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 pb-16 sm:px-6">
      <PageHeader
        title="Onboarding & offboarding"
        description={
          canManage
            ? "Start checklists, track progress, and edit the templates used for every new hire or exit."
            : "Complete your open onboarding or offboarding items. Linked screens open in one tap."
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
          {canManage && <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="instances" className="space-y-4">
          {canManage && (
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
          )}

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
              description={
                canManage
                  ? "Start onboarding or offboarding for an employee, or clear filters."
                  : "You have no checklist items matching these filters."
              }
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
                          {new Date(row.createdAt).toLocaleDateString("en-IN")}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={row.status} />
                        {canManage && row.status === "OPEN" && (
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
                        {canManage && row.status !== "OPEN" && (
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
                                Done {new Date(item.completedAt).toLocaleString("en-IN")}
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

        {canManage && (
          <TabsContent value="templates" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Templates control what new onboarding/offboarding checklists contain. Editing a
              template does not change checklists already in progress.
            </p>
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
                    <Button size="sm" variant="outline" onClick={() => beginEditTemplate(template)}>
                      Edit
                    </Button>
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

            {editingTemplate && templateDraft && (
              <div className="rounded-xl border bg-card p-4 sm:p-5">
                <h3 className="font-semibold">Edit template · {editingTemplate.kind}</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
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
                        placeholder="Item title"
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
                    {savingTemplate ? "Saving..." : "Save template"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingTemplate(null);
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
