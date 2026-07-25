import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableToolbar } from "@/components/common/TableToolbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AttendanceRecord } from "@/types/domain";
import { attendanceApi } from "@/services/api";
import { punchSourceLabel } from "@/lib/attendance-labels";
import { formatStoredWorkedTime } from "@/lib/worked-time";
import {
  ResponsiveListShell,
  MobileList,
  MobileListItem,
  MobileListHeader,
  MobileListFields,
  MobileListField,
  MobileListActions,
  DesktopTable,
} from "@/components/common/ResponsiveList";
import { ArrowRight, MapPin } from "lucide-react";

function calculateDistance(
  lat1?: number,
  lon1?: number,
  lat2?: number,
  lon2?: number,
): number | null {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined)
    return null;
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // distance in km
}

export const Route = createFileRoute("/_app/attendance/field")({
  component: FieldAttendancePage,
});

function FieldAttendancePage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    attendanceApi
      .listField({ from, to })
      .then((attendanceRows) => {
        setRows(attendanceRows);
        if (!from && !to && attendanceRows.length > 0) {
          const dates = attendanceRows.map((r) => r.date).filter(Boolean);
          if (dates.length > 0) {
            dates.sort();
            setFrom(dates[0]);
            setTo(dates[dates.length - 1]);
          }
        }
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [from, to]);

  function openDayLogs(row: AttendanceRecord) {
    sessionStorage.setItem(
      "attendance-day-log-selection",
      JSON.stringify({
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        from: row.date,
        to: row.date,
      }),
    );
    void navigate({ to: "/attendance/locations" });
  }

  return (
    <div>
      <PageHeader
        title="Field Attendance"
        description="GPS attendance recorded outside office locations only."
      />
      <TableToolbar>
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => {
            const nextFrom = e.target.value;
            setFrom(nextFrom);
            if (to && nextFrom && to < nextFrom) setTo(nextFrom);
          }}
          className="sm:w-auto"
          aria-label="From date"
        />
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
          className="sm:w-auto"
          aria-label="To date"
        />
      </TableToolbar>
      {loading && <LoadingState label="Loading field attendance" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ResponsiveListShell>
        <MobileList>
          {rows.map((r) => {
            const dist =
              r.fieldCheckInLatitude && r.fieldCheckOutLatitude
                ? calculateDistance(
                    r.fieldCheckInLatitude,
                    r.fieldCheckInLongitude,
                    r.fieldCheckOutLatitude,
                    r.fieldCheckOutLongitude,
                  )
                : null;
            return (
              <MobileListItem key={r.id} intrinsicSize="240px">
                <MobileListHeader
                  title={r.employeeName}
                  meta={r.employeeId}
                  trailing={<StatusBadge status={r.status} />}
                />
                <MobileListFields>
                  <MobileListField label="Date" value={r.date} />
                  <MobileListField
                    label="Worked Time"
                    value={formatStoredWorkedTime(r.totalHours, r.workedMinutes)}
                  />
                  <MobileListField
                    label="Check In"
                    value={
                      <>
                        <span>{r.punchIn ?? "-"}</span>
                        <span className="mt-0.5 block text-[11px] font-semibold text-muted-foreground">
                          {punchSourceLabel(r.punchInSource, r.punchInBranchId, [])}
                        </span>
                        {r.fieldCheckInLatitude && r.fieldCheckInLongitude ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${r.fieldCheckInLatitude},${r.fieldCheckInLongitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <MapPin className="h-3 w-3 shrink-0 text-red-500" />
                            {r.fieldCheckInLatitude.toFixed(4)}, {r.fieldCheckInLongitude.toFixed(4)}
                          </a>
                        ) : null}
                      </>
                    }
                  />
                  <MobileListField
                    label="Check Out"
                    value={
                      <>
                        <span>{r.punchOut ?? "-"}</span>
                        <span className="mt-0.5 block text-[11px] font-semibold text-muted-foreground">
                          {punchSourceLabel(r.punchOutSource, r.punchOutBranchId, [])}
                        </span>
                        {r.fieldCheckOutLatitude && r.fieldCheckOutLongitude ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${r.fieldCheckOutLatitude},${r.fieldCheckOutLongitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <MapPin className="h-3 w-3 shrink-0 text-red-500" />
                            {r.fieldCheckOutLatitude.toFixed(4)},{" "}
                            {r.fieldCheckOutLongitude.toFixed(4)}
                          </a>
                        ) : null}
                      </>
                    }
                  />
                  <MobileListField
                    className="col-span-2"
                    label="Distance"
                    value={
                      dist != null && r.fieldCheckInLatitude && r.fieldCheckOutLatitude ? (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&origin=${r.fieldCheckInLatitude},${r.fieldCheckInLongitude}&destination=${r.fieldCheckOutLatitude},${r.fieldCheckOutLongitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                        >
                          {dist.toFixed(2)} km
                        </a>
                      ) : (
                        "-"
                      )
                    }
                  />
                </MobileListFields>
                <MobileListActions>
                  <Button
                    className="w-full"
                    size="sm"
                    variant="outline"
                    onClick={() => openDayLogs(r)}
                  >
                    Open Day Logs <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </MobileListActions>
              </MobileListItem>
            );
          })}
        </MobileList>
        <DesktopTable>
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Worked Time</TableHead>
                <TableHead>Check In-Out Distance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div>{r.employeeName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.employeeId}</div>
                  </TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>
                    <div>{r.punchIn ?? "-"}</div>
                    <div className="mt-0.5 text-xs font-semibold text-muted-foreground">
                      {punchSourceLabel(r.punchInSource, r.punchInBranchId, [])}
                    </div>
                    {r.fieldCheckInLatitude && r.fieldCheckInLongitude ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${r.fieldCheckInLatitude},${r.fieldCheckInLongitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                        title="Click to view check-in on Google Maps"
                      >
                        <MapPin className="h-3 w-3 text-red-500 shrink-0" />
                        {r.fieldCheckInLatitude.toFixed(4)}, {r.fieldCheckInLongitude.toFixed(4)}
                      </a>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <div>{r.punchOut ?? "-"}</div>
                    <div className="mt-0.5 text-xs font-semibold text-muted-foreground">
                      {punchSourceLabel(r.punchOutSource, r.punchOutBranchId, [])}
                    </div>
                    {r.fieldCheckOutLatitude && r.fieldCheckOutLongitude ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${r.fieldCheckOutLatitude},${r.fieldCheckOutLongitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                        title="Click to view check-out on Google Maps"
                      >
                        <MapPin className="h-3 w-3 text-red-500 shrink-0" />
                        {r.fieldCheckOutLatitude.toFixed(4)}, {r.fieldCheckOutLongitude.toFixed(4)}
                      </a>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">
                    {formatStoredWorkedTime(r.totalHours, r.workedMinutes)}
                  </TableCell>
                  <TableCell>
                    {r.fieldCheckInLatitude && r.fieldCheckOutLatitude
                      ? (() => {
                          const dist = calculateDistance(
                            r.fieldCheckInLatitude,
                            r.fieldCheckInLongitude,
                            r.fieldCheckOutLatitude,
                            r.fieldCheckOutLongitude,
                          );
                          if (dist === null) return "-";
                          return (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&origin=${r.fieldCheckInLatitude},${r.fieldCheckInLongitude}&destination=${r.fieldCheckOutLatitude},${r.fieldCheckOutLongitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                              title="Click to view check-in to check-out route on Google Maps"
                            >
                              {dist.toFixed(2)} km
                            </a>
                          );
                        })()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => openDayLogs(r)}>
                      Open Day Logs <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DesktopTable>
        {!loading && rows.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">
            No field attendance records found.
          </div>
        )}
      </ResponsiveListShell>
    </div>
  );
}
