import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Branch, Holiday } from "@/mock/types";
import { branchesApi, reportsApi } from "@/services/api";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/holidays")({
  component: HolidaysPage,
});

function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [deleteHolidayTarget, setDeleteHolidayTarget] = useState<Holiday | null>(null);
  const [form, setForm] = useState({
    name: "",
    date: "",
    type: "Public" as Holiday["type"],
    branchId: "all",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([reportsApi.holidays(), branchesApi.list()])
      .then(([holidayRows, branchRows]) => {
        setHolidays(holidayRows);
        setBranches(branchRows);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name ?? "All branches";

  function resetForm() {
    setEditing(null);
    setForm({ name: "", date: "", type: "Public", branchId: "all" });
    setShowForm(false);
  }

  function openCreateDialog() {
    setEditing(null);
    setForm({ name: "", date: "", type: "Public", branchId: "all" });
    setShowForm(true);
  }

  function openEditDialog(holiday: Holiday) {
    setEditing(holiday);
    setForm({
      name: holiday.name,
      date: holiday.date,
      type: holiday.type,
      branchId: holiday.branchId ?? "all",
    });
    setShowForm(true);
  }

  async function saveHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.date) {
      toast.error("Holiday name and date are required");
      return;
    }
    const payload = {
      name: form.name,
      date: form.date,
      type: form.type,
      branchId: form.branchId === "all" ? undefined : form.branchId,
      status: "ACTIVE",
    };
    try {
      const saved = editing
        ? await reportsApi.updateHoliday(editing.id, payload)
        : await reportsApi.createHoliday(payload);
      setHolidays((prev) =>
        editing ? prev.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...prev],
      );
      toast.success(editing ? "Holiday updated" : "Holiday added");
      resetForm();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function deleteHoliday(holiday: Holiday) {
    try {
      await reportsApi.deleteHoliday(holiday.id);
      setHolidays((prev) => prev.filter((row) => row.id !== holiday.id));
      toast.success("Holiday deleted");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Holidays"
        description="Every active holiday listed here counts in attendance for its selected branch scope."
        actions={
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" /> Add holiday
          </Button>
        }
      />
      {loading && <p className="text-sm text-muted-foreground">Loading holidays...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-3 md:hidden">
        {holidays.map((holiday) => (
          <Card key={holiday.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{holiday.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" /> {holiday.date}
                  </p>
                </div>
                <Badge variant="outline">{holiday.type}</Badge>
              </div>
              <div className="mt-3 rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Applies to</p>
                <p className="text-sm font-medium">{branchName(holiday.branchId)}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => openEditDialog(holiday)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </Button>
                <Button
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={() => setDeleteHolidayTarget(holiday)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && holidays.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground md:hidden">
          No holidays found.
        </div>
      )}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Holiday</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{h.date}</TableCell>
                  <TableCell className="font-medium">{h.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{h.type}</Badge>
                  </TableCell>
                  <TableCell>{branchName(h.branchId)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(h)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        className="bg-red-600 text-white hover:bg-red-700"
                        onClick={() => setDeleteHolidayTarget(h)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && holidays.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No holidays found.</div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit holiday" : "Add holiday"}</DialogTitle>
            <DialogDescription>
              Every active entry counts as a holiday. Type is a classification label; branch scope
              controls which employees are affected.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveHoliday} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((current) => ({ ...current, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(type) =>
                  setForm((current) => ({ ...current, type: type as Holiday["type"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Public">Public</SelectItem>
                  <SelectItem value="Optional">Optional</SelectItem>
                  <SelectItem value="Restricted">Restricted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select
                value={form.branchId}
                onValueChange={(branchId) => setForm((current) => ({ ...current, branchId }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit">{editing ? "Update holiday" : "Create holiday"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteHolidayTarget}
        onOpenChange={(open) => !open && setDeleteHolidayTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete holiday?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteHolidayTarget
                ? `This will remove ${deleteHolidayTarget.name} from the holiday calendar.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (!deleteHolidayTarget) return;
                void deleteHoliday(deleteHolidayTarget);
                setDeleteHolidayTarget(null);
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
