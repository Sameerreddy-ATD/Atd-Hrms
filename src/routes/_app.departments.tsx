import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
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
import type { Department, User } from "@/mock/types";
import { useAuth } from "@/lib/auth";
import { branchesApi, employeesApi } from "@/services/api";
import { Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/departments")({
  component: DeptPage,
});

function DeptPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [headEmployeeId, setHeadEmployeeId] = useState("none");
  const [editing, setEditing] = useState<Department | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteDept, setDeleteDept] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    () =>
      employees.filter(
        (employee) => !!employee.employeeId,
      ),
    [employees],
  );

  function resetForm() {
    setEditing(null);
    setName("");
    setHeadEmployeeId("none");
    setShowForm(false);
  }

  function openCreateDialog() {
    setEditing(null);
    setName("");
    setHeadEmployeeId("none");
    setShowForm(true);
  }

  function openEditDialog(department: Department) {
    setEditing(department);
    setName(department.name);
    setHeadEmployeeId(department.headEmployeeId ?? "none");
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
        description="Developer Admin can add, edit, and delete departments."
        actions={
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" /> Add department
          </Button>
        }
      />

      {loading && <p className="text-sm text-muted-foreground">Loading departments...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table className="min-w-[620px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Head</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.head ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(d)}
                      >
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
            <DialogTitle>{editing ? "Edit department" : "Add department"}</DialogTitle>
            <DialogDescription>
              Update the department name and assign a department head from the user list.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveDepartment} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Department name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Department head</Label>
              <Select value={headEmployeeId} onValueChange={setHeadEmployeeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No head assigned</SelectItem>
                  {headOptions.map((employee) => (
                    <SelectItem key={employee.employeeId} value={employee.employeeId!}>
                      {employee.name}
                      {employee.employeeCode ? ` (${employee.employeeCode})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
