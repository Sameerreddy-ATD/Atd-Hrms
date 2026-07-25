import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import {
  ResponsiveListShell,
  MobileList,
  MobileListItem,
  MobileListHeader,
  MobileListFields,
  MobileListField,
  DesktopTable,
} from "@/components/common/ResponsiveList";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { biometricApi, branchesApi } from "@/services/api";
import type { BiometricDevice, Branch } from "@/types/domain";

export const Route = createFileRoute("/_app/settings/devices")({
  component: DeviceSettingsPage,
});

function DeviceSettingsPage() {
  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([biometricApi.list(), branchesApi.list()])
      .then(([deviceRows, branchRows]) => {
        setDevices(deviceRows);
        setBranches(branchRows);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const branchName = (branchId: string) =>
    branches.find((branch) => branch.id === branchId)?.name ?? branchId;

  return (
    <div>
      <PageHeader
        title="Device Settings"
        description="Configured biometric devices and sync status."
      />
      {loading && <LoadingState label="Loading device settings" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ResponsiveListShell>
        <MobileList>
          {devices.map((device) => (
            <MobileListItem key={device.id}>
              <MobileListHeader
                title={device.name}
                meta={device.serial}
                trailing={
                  <Badge variant="outline" className="shrink-0">
                    {device.status}
                  </Badge>
                }
              />
              <MobileListFields>
                <MobileListField label="Branch" value={branchName(device.branchId)} />
                <MobileListField label="Last Sync" value={device.lastSync} />
              </MobileListFields>
            </MobileListItem>
          ))}
        </MobileList>
        <DesktopTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell className="font-medium">{device.name}</TableCell>
                  <TableCell>{branchName(device.branchId)}</TableCell>
                  <TableCell className="font-mono text-xs">{device.serial}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{device.status}</Badge>
                  </TableCell>
                  <TableCell>{device.lastSync}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DesktopTable>
        {!loading && devices.length === 0 && (
          <div className="p-6">
            <EmptyState
              title="No devices configured"
              description="Biometric devices will appear here after they are registered."
            />
          </div>
        )}
      </ResponsiveListShell>
    </div>
  );
}
