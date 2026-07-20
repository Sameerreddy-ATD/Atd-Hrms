import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { biometricApi, branchesApi, employeesApi } from "@/services/api";
import type { BiometricDevice, BiometricMapping, Branch, User } from "@/mock/types";
import { Pencil } from "lucide-react";

export const Route = createFileRoute("/_app/devices/mapping")({
  component: DeviceMappingPage,
});

function DeviceMappingPage() {
  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [mappings, setMappings] = useState<BiometricMapping[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [biometricUserId, setBiometricUserId] = useState("");
  const [editingMapping, setEditingMapping] = useState<BiometricMapping | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    setError("");
    Promise.all([
      biometricApi.list(),
      biometricApi.mappings(),
      branchesApi.list(),
      employeesApi.list(),
    ])
      .then(([deviceRows, mappingRows, branchRows, employeeRows]) => {
        setDevices(deviceRows);
        setMappings(mappingRows);
        setBranches(branchRows);
        setEmployees(employeeRows.filter((employee) => employee.employeeId));
        setEmployeeId(
          (current) =>
            current || employeeRows.find((employee) => employee.employeeId)?.employeeId || "",
        );
        setDeviceId((current) => current || deviceRows[0]?.id || "");
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }

  const branchName = (branchId?: string) =>
    branches.find((branch) => branch.id === branchId)?.name ?? "-";

  async function saveMapping(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !biometricUserId) {
      toast.error("Employee and biometric user ID are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        employeeId,
        biometricUserId,
        deviceId: deviceId || undefined,
        status: "ACTIVE",
      };
      const saved = editingMapping
        ? await biometricApi.updateMapping(editingMapping.id, payload)
        : await biometricApi.saveMapping(payload);
      setMappings((prev) => [saved, ...prev.filter((mapping) => mapping.id !== saved.id)]);
      toast.success(editingMapping ? "Biometric mapping updated" : "Biometric mapping saved");
      setBiometricUserId("");
      setEditingMapping(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivateMapping(mapping: BiometricMapping) {
    if (!window.confirm(`Deactivate mapping for ${mapping.employeeName ?? mapping.employeeId}?`)) {
      return;
    }
    try {
      const updated = await biometricApi.deactivateMapping(mapping.id);
      setMappings((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      toast.success("Mapping deactivated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function reactivateMapping(mapping: BiometricMapping) {
    try {
      const updated = await biometricApi.updateMapping(mapping.id, { status: "ACTIVE" });
      setMappings((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      toast.success("Mapping reactivated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Biometric Mapping"
        description="Map employee profiles to biometric device user IDs."
      />
      {loading && <LoadingState label="Loading biometric mappings" />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <form
        onSubmit={saveMapping}
        className="mb-6 grid gap-3 rounded-lg border border-border bg-card p-4 lg:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <div className="space-y-1.5">
          <Label>Employee</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger>
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((employee) => (
                <SelectItem key={employee.employeeId} value={employee.employeeId ?? ""}>
                  {employee.name} ({employee.employeeCode ?? employee.employeeId})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Device</Label>
          <Select value={deviceId} onValueChange={setDeviceId}>
            <SelectTrigger>
              <SelectValue placeholder="Select device" />
            </SelectTrigger>
            <SelectContent>
              {devices.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  {device.name} - {branchName(device.branchId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Biometric User ID</Label>
          <Input
            value={biometricUserId}
            onChange={(event) => setBiometricUserId(event.target.value)}
            placeholder="Device user ID"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={saving} className="w-full">
            {editingMapping ? "Update mapping" : "Save mapping"}
          </Button>
        </div>
        {editingMapping && (
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setEditingMapping(null);
                setBiometricUserId("");
              }}
            >
              Cancel edit
            </Button>
          </div>
        )}
      </form>

      <div className="grid gap-3 md:hidden">
        {mappings.map((mapping) => (
          <Card key={mapping.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{mapping.employeeName ?? mapping.employeeId}</p>
                  <p className="text-xs text-muted-foreground">
                    {mapping.employeeCode ?? mapping.employeeId}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${mapping.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}
                >
                  {mapping.status}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Branch</p>
                  <p className="font-medium">{branchName(mapping.homeBranchId)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Biometric ID</p>
                  <p className="break-all font-mono font-medium">{mapping.biometricUserId}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Device</p>
                  <p className="font-medium">
                    {mapping.deviceName ?? "-"}{" "}
                    {mapping.deviceCode ? `· ${mapping.deviceCode}` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingMapping(mapping);
                    setEmployeeId(mapping.employeeId);
                    setDeviceId(mapping.deviceId ?? "");
                    setBiometricUserId(mapping.biometricUserId);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </Button>
                {mapping.status === "INACTIVE" ? (
                  <Button
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => reactivateMapping(mapping)}
                  >
                    Reactivate
                  </Button>
                ) : (
                  <Button
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={() => deactivateMapping(mapping)}
                  >
                    Deactivate
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && mappings.length === 0 && (
        <div className="rounded-lg border bg-card p-6 md:hidden">
          <EmptyState
            title="No biometric mappings"
            description="Create a mapping above to connect an employee to a biometric device user ID."
          />
        </div>
      )}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Home Branch</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Biometric ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((mapping) => (
                <TableRow key={mapping.id}>
                  <TableCell>
                    <div className="font-medium">{mapping.employeeName ?? mapping.employeeId}</div>
                    <div className="text-xs text-muted-foreground">
                      {mapping.employeeCode ?? mapping.employeeId}
                    </div>
                  </TableCell>
                  <TableCell>{branchName(mapping.homeBranchId)}</TableCell>
                  <TableCell>
                    <div>{mapping.deviceName ?? "-"}</div>
                    <div className="text-xs text-muted-foreground">{mapping.deviceCode ?? ""}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{mapping.biometricUserId}</TableCell>
                  <TableCell>{mapping.status}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingMapping(mapping);
                          setEmployeeId(mapping.employeeId);
                          setDeviceId(mapping.deviceId ?? "");
                          setBiometricUserId(mapping.biometricUserId);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </Button>
                      {mapping.status === "INACTIVE" ? (
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => reactivateMapping(mapping)}
                        >
                          Reactivate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-red-600 text-white hover:bg-red-700"
                          onClick={() => deactivateMapping(mapping)}
                        >
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && mappings.length === 0 && (
          <div className="p-6">
            <EmptyState
              title="No biometric mappings"
              description="Create a mapping above to connect an employee to a biometric device user ID."
            />
          </div>
        )}
      </div>
    </div>
  );
}
