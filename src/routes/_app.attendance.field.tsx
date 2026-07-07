import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { attendanceRecords } from "@/mock/data";
import { MapPin } from "lucide-react";

export const Route = createFileRoute("/_app/attendance/field")({
  component: FieldAttendancePage,
});

function FieldAttendancePage() {
  const rows = attendanceRecords.filter((a) => a.source === "Mobile GPS");
  return (
    <div>
      <PageHeader
        title="Field Attendance"
        description="GPS check-ins from sales, drivers and field staff. Location Flagged indicates the check-in fell outside an allowed geofence."
      />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Latitude</TableHead>
                <TableHead>Longitude</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.employeeName}</TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.punchIn ?? "—"}</TableCell>
                  <TableCell>{r.punchOut ?? "—"}</TableCell>
                  <TableCell>{r.latitude?.toFixed(4) ?? "—"}</TableCell>
                  <TableCell>{r.longitude?.toFixed(4) ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <MapPin className="mr-1 inline h-3 w-3" />
                    {r.address ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
