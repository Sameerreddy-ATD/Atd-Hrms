import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { biometricDevices, branches } from "@/mock/data";

export const Route = createFileRoute("/_app/devices")({
  component: DevicesPage,
});

function DevicesPage() {
  return (
    <div>
      <PageHeader title="Biometric Devices" description="Registered thumb scanners across branches." />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {biometricDevices.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="font-mono text-xs">{d.serial}</TableCell>
                  <TableCell>{branches.find((b) => b.id === d.branchId)?.name}</TableCell>
                  <TableCell>
                    {d.status === "online" ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Online</Badge>
                    ) : (
                      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Offline</Badge>
                    )}
                  </TableCell>
                  <TableCell>{d.lastSync}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}