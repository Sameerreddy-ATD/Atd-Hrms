import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatBranchLocationLabel } from "@/lib/branch-label";
import { Building2, MapPin, Pencil, Plus, Trash2, Warehouse } from "lucide-react";

export const Route = createFileRoute("/_app/branches")({
  component: BranchesPage,
});

const emptyForm = {
  name: "",
  code: "",
  address: "",
  city: "",
  latitude: "",
  longitude: "",
  attendanceRadiusMeters: "250",
  isHub: false,
};

function BranchesPage() {
  const { t } = useTranslation();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteBranchTarget, setDeleteBranchTarget] = useState<Branch | null>(null);
  const [form, setForm] = useState(emptyForm);
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
    setForm(emptyForm);
    setShowForm(false);
  }

  function openCreateDialog() {
    setEditing(null);
    setForm(emptyForm);
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
      isHub: Boolean(branch.isHub),
    });
    setShowForm(true);
  }

  async function saveBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.code || !form.address) {
      toast.error(
        form.isHub
          ? t("pages.branches.toastHubFieldsRequired")
          : t("pages.branches.toastBranchFieldsRequired"),
      );
      return;
    }
    try {
      if ((form.latitude && !form.longitude) || (!form.latitude && form.longitude)) {
        toast.error(t("pages.branches.toastLatLongBoth"));
        return;
      }
      const payload = {
        name: form.name,
        code: form.code,
        address: form.address,
        city: form.city,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        attendanceRadiusMeters: Number(form.attendanceRadiusMeters),
        isHub: form.isHub,
        status: "ACTIVE",
      };
      const saved = editing
        ? await branchesApi.update(editing.id, payload)
        : await branchesApi.create(payload);
      setBranches((prev) =>
        editing ? prev.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...prev],
      );
      toast.success(
        editing
          ? form.isHub
            ? t("pages.branches.toastHubUpdated")
            : t("pages.branches.toastBranchUpdated")
          : form.isHub
            ? t("pages.branches.toastHubAdded")
            : t("pages.branches.toastBranchAdded"),
      );
      resetForm();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function deleteBranch(branch: Branch) {
    try {
      await branchesApi.delete(branch.id);
      setBranches((prev) => prev.filter((row) => row.id !== branch.id));
      toast.success(
        branch.isHub
          ? t("pages.branches.toastHubDeactivated")
          : t("pages.branches.toastBranchDeactivated"),
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("pages.branches.title")}
        description={t("pages.branches.subtitle")}
        actions={
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" /> {t("pages.branches.addBranch")}
          </Button>
        }
      />
      {loading && <LoadingState label={t("pages.loading.branches")} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {branches.map((b) => (
          <Card key={b.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {b.code}
                    </p>
                    {b.isHub && (
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Hub
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-lg font-semibold">
                    {formatBranchLocationLabel(b)}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {b.address}
                  </p>
                  {(b.latitude != null || b.longitude != null) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Location set · {b.attendanceRadiusMeters ?? 250}m radius
                    </p>
                  )}
                </div>
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  {b.isHub ? <Warehouse className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => openEditDialog(b)}>
                  <Pencil className="mr-2 h-4 w-4" /> {t("common.edit")}
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={() => setDeleteBranchTarget(b)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> {t("pages.branches.deactivate")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && branches.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("pages.branches.empty")}</p>
      )}

      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? form.isHub
                  ? t("pages.branches.editHub")
                  : t("pages.branches.editBranch")
                : form.isHub
                  ? t("pages.branches.addHub")
                  : t("pages.branches.addBranch")}
            </DialogTitle>
            <DialogDescription>
              Maintain identity, location, and code. Mark parking hubs with the checkbox — mobile
              attendance near the pin shows as Name - Hub.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveBranch} className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3 sm:col-span-2">
              <Checkbox
                id="branch-is-hub"
                checked={form.isHub}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, isHub: checked === true }))
                }
              />
              <div className="space-y-0.5">
                <Label htmlFor="branch-is-hub" className="cursor-pointer font-medium">
                  Parking hub
                </Label>
                <p className="text-xs text-muted-foreground">
                  Treat this location as a parking hub. Attendance nearby will show as{" "}
                  <span className="font-medium text-foreground">Name - Hub</span>.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{form.isHub ? "Hub name" : "Name"}</Label>
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
                {t("common.cancel")}
              </Button>
              <Button type="submit">
                {editing
                  ? form.isHub
                    ? t("pages.branches.updateHub")
                    : t("pages.branches.updateBranch")
                  : form.isHub
                    ? t("pages.branches.createHub")
                    : t("pages.branches.createBranch")}
              </Button>
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
            <AlertDialogTitle>
              {deleteBranchTarget?.isHub
                ? t("pages.branches.deactivateHubTitle")
                : t("pages.branches.deactivateBranchTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBranchTarget
                ? `This will deactivate ${deleteBranchTarget.name} and remove it from active ${
                    deleteBranchTarget.isHub ? "hub" : "branch"
                  } operations.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (!deleteBranchTarget) return;
                void deleteBranch(deleteBranchTarget);
                setDeleteBranchTarget(null);
              }}
            >
              {t("pages.branches.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
