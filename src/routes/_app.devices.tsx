import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BiometricDevice, Branch } from "@/types/domain";
import { biometricApi, branchesApi } from "@/services/api";
import { formatBranchLocationLabel } from "@/lib/branch-label";
import { Fingerprint, Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/devices")({
  component: DevicesPage,
});

function DevicesPage() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BiometricDevice | null>(null);
  const [deleteDeviceTarget, setDeleteDeviceTarget] = useState<BiometricDevice | null>(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    branchId: "",
    deviceIp: "",
    port: "4370",
    location: "",
    status: "ACTIVE",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([biometricApi.list(), branchesApi.list()])
      .then(([deviceRows, branchRows]) => {
        setDevices(deviceRows);
        setBranches(branchRows);
        setForm((current) => ({
          ...current,
          branchId: current.branchId || branchRows[0]?.id || "",
        }));
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setEditing(null);
    setForm({
      name: "",
      code: "",
      branchId: branches[0]?.id ?? "",
      deviceIp: "",
      port: "4370",
      location: "",
      status: "ACTIVE",
    });
    setShowForm(false);
  }

  function openCreateDialog() {
    setEditing(null);
    setForm({
      name: "",
      code: "",
      branchId: branches[0]?.id ?? "",
      deviceIp: "",
      port: "4370",
      location: "",
      status: "ACTIVE",
    });
    setShowForm(true);
  }

  function openEditDialog(device: BiometricDevice) {
    setEditing(device);
    setForm({
      name: device.name,
      code: device.serial,
      branchId: device.branchId,
      deviceIp: device.deviceIp ?? "",
      port: String(device.port ?? 4370),
      location: device.location ?? "",
      status: device.rawStatus ?? (device.status === "online" ? "ACTIVE" : "INACTIVE"),
    });
    setShowForm(true);
  }

  async function saveDevice(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.code || !form.branchId) {
      toast.error(t("pages.devices.toastFieldsRequired"));
      return;
    }
    const payload = {
      name: form.name,
      code: form.code,
      branchId: form.branchId,
      deviceIp: form.deviceIp || undefined,
      port: form.port ? Number(form.port) : undefined,
      location: form.location || undefined,
      status: form.status,
    };
    try {
      const saved = editing
        ? await biometricApi.updateDevice(editing.id, payload)
        : await biometricApi.createDevice(payload);
      setDevices((prev) =>
        editing ? prev.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...prev],
      );
      toast.success(editing ? t("pages.devices.toastUpdated") : t("pages.devices.toastAdded"));
      resetForm();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function deactivateDevice(device: BiometricDevice) {
    if (!window.confirm(`Deactivate ${device.name}?`)) return;
    try {
      const updated = await biometricApi.deactivateDevice(device.id);
      setDevices((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      toast.success(t("pages.devices.toastDeactivated"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("pages.devices.title")}
        description={t("pages.devices.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/devices/mapping">
                <Fingerprint className="mr-2 h-4 w-4" /> {t("pages.devices.employeeMapping")}
              </Link>
            </Button>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" /> {t("pages.devices.addDevice")}
            </Button>
          </div>
        }
      />
      <div className="mb-4 rounded-xl border border-border/80 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {t("pages.devices.syncNotice")}
      </div>
      {loading && <LoadingState label={t("pages.loading.devices")} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-3 md:hidden">
        {devices.map((device) => (
          <Card key={device.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{device.name}</p>
                  <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                    {device.serial}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    device.status === "online"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
                  }
                >
                  {device.status === "online" ? t("pages.devices.online") : t("pages.devices.offline")}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Branch</p>
                  <p className="font-medium">
                    {branches.find((branch) => branch.id === device.branchId)?.name ?? "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">IP / Port</p>
                  <p className="break-all font-medium">
                    {device.deviceIp
                      ? `${device.deviceIp}${device.port ? `:${device.port}` : ""}`
                      : "-"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Last sync</p>
                  <p className="font-medium">{device.lastSync}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => openEditDialog(device)}>
                  <Pencil className="mr-2 h-4 w-4" /> {t("common.edit")}
                </Button>
                <Button
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={() => setDeleteDeviceTarget(device)}
                  disabled={device.status === "offline"}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> {t("pages.mapping.deactivate")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && devices.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground md:hidden">
          {t("pages.devices.empty")}
        </div>
      )}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>IP / Port</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="font-mono text-xs">{d.serial}</TableCell>
                  <TableCell>{branches.find((b) => b.id === d.branchId)?.name ?? "-"}</TableCell>
                  <TableCell>
                    {d.deviceIp ? `${d.deviceIp}${d.port ? `:${d.port}` : ""}` : "-"}
                  </TableCell>
                  <TableCell>
                    {d.status === "online" ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
                      >
                        {t("pages.devices.online")}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
                      >
                        {t("pages.devices.offline")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{d.lastSync}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(d)}>
                        <Pencil className="mr-2 h-4 w-4" /> {t("common.edit")}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-red-600 text-white hover:bg-red-700"
                        onClick={() => setDeleteDeviceTarget(d)}
                        disabled={d.status === "offline"}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> {t("pages.mapping.deactivate")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && devices.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">{t("pages.devices.empty")}</div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("pages.devices.edit") : t("pages.devices.add")}</DialogTitle>
            <DialogDescription>
              Configure branch mapping, connectivity, and operational status in one popup.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveDevice} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Device name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Serial / device code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select
                value={form.branchId}
                onValueChange={(branchId) => setForm((current) => ({ ...current, branchId }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {formatBranchLocationLabel(branch)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(status) => setForm((current) => ({ ...current, status }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Device IP</Label>
              <Input
                value={form.deviceIp}
                placeholder="192.168.1.100"
                onChange={(e) => setForm((current) => ({ ...current, deviceIp: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Port</Label>
              <Input
                value={form.port}
                onChange={(e) => setForm((current) => ({ ...current, port: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))}
              />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={resetForm}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">
                {editing ? t("pages.devices.updateDevice") : t("pages.devices.createDevice")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteDeviceTarget}
        onOpenChange={(open) => !open && setDeleteDeviceTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.devices.deactivateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDeviceTarget
                ? `This will mark ${deleteDeviceTarget.name} as inactive and remove it from active attendance capture.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (!deleteDeviceTarget) return;
                void deactivateDevice(deleteDeviceTarget);
                setDeleteDeviceTarget(null);
              }}
            >
              {t("pages.mapping.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
