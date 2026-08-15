import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Department, User } from "@/types/domain";
import { useAuth } from "@/lib/auth";
import { branchesApi, employeesApi } from "@/services/api";
import {
  ChevronDown,
  Crown,
  Network,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
  UserRoundPlus,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

export const Route = createFileRoute("/_app/departments")({
  component: DeptPage,
});

/** Reserved unit that holds multiple heads under the CEO / Leadership card. */
const EXECUTIVE_LEADERSHIP_NAME = "Executive Leadership";

function isExecutiveLeadership(department: Department) {
  return department.name.trim().toLowerCase() === EXECUTIVE_LEADERSHIP_NAME.toLowerCase();
}

function headsLabel(department: Department, headNotAssignedLabel: string) {
  const names =
    department.heads && department.heads.length > 0
      ? department.heads
      : department.head
        ? [department.head]
        : [];
  if (names.length === 0) return headNotAssignedLabel;
  if (names.length === 1) return names[0];
  if (names.length === 2) return names.join(" · ");
  return `${names[0]} · +${names.length - 1} more`;
}

function DeptPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [name, setName] = useState("");
  /** Head pickers: one dropdown first; "Add another head" appends more. Use "none" for empty. */
  const [headSlots, setHeadSlots] = useState<string[]>(["none"]);
  const [parentDepartmentId, setParentDepartmentId] = useState("none");
  const [unitType, setUnitType] = useState<"TEAM" | "SUBTEAM" | "FUNCTION">("TEAM");
  const [editing, setEditing] = useState<Department | null>(null);
  /** Leadership: assign multiple heads for the CEO (Executive Leadership unit). */
  const [assignCeoHeads, setAssignCeoHeads] = useState(false);
  const [ceoHeadsUnitId, setCeoHeadsUnitId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [ensuringCeoUnit, setEnsuringCeoUnit] = useState(false);
  const [deleteDept, setDeleteDept] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(0.8);
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(() => new Set());

  function toggleUnit(unitId: string) {
    setExpandedUnits((current) => {
      const next = new Set(current);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  function headsFromDepartment(department?: Department | null) {
    if (!department) return ["none"];
    if (department.headEmployeeIds?.length) return [...department.headEmployeeIds];
    if (department.headEmployeeId) return [department.headEmployeeId];
    return ["none"];
  }

  function setHeadSlot(index: number, employeeId: string) {
    setHeadSlots((current) => {
      const next = [...current];
      next[index] = employeeId;
      return next;
    });
  }

  function addHeadSlot() {
    setHeadSlots((current) => [...current, "none"]);
  }

  function removeHeadSlot(index: number) {
    setHeadSlots((current) => {
      if (current.length <= 1) return ["none"];
      return current.filter((_, slotIndex) => slotIndex !== index);
    });
  }

  useEffect(() => {
    Promise.all([branchesApi.departments(), employeesApi.list()])
      .then(([departmentRows, employeeRows]) => {
        setDepartments(departmentRows);
        setEmployees(employeeRows);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const headOptions = useMemo(
    () => employees.filter((employee) => !!employee.employeeId),
    [employees],
  );
  const headEmployeeIds = useMemo(() => headSlots.filter((id) => id !== "none"), [headSlots]);
  const canAddAnotherHead = headOptions.some(
    (employee) => !headEmployeeIds.includes(employee.employeeId!),
  );

  function optionsForHeadSlot(index: number) {
    const taken = new Set(
      headSlots.filter((id, slotIndex) => slotIndex !== index && id !== "none"),
    );
    return headOptions.filter((employee) => !taken.has(employee.employeeId!));
  }

  const executiveLeadership = useMemo(
    () => departments.find(isExecutiveLeadership) ?? null,
    [departments],
  );
  const topLevelDepartments = useMemo(
    () =>
      departments
        .filter((department) => !department.parentDepartmentId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [departments],
  );
  /** Org units shown under Leadership (hide the reserved CEO heads unit). */
  const chartTopLevelDepartments = useMemo(
    () => topLevelDepartments.filter((department) => !isExecutiveLeadership(department)),
    [topLevelDepartments],
  );
  const needsUnitName = !assignCeoHeads; // create/edit need a name; CEO heads does not
  const isCreateTopLevel = !editing && !assignCeoHeads && parentDepartmentId === "none";

  const childrenOf = (parentId: string) =>
    departments
      .filter((department) => department.parentDepartmentId === parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const chartWidth = Math.max(1120, chartTopLevelDepartments.length * 388 - 28);

  function resetForm() {
    setEditing(null);
    setAssignCeoHeads(false);
    setCeoHeadsUnitId("");
    setName("");
    setHeadSlots(["none"]);
    setParentDepartmentId("none");
    setUnitType("TEAM");
    setShowForm(false);
  }

  function openCreateTopLevel() {
    setEditing(null);
    setAssignCeoHeads(false);
    setCeoHeadsUnitId("");
    setName("");
    setHeadSlots(["none"]);
    setParentDepartmentId("none");
    setUnitType("TEAM");
    setShowForm(true);
  }

  async function openAssignCeoHeads() {
    setEnsuringCeoUnit(true);
    try {
      let unit = executiveLeadership;
      if (!unit) {
        unit = await branchesApi.createDepartment({
          name: EXECUTIVE_LEADERSHIP_NAME,
          headEmployeeIds: [],
          parentDepartmentId: null,
          unitType: "TEAM",
        });
        setDepartments((prev) => [...prev, unit!].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setEditing(null);
      setAssignCeoHeads(true);
      setCeoHeadsUnitId(unit.id);
      setName(unit.name);
      setHeadSlots(headsFromDepartment(unit));
      setParentDepartmentId("none");
      setUnitType("TEAM");
      setShowForm(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnsuringCeoUnit(false);
    }
  }

  function openCreateUnder(parent: Department) {
    setEditing(null);
    setAssignCeoHeads(false);
    setCeoHeadsUnitId("");
    setName("");
    setHeadSlots(["none"]);
    setParentDepartmentId(parent.id);
    setUnitType(parent.parentDepartmentId ? "FUNCTION" : "SUBTEAM");
    setShowForm(true);
  }

  function openEditDialog(department: Department) {
    if (isExecutiveLeadership(department)) {
      void openAssignCeoHeads();
      return;
    }
    setEditing(department);
    setAssignCeoHeads(false);
    setCeoHeadsUnitId("");
    setName(department.name);
    setHeadSlots(headsFromDepartment(department));
    setParentDepartmentId(department.parentDepartmentId ?? "none");
    setUnitType(department.unitType ?? "TEAM");
    setShowForm(true);
  }

  async function saveDepartment(e: React.FormEvent) {
    e.preventDefault();
    if (needsUnitName && !name.trim()) {
      toast.error(t("pages.departments.toastNameRequired"));
      return;
    }
    if (isCreateTopLevel && name.trim().toLowerCase() === EXECUTIVE_LEADERSHIP_NAME.toLowerCase()) {
      toast.error(t("pages.departments.toastUseAssignHeads"));
      return;
    }
    if (assignCeoHeads) {
      if (!ceoHeadsUnitId) {
        toast.error(t("pages.departments.toastCeoUnitNotReady"));
        return;
      }
      if (headEmployeeIds.length === 0) {
        toast.error(t("pages.departments.toastSelectHead"));
        return;
      }
    }
    setSaving(true);
    try {
      if (assignCeoHeads) {
        const saved = await branchesApi.updateDepartment(ceoHeadsUnitId, { headEmployeeIds });
        setDepartments((prev) =>
          prev
            .map((row) => (row.id === saved.id ? saved : row))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        toast.success(t("pages.departments.toastCeoHeadsUpdated"));
        resetForm();
        return;
      }

      const payload = {
        name: name.trim(),
        // Creating a unit is separate from assigning heads.
        headEmployeeIds: isCreateTopLevel ? [] : headEmployeeIds,
        parentDepartmentId: parentDepartmentId === "none" ? null : parentDepartmentId,
        unitType,
      };
      const saved = editing
        ? await branchesApi.updateDepartment(editing.id, {
            ...payload,
            headEmployeeIds,
          })
        : await branchesApi.createDepartment(payload);
      setDepartments((prev) =>
        (editing ? prev.map((row) => (row.id === saved.id ? saved : row)) : [...prev, saved]).sort(
          (a, b) => a.name.localeCompare(b.name),
        ),
      );
      toast.success(
        editing
          ? t("pages.departments.toastDeptUpdated")
          : isCreateTopLevel
            ? t("pages.departments.toastUnitCreatedUnderCeo")
            : t("pages.departments.toastDeptAdded"),
      );
      if (!editing && parentDepartmentId !== "none") {
        setExpandedUnits((current) => new Set(current).add(parentDepartmentId));
      }
      resetForm();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function performDeleteDepartment(dept: Department) {
    if (isExecutiveLeadership(dept)) {
      toast.error(t("pages.departments.toastCannotDeleteCeoUnit"));
      setDeleteDept(null);
      return;
    }
    try {
      await branchesApi.deleteDepartment(dept.id);
      setDepartments((prev) => prev.filter((d) => d.id !== dept.id));
      toast.success(t("pages.departments.toastDeptDeleted"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function renderChildNode(department: Department): ReactNode {
    const children = childrenOf(department.id);
    const isExpanded = expandedUnits.has(department.id);
    return (
      <div key={department.id} className="relative">
        <div
          className="relative cursor-pointer rounded-md border border-border bg-background p-3 shadow-sm transition-[border-color,box-shadow,transform] duration-200 before:absolute before:-left-4 before:top-6 before:h-px before:w-4 before:animate-pulse before:border-t before:border-dashed before:border-primary/60 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onClick={() => children.length > 0 && toggleUnit(department.id)}
          onKeyDown={(event) => {
            if (children.length > 0 && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              toggleUnit(department.id);
            }
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-foreground">{department.name}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserRound className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {headsLabel(department, t("pages.departments.headNotAssigned"))}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              {children.length > 0 && (
                <span className="flex h-8 items-center gap-1 rounded-md bg-muted px-2 text-xs font-medium text-muted-foreground">
                  {children.length}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </span>
              )}
              <Button
                size="icon"
                variant="ghost"
                title={t("pages.departments.addChild")}
                aria-label={`Add child unit under ${department.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  openCreateUnder(department);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title={t("pages.departments.editUnitBtn")}
                aria-label={`Edit ${department.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  openEditDialog(department);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                title={t("pages.departments.deleteUnit")}
                aria-label={`Delete ${department.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleteDept(department);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        {children.length > 0 && isExpanded && (
          <div className="ml-5 animate-in space-y-3 border-l border-dashed border-primary/50 pl-4 pt-4 duration-300 fade-in slide-in-from-top-2">
            {children.map((child) => renderChildNode(child))}
          </div>
        )}
      </div>
    );
  }

  if (user && user.role !== "developer_admin") {
    return (
      <div>
        <PageHeader
          title={t("pages.departments.title")}
          description={t("pages.departments.subtitleDenied")}
        />
        <p className="text-sm text-muted-foreground">{t("pages.departments.contactAdmin")}</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("pages.departments.title")}
        description={t("pages.departments.subtitle")}
      />

      {loading && <LoadingState label={t("pages.loading.departments")} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-3 py-2 sm:px-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("pages.departments.orgChartTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="md:hidden">{t("pages.departments.tapToExpand")}</span>
                <span className="hidden md:inline">{t("pages.departments.dragScrollbar")}</span>
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title={t("pages.departments.zoomOut")}
                aria-label={t("pages.departments.zoomOut")}
                disabled={zoom <= 0.5}
                onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(1))))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-xs font-medium tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title={t("pages.departments.zoomIn")}
                aria-label={t("pages.departments.zoomIn")}
                disabled={zoom >= 1.4}
                onClick={() => setZoom((value) => Math.min(1.4, Number((value + 0.1).toFixed(1))))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title={t("pages.departments.resetZoom")}
                aria-label={t("pages.departments.resetZoom")}
                onClick={() => setZoom(0.8)}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto overscroll-x-contain px-3 py-4 sm:px-6 sm:py-6 md:px-6">
            <div
              className="w-full transition-transform duration-200 ease-out motion-reduce:transition-none md:w-[var(--chart-width)]"
              style={
                {
                  zoom,
                  "--chart-width": `${chartWidth}px`,
                } as CSSProperties
              }
            >
              <div className="mx-auto flex max-w-md items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Crown className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    {t("pages.departments.leadershipLabel")}
                  </p>
                  <p className="font-semibold text-foreground">
                    {t("pages.departments.ceoTitle")}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <UserRound className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {executiveLeadership
                        ? headsLabel(executiveLeadership, t("pages.departments.headNotAssigned"))
                        : t("pages.departments.noHeads")}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title={t("pages.departments.createUnit")}
                    aria-label={t("pages.departments.createUnit")}
                    onClick={openCreateTopLevel}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title={t("pages.departments.assignCeoHeads")}
                    aria-label={t("pages.departments.assignCeoHeads")}
                    disabled={ensuringCeoUnit}
                    onClick={() => void openAssignCeoHeads()}
                  >
                    <UserRoundPlus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mx-auto h-6 w-px bg-border" />
              <div className="relative mb-6 flex items-center justify-center">
                <div className="absolute inset-x-0 top-1/2 hidden h-px bg-border sm:block" />
                <span className="relative flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  <Network className="h-3.5 w-3.5" /> {t("pages.departments.orgUnitsLabel")}
                </span>
              </div>

              <div className="flex w-full max-w-full flex-col items-stretch gap-4 md:w-max md:flex-row md:items-start md:gap-7">
                {chartTopLevelDepartments.length === 0 && (
                  <div className="w-full rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground md:w-[360px]">
                    {t("pages.departments.noUnitsYet")}
                  </div>
                )}
                {chartTopLevelDepartments.map((department) => {
                  const children = childrenOf(department.id);
                  const isExpanded = expandedUnits.has(department.id);
                  return (
                    <section
                      key={department.id}
                      className="relative w-full shrink-0 pt-0 before:hidden md:w-[360px] md:pt-6 md:before:absolute md:before:left-1/2 md:before:top-0 md:before:block md:before:h-6 md:before:w-px md:before:bg-border"
                    >
                      <div
                        className="cursor-pointer rounded-md border border-border bg-background p-4 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => children.length > 0 && toggleUnit(department.id)}
                        onKeyDown={(event) => {
                          if (children.length > 0 && (event.key === "Enter" || event.key === " ")) {
                            event.preventDefault();
                            toggleUnit(department.id);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium uppercase text-muted-foreground">
                              {(department.unitType ?? "TEAM").toLowerCase()}
                            </p>
                            <h2 className="mt-1 break-words text-base font-semibold text-foreground">
                              {department.name}
                            </h2>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {children.length > 0 && (
                              <span className="mr-1 flex h-8 items-center gap-1 rounded-md bg-muted px-2 text-xs font-medium text-muted-foreground">
                                {children.length}
                                <ChevronDown
                                  className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                                />
                              </span>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              title={`Add under ${department.name}`}
                              aria-label={`Add under ${department.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openCreateUnder(department);
                              }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title={t("pages.departments.editUnitBtn")}
                              aria-label={`Edit ${department.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditDialog(department);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              title={t("pages.departments.deleteUnit")}
                              aria-label={`Delete ${department.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeleteDept(department);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                          <UserRound className="h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {headsLabel(department, t("pages.departments.headNotAssigned"))}
                          </span>
                        </div>
                      </div>

                      {children.length > 0 && isExpanded && (
                        <div className="ml-5 animate-in space-y-3 border-l border-dashed border-primary/50 pl-4 pt-4 duration-300 fade-in slide-in-from-top-2">
                          {children.map((child) => renderChildNode(child))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table className="min-w-[620px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("pages.departments.tableName")}</TableHead>
                <TableHead>{t("pages.departments.tableType")}</TableHead>
                <TableHead>{t("pages.departments.reportsUnder")}</TableHead>
                <TableHead>{t("pages.departments.tableHead")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    {d.parentDepartmentId ? (
                      <span className="mr-2 text-muted-foreground">↳</span>
                    ) : null}
                    {d.name}
                  </TableCell>
                  <TableCell className="capitalize">
                    {(d.unitType ?? "TEAM").toLowerCase()}
                  </TableCell>
                  <TableCell>
                    {departments.find((parent) => parent.id === d.parentDepartmentId)?.name ??
                      "CEO"}
                  </TableCell>
                  <TableCell>{headsLabel(d, t("pages.departments.headNotAssigned"))}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(d)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t("common.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteDept(d)}
                        title={t("pages.departments.deleteDept")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && departments.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">
            {t("pages.departments.noneFound")}
          </div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("pages.departments.editUnit")
                : assignCeoHeads
                  ? t("pages.departments.assignCeoHeads")
                  : isCreateTopLevel
                    ? t("pages.departments.createUnit")
                    : parentDepartmentId !== "none"
                      ? `Add under ${departments.find((item) => item.id === parentDepartmentId)?.name ?? "unit"}`
                      : t("pages.departments.addUnit")}
            </DialogTitle>
            <DialogDescription>
              {assignCeoHeads
                ? t("pages.departments.ceoHeadsDescription")
                : isCreateTopLevel
                  ? t("pages.departments.createTopLevelDescription")
                  : t("pages.departments.addUnitDescription")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveDepartment} className="space-y-4">
            {assignCeoHeads && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("pages.departments.assigningHeadsFor")}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {t("pages.departments.ceoTitle")}
                </p>
              </div>
            )}

            {needsUnitName && (
              <div className="space-y-1.5">
                <Label>Organization unit name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sales, Operations, Accounts"
                />
              </div>
            )}

            {editing ? (
              <>
                <div className="space-y-1.5">
                  <Label>Unit type</Label>
                  <Select
                    value={unitType}
                    onValueChange={(value) => setUnitType(value as typeof unitType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEAM">{t("pages.departments.orgUnit")}</SelectItem>
                      <SelectItem value="SUBTEAM">{t("pages.departments.team")}</SelectItem>
                      <SelectItem value="FUNCTION">{t("pages.departments.subteam")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("pages.departments.reportsUnder")}</Label>
                  <Select value={parentDepartmentId} onValueChange={setParentDepartmentId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("pages.departments.ceoTopLevel")}</SelectItem>
                      {departments
                        .filter((item) => item.id !== editing.id && !isExecutiveLeadership(item))
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : !assignCeoHeads && !isCreateTopLevel ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">Adding under</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {departments.find((item) => item.id === parentDepartmentId)?.name}
                </p>
              </div>
            ) : isCreateTopLevel ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("pages.departments.reportsUnder")}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {t("pages.departments.ceoTitle")}
                </p>
              </div>
            ) : null}

            {!isCreateTopLevel && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Heads</Label>
                  <span className="text-xs text-muted-foreground">
                    {headEmployeeIds.length === 0
                      ? "None selected"
                      : `${headEmployeeIds.length} selected`}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {headSlots.map((selectedId, index) => {
                    const slotOptions = optionsForHeadSlot(index);
                    const selectedEmployee = headOptions.find(
                      (employee) => employee.employeeId === selectedId,
                    );
                    const otherHeaded =
                      selectedId !== "none"
                        ? departments
                            .filter(
                              (dept) =>
                                dept.id !== editing?.id &&
                                dept.id !== (assignCeoHeads ? ceoHeadsUnitId : "") &&
                                (dept.headEmployeeIds?.includes(selectedId) ||
                                  dept.headEmployeeId === selectedId),
                            )
                            .map((dept) => dept.name)
                        : [];
                    return (
                      <div key={`head-slot-${index}`} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Select
                            value={selectedId}
                            onValueChange={(value) => setHeadSlot(index, value)}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue
                                placeholder={index === 0 ? "Select head" : "Select another head"}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                {index === 0 ? "No head assigned" : "Select employee"}
                              </SelectItem>
                              {selectedEmployee &&
                                !slotOptions.some(
                                  (employee) => employee.employeeId === selectedId,
                                ) && (
                                  <SelectItem value={selectedId}>
                                    {selectedEmployee.name}
                                    {selectedEmployee.employeeCode
                                      ? ` (${selectedEmployee.employeeCode})`
                                      : ""}
                                  </SelectItem>
                                )}
                              {slotOptions.map((employee) => (
                                <SelectItem key={employee.employeeId} value={employee.employeeId!}>
                                  {employee.name}
                                  {employee.employeeCode ? ` (${employee.employeeCode})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {headSlots.length > 1 && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="shrink-0 text-muted-foreground hover:text-destructive"
                              title="Remove this head"
                              aria-label={`Remove head slot ${index + 1}`}
                              onClick={() => removeHeadSlot(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {otherHeaded.length > 0 ? (
                          <p className="px-0.5 text-xs text-muted-foreground">
                            Also heads {otherHeaded.join(", ")}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={!canAddAnotherHead}
                  onClick={addHeadSlot}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add another head
                </Button>
                <p className="text-xs text-muted-foreground">
                  Already chosen people are hidden from the next dropdown for this unit.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? t("pages.departments.saving")
                  : editing
                    ? t("pages.departments.saveUnit")
                    : assignCeoHeads
                      ? t("pages.departments.saveCeoHeads")
                      : t("pages.departments.createUnitBtn")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDept} onOpenChange={(open) => !open && setDeleteDept(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.departments.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("pages.departments.deleteConfirmDescription", { name: deleteDept?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (!deleteDept) return;
                void performDeleteDepartment(deleteDept);
                setDeleteDept(null);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
