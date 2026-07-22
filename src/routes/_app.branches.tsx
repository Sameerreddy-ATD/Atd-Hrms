import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import type { Branch } from "@/types/domain";
import { branchesApi } from "@/services/api";
import { Building2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/branches")({
  component: BranchesPage,
});

function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteBranchTarget, setDeleteBranchTarget] = useState<Branch | null>(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    latitude: "",
    longitude: "",
    attendanceRadiusMeters: "250",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    branchesApi
      .list()
      .then(setBranches)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setEditing(null);
    setForm({
      name: "",
      code: "",
      address: "",
      city: "",
      latitude: "",
      longitude: "",
      attendanceRadiusMeters: "250",
    });
    setShowForm(false);
  }

  function openCreateDialog() {
    setEditing(null);
    setForm({
      name: "",
      code: "",
      address: "",
      city: "",
      latitude: "",
      longitude: "",
      attendanceRadiusMeters: "250",
    });
    setShowForm(true);
  }

  function openEditDialog(branch: Branch) {
    setEditing(branch);
    setForm({
      name: branch.name,
      code: branch.code,
      address: branch.address,
      city: branch.city ?? "",
      latitude: branch.latitude?.toString() ?? "",
      longitude: branch.longitude?.toString() ?? "",
      attendanceRadiusMeters: String(branch.attendanceRadiusMeters ?? 250),
    });
    setShowForm(true);
  }

  async function saveBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.code || !form.address) {
      toast.error("Branch name, code and address are required");
      return;
    }
    try {
      if ((form.latitude && !form.longitude) || (!form.latitude && form.longitude)) {
        toast.error("Enter both latitude and longitude");
        return;
      }
      const payload = {
        ...form,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        attendanceRadiusMeters: Number(form.attendanceRadiusMeters),
        status: "ACTIVE",
      };
      const saved = editing
        ? await branchesApi.update(editing.id, payload)
        : await branchesApi.create(payload);
      setBranches((prev) =>
        editing ? prev.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...prev],
      );
      toast.success(editing ? "Branch updated" : "Branch added");
      resetForm();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function deleteBranch(branch: Branch) {
    try {
      await branchesApi.delete(branch.id);
      setBranches((prev) => prev.filter((row) => row.id !== branch.id));
      toast.success("Branch deactivated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Branches"
        description="Add and maintain company branch locations."
        actions={
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" /> Add branch
          </Button>
        }
      />
      {loading && <LoadingState label="Loading branches" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {branches.map((b) => (
          <Card key={b.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{b.code}</p>
                  <p className="mt-1 truncate text-lg font-semibold">{b.name}</p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {b.address}
                  </p>
                </div>
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  <Building2 className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => openEditDialog(b)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={() => setDeleteBranchTarget(b)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Deactivate
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && branches.length === 0 && (
        <p className="text-sm text-muted-foreground">No branches found.</p>
      )}

      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit branch" : "Add branch"}</DialogTitle>
            <DialogDescription>
              Maintain branch identity, location, and code in a single popup.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveBranch} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>City</Label>
              <Input
                value={form.city}
                onChange={(e) => setForm((current) => ({ ...current, city: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Latitude</Label>
              <Input
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => setForm((current) => ({ ...current, latitude: e.target.value }))}
                placeholder="17.4391592"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Longitude</Label>
              <Input
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => setForm((current) => ({ ...current, longitude: e.target.value }))}
                placeholder="78.3947783"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Mobile attendance radius (meters)</Label>
              <Input
                type="number"
                min="25"
                max="5000"
                value={form.attendanceRadiusMeters}
                onChange={(e) =>
                  setForm((current) => ({ ...current, attendanceRadiusMeters: e.target.value }))
                }
              />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit">{editing ? "Update branch" : "Create branch"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteBranchTarget}
        onOpenChange={(open) => !open && setDeleteBranchTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate branch?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBranchTarget
                ? `This will deactivate ${deleteBranchTarget.name} and remove it from active branch operations.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (!deleteBranchTarget) return;
                void deleteBranch(deleteBranchTarget);
                setDeleteBranchTarget(null);
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
