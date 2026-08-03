import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
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
  ZoomIn,
  ZoomOut,
} from "lucide-react";

export const Route = createFileRoute("/_app/departments")({
  component: DeptPage,
});

function DeptPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [headEmployeeId, setHeadEmployeeId] = useState("none");
  const [parentDepartmentId, setParentDepartmentId] = useState("none");
  const [unitType, setUnitType] = useState<"TEAM" | "SUBTEAM" | "FUNCTION">("TEAM");
  const [editing, setEditing] = useState<Department | null>(null);
  const [showForm, setShowForm] = useState(false);
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
  const topLevelDepartments = useMemo(
    () =>
      departments
        .filter((department) => !department.parentDepartmentId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [departments],
  );

  const childrenOf = (parentId: string) =>
    departments
      .filter((department) => department.parentDepartmentId === parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const chartWidth = Math.max(1120, topLevelDepartments.length * 388 - 28);

  function resetForm() {
    setEditing(null);
    setName("");
    setHeadEmployeeId("none");
    setParentDepartmentId("none");
    setUnitType("TEAM");
    setShowForm(false);
  }

  function openCreateTopLevel() {
    setEditing(null);
    setName("");
    setHeadEmployeeId("none");
    setParentDepartmentId("none");
    setUnitType("TEAM");
    setShowForm(true);
  }

  function openCreateUnder(parent: Department) {
    setEditing(null);
    setName("");
    setHeadEmployeeId("none");
    setParentDepartmentId(parent.id);
    setUnitType(parent.parentDepartmentId ? "FUNCTION" : "SUBTEAM");
    setShowForm(true);
  }

  function openEditDialog(department: Department) {
    setEditing(department);
    setName(department.name);
    setHeadEmployeeId(department.headEmployeeId ?? "none");
    setParentDepartmentId(department.parentDepartmentId ?? "none");
    setUnitType(department.unitType ?? "TEAM");
    setShowForm(true);
  }

  async function saveDepartment(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Department name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        headEmployeeId: headEmployeeId === "none" ? null : headEmployeeId,
        parentDepartmentId: parentDepartmentId === "none" ? null : parentDepartmentId,
        unitType,
      };
      const saved = editing
        ? await branchesApi.updateDepartment(editing.id, payload)
        : await branchesApi.createDepartment(payload);
      setDepartments((prev) =>
        (editing ? prev.map((row) => (row.id === saved.id ? saved : row)) : [...prev, saved]).sort(
          (a, b) => a.name.localeCompare(b.name),
        ),
      );
      toast.success(editing ? "Department updated" : "Department added");
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
    try {
      await branchesApi.deleteDepartment(dept.id);
      setDepartments((prev) => prev.filter((d) => d.id !== dept.id));
      toast.success("Department deleted successfully");
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
                <span className="truncate">{department.head ?? "Head not assigned"}</span>
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
                title="Add child unit"
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
                title="Edit unit"
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
                title="Delete unit"
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
          title="Departments"
          description="Department management is available only to Developer Admin."
        />
        <p className="text-sm text-muted-foreground">
          Contact Developer Admin if you need department changes.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Departments"
        description="Assign organization heads here. Leave reporting manager empty when creating accounts — the same person can head multiple units for leave approvals."
      />

      {loading && <LoadingState label="Loading organization chart" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && departments.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No organization units yet. Add a unit under the CEO to start the chart.
        </div>
      )}
      {!loading && departments.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-3 py-2 sm:px-4">
            <div>
              <p className="text-sm font-medium text-foreground">Organization chart</p>
              <p className="text-xs text-muted-foreground">
                <span className="md:hidden">Tap a unit to expand teams underneath.</span>
                <span className="hidden md:inline">
                  Drag the lower scrollbar to move across the chart.
                </span>
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="Zoom out"
                aria-label="Zoom out"
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
                title="Zoom in"
                aria-label="Zoom in"
                disabled={zoom >= 1.4}
                onClick={() => setZoom((value) => Math.min(1.4, Number((value + 0.1).toFixed(1))))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="Reset zoom"
                aria-label="Reset zoom"
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
              <div className="mx-auto flex max-w-xs items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Crown className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Leadership</p>
                  <p className="font-semibold text-foreground">Chief Executive Officer</p>
                </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="ml-auto shrink-0"
              title="Add organization unit under CEO"
              aria-label="Add organization unit under CEO"
              onClick={openCreateTopLevel}
            >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="mx-auto h-6 w-px bg-border" />
              <div className="relative mb-6 flex items-center justify-center">
                <div className="absolute inset-x-0 top-1/2 hidden h-px bg-border sm:block" />
                <span className="relative flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  <Network className="h-3.5 w-3.5" /> Organization units
                </span>
              </div>

              <div className="flex w-full max-w-full flex-col items-stretch gap-4 md:w-max md:flex-row md:items-start md:gap-7">
                {topLevelDepartments.map((department) => {
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
                              title="Edit unit"
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
                              title="Delete unit"
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
                          <span className="truncate">{department.head ?? "Head not assigned"}</span>
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
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reports under</TableHead>
                <TableHead>Head</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                  <TableCell>{d.head ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(d)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteDept(d)}
                        title="Delete Department"
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
          <div className="p-6 text-sm text-muted-foreground">No departments found.</div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? "Edit organization unit"
                : parentDepartmentId !== "none"
                  ? `Add under ${departments.find((item) => item.id === parentDepartmentId)?.name ?? "unit"}`
                  : "Add organization unit"}
            </DialogTitle>
            <DialogDescription>
              Assign an available employee as this unit&apos;s head. The same person may head
              multiple departments — leave approval follows each unit&apos;s head.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveDepartment} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Department name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
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
                      <SelectItem value="TEAM">Organization unit</SelectItem>
                      <SelectItem value="SUBTEAM">Team</SelectItem>
                      <SelectItem value="FUNCTION">Subteam / function</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Reports under</Label>
                  <Select value={parentDepartmentId} onValueChange={setParentDepartmentId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">CEO (top level)</SelectItem>
                      {departments
                        .filter((item) => item.id !== editing.id)
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">Adding under</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {parentDepartmentId === "none"
                    ? "Chief Executive Officer"
                    : departments.find((item) => item.id === parentDepartmentId)?.name}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Department head</Label>
              <Select value={headEmployeeId} onValueChange={setHeadEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No head assigned</SelectItem>
                  {headOptions.map((employee) => {
                    const otherHeaded = departments
                      .filter(
                        (dept) =>
                          dept.headEmployeeId === employee.employeeId &&
                          dept.id !== editing?.id,
                      )
                      .map((dept) => dept.name);
                    return (
                      <SelectItem key={employee.employeeId} value={employee.employeeId!}>
                        {employee.name}
                        {employee.employeeCode ? ` (${employee.employeeCode})` : ""}
                        {otherHeaded.length > 0
                          ? ` · also heads ${otherHeaded.join(", ")}`
                          : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Pick any active employee. Multi-department heads are supported.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {editing ? "Save department" : "Create department"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDept} onOpenChange={(open) => !open && setDeleteDept(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete department?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the department "{deleteDept?.name}"? This action
              cannot be undone and will fail if any employees are currently assigned to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (!deleteDept) return;
                void performDeleteDepartment(deleteDept);
                setDeleteDept(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
