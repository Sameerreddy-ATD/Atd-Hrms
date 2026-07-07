import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StatCard } from "@/components/common/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { attendanceApi } from "@/services/api";
import { attendanceRecords, branches } from "@/mock/data";
import { useAuth } from "@/lib/auth";
import { MapPin, Fingerprint, LogIn, LogOut } from "lucide-react";

export const Route = createFileRoute("/_app/attendance/mine")({
  component: MyAttendancePage,
});

// Browser geolocation placeholder. Backend/mobile integration should
// replace this with an authenticated GPS + device-id capture.
async function getGeolocation(): Promise<GeolocationPosition | null> {
  return new Promise((res) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      (p) => res(p),
      () => res(null),
      { enableHighAccuracy: true, timeout: 5000 },
    );
  });
}

function MyAttendancePage() {
  const { user } = useAuth();
  const [pos, setPos] = useState<{ lat?: number; lng?: number }>({});
  const [loading, setLoading] = useState(false);

  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name ?? "—";

  async function checkIn() {
    setLoading(true);
    const p = await getGeolocation();
    if (p) setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
    await attendanceApi.checkIn({
      employeeId: user?.employeeId ?? "",
      latitude: p?.coords.latitude,
      longitude: p?.coords.longitude,
    });
    setLoading(false);
    toast.success("Checked in");
  }

  async function checkOut() {
    setLoading(true);
    await attendanceApi.checkOut("today");
    setLoading(false);
    toast.success("Checked out");
  }

  const isField = user && ["sales", "driver", "field_staff"].includes(user.role);

  return (
    <div>
      <PageHeader
        title="My Attendance"
        description="Your daily attendance across office and field."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today" value="Present" icon={Fingerprint} tone="success" />
        <StatCard label="Home Branch" value={branchName(user?.homeBranchId)} />
        <StatCard label="Attendance source" value={isField ? "Mobile GPS" : "Thumb Scanner"} />
        <StatCard label="Last punch" value="09:02 AM" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">
            {isField ? "Field GPS attendance" : "Office attendance"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isField ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-border p-4 text-sm">
                <p className="font-medium">Location</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Latitude</span>
                  <span>{pos.lat?.toFixed(4) ?? "—"}</span>
                  <span>Longitude</span>
                  <span>{pos.lng?.toFixed(4) ?? "—"}</span>
                  <span>Address</span>
                  <span>—</span>
                  <span>Device ID</span>
                  <span>—</span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  <MapPin className="mr-1 inline h-3 w-3" />
                  GPS is captured via browser API in demo mode. Replace with mobile SDK on
                  integration.
                </p>
              </div>
              <div className="flex flex-col justify-center gap-3 rounded-md border border-border p-4">
                <Button onClick={checkIn} disabled={loading}>
                  <LogIn className="mr-2 h-4 w-4" /> Check In
                </Button>
                <Button variant="outline" onClick={checkOut} disabled={loading}>
                  <LogOut className="mr-2 h-4 w-4" /> Check Out
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Punch in/out using the thumb scanner at your branch. Attendance will reflect here in
              real time once devices are synced.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Device / Location</TableHead>
                <TableHead>Punch In</TableHead>
                <TableHead>Punch Out</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendanceRecords.slice(0, 8).map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.date}</TableCell>
                  <TableCell>{a.source}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.deviceName ?? a.address ?? "—"}
                  </TableCell>
                  <TableCell>{a.punchIn ?? "—"}</TableCell>
                  <TableCell>{a.punchOut ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={a.status} />
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
