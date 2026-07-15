import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { attendanceApi, branchesApi } from "@/services/api";
import type { AttendanceRecord, Branch } from "@/mock/types";
import { useAuth } from "@/lib/auth";
import {
  MISSED_PUNCH_TYPE_OPTIONS,
  punchSourceLabel,
  punchTypeLabel,
} from "@/lib/attendance-labels";
import { formatStoredWorkedTime } from "@/lib/worked-time";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function todayDateInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function currentTimeInputValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

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

export const Route = createFileRoute("/_app/attendance/mine")({
  component: MyAttendancePage,
});

interface CorrectionRequestItem {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  punchTime: string;
  eventType: string;
  remarks: string;
  status: string;
  createdAt: string;
}

function MyAttendancePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [myRequests, setMyRequests] = useState<CorrectionRequestItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [eventType, setEventType] = useState<string>(MISSED_PUNCH_TYPE_OPTIONS[0]);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const maxDate = todayDateInputValue();
  const maxTime = date === maxDate ? currentTimeInputValue() : undefined;

  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setError("");
      try {
        const [attendanceRows, requestsList, branchRows] = await Promise.all([
          attendanceApi.listMine(user?.employeeId ?? ""),
          attendanceApi.listCorrectionRequests(),
          branchesApi.list(),
        ]);
        setRecords(attendanceRows);
        setMyRequests(requestsList || []);
        setBranches(branchRows || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [user?.employeeId],
  );

  useEffect(() => {
    if (user) void load();
  }, [load, user]);

  async function submitMissedPunch(event: React.FormEvent) {
    event.preventDefault();
    if (!user?.employeeId || !date || !time || reason.trim().length < 3) {
      toast.error("Enter a date, time, punch type, and a reason of at least 3 characters.");
      return;
    }
    const punchTime = new Date(`${date}T${time}:00+05:30`);
    if (date > maxDate || punchTime.getTime() > Date.now()) {
      toast.error("A missed punch must be for a past time.");
      return;
    }
    setSubmitting(true);
    try {
      await attendanceApi.requestCorrection({
        employeeId: user.employeeId,
        date: new Date(date),
        punchTime,
        eventType,
        remarks: reason.trim(),
      });
      setDate("");
      setTime("");
      setReason("");
      toast.success("Missed punch request submitted");
      await load(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    const refresh = () => void load(false);
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [load, user]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Attendance"
        description="Your attendance history and requests are shown here. Use the dashboard for check-in and check-out."
        actions={
          <Button asChild>
            <Link to="/leave/apply">Apply Leave</Link>
          </Button>
        }
      />

      {loading && (
        <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading your attendance data...
        </div>
      )}

      {error && (
        <div className="p-4 text-sm text-destructive bg-destructive/5 border border-destructive/10 rounded-lg">
          {error}
        </div>
      )}

      {!loading && !error && (
        <Tabs defaultValue="history" className="w-full space-y-6">
          <TabsList className="grid w-full max-w-[360px] grid-cols-2 rounded-lg bg-muted p-1">
            <TabsTrigger value="history" className="rounded-md py-1.5 text-xs font-semibold">
              Attendance Log
            </TabsTrigger>
            <TabsTrigger value="requests" className="rounded-md py-1.5 text-xs font-semibold">
              Missed Punch
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="space-y-4">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-foreground">
                    Attendance Log History
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    A list of your daily check-in and check-out summaries.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-2 p-3 md:hidden">
                  {records.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No attendance history records logged yet.
                    </p>
                  ) : (
                    records.map((record) => (
                      <div key={record.id} className="rounded-lg border bg-background p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{record.date}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{record.source}</p>
                          </div>
                          <StatusBadge status={record.status} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-md bg-muted/50 p-2">
                            <p className="text-muted-foreground">Check in</p>
                            <p className="mt-1 font-medium">{record.punchIn ?? "-"}</p>
                            <p className="mt-0.5 break-words text-[10px] text-muted-foreground">
                              {punchSourceLabel(
                                record.punchInSource,
                                record.punchInBranchId,
                                branches,
                              )}
                            </p>
                          </div>
                          <div className="rounded-md bg-muted/50 p-2">
                            <p className="text-muted-foreground">Check out</p>
                            <p className="mt-1 font-medium">{record.punchOut ?? "-"}</p>
                            <p className="mt-0.5 break-words text-[10px] text-muted-foreground">
                              {punchSourceLabel(
                                record.punchOutSource,
                                record.punchOutBranchId,
                                branches,
                              )}
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 text-xs font-semibold tabular-nums text-foreground">
                          Worked: {formatStoredWorkedTime(record.totalHours, record.workedMinutes)}
                        </p>
                        {(record.address || record.deviceName || record.branchMovementCount) && (
                          <p className="mt-2 break-words text-xs text-muted-foreground">
                            {record.branchMovementCount
                              ? `${record.branchMovementCount} branch movement(s)`
                              : (record.deviceName ?? record.address)}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Date</TableHead>
                        <TableHead>Daily Summary</TableHead>
                        <TableHead>Movement Details</TableHead>
                        <TableHead>Punch In (Click Location)</TableHead>
                        <TableHead>Punch Out (Click Location)</TableHead>
                        <TableHead>Worked Time</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center py-12 text-sm text-muted-foreground italic"
                          >
                            No attendance history records logged yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        records.map((a) => (
                          <TableRow key={a.id} className="hover:bg-muted/5 transition-colors">
                            <TableCell className="font-semibold text-xs whitespace-nowrap text-foreground">
                              {a.date}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div>{a.source}</div>
                              {a.source === "Mobile GPS" && a.actualBranchId && (
                                <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
                                  Near:{" "}
                                  {branches.find((b) => b.id === a.actualBranchId)?.name ||
                                    "Branch"}
                                </div>
                              )}
                              {a.source === "Mobile GPS" &&
                                a.fieldCheckInLatitude &&
                                a.fieldCheckOutLatitude &&
                                (() => {
                                  const dist = calculateDistance(
                                    a.fieldCheckInLatitude,
                                    a.fieldCheckInLongitude,
                                    a.fieldCheckOutLatitude,
                                    a.fieldCheckOutLongitude,
                                  );
                                  if (dist === null) return null;
                                  return (
                                    <a
                                      href={`https://www.google.com/maps/dir/?api=1&origin=${a.fieldCheckInLatitude},${a.fieldCheckInLongitude}&destination=${a.fieldCheckOutLatitude},${a.fieldCheckOutLongitude}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[10px] text-emerald-600 font-bold hover:underline block mt-0.5"
                                      title="View route mapping on Google Maps"
                                    >
                                      📏 {dist.toFixed(2)} km route
                                    </a>
                                  );
                                })()}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {a.branchMovementCount
                                ? `${a.branchMovementCount} branch movement(s)`
                                : (a.deviceName ?? a.address ?? "-")}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              <div>{a.punchIn ?? "-"}</div>
                              <div className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
                                {punchSourceLabel(a.punchInSource, a.punchInBranchId, branches)}
                              </div>
                              {a.punchInSource === "Mobile GPS" &&
                                a.fieldCheckInLatitude &&
                                a.fieldCheckInLongitude && (
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${a.fieldCheckInLatitude},${a.fieldCheckInLongitude}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-primary hover:underline block mt-0.5"
                                    title="Click to view check-in on Google Maps"
                                  >
                                    📍 {a.fieldCheckInLatitude.toFixed(4)},{" "}
                                    {a.fieldCheckInLongitude.toFixed(4)}
                                  </a>
                                )}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              <div>{a.punchOut ?? "-"}</div>
                              <div className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
                                {punchSourceLabel(a.punchOutSource, a.punchOutBranchId, branches)}
                              </div>
                              {a.punchOutSource === "Mobile GPS" &&
                                a.fieldCheckOutLatitude &&
                                a.fieldCheckOutLongitude && (
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${a.fieldCheckOutLatitude},${a.fieldCheckOutLongitude}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-primary hover:underline block mt-0.5"
                                    title="Click to view check-out on Google Maps"
                                  >
                                    📍 {a.fieldCheckOutLatitude.toFixed(4)},{" "}
                                    {a.fieldCheckOutLongitude.toFixed(4)}
                                  </a>
                                )}
                            </TableCell>
                            <TableCell className="text-xs font-semibold tabular-nums whitespace-nowrap">
                              {formatStoredWorkedTime(a.totalHours, a.workedMinutes)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={a.status} />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="space-y-4">
            <Card className="border-border shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <form onSubmit={submitMissedPunch} className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="missed-date">Date</Label>
                    <Input
                      id="missed-date"
                      type="date"
                      value={date}
                      max={maxDate}
                      onChange={(event) => setDate(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="missed-time">Time</Label>
                    <Input
                      id="missed-time"
                      type="time"
                      value={time}
                      max={maxTime}
                      onChange={(event) => setTime(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Punch type</Label>
                    <Select value={eventType} onValueChange={setEventType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MISSED_PUNCH_TYPE_OPTIONS.map((type) => (
                          <SelectItem key={type} value={type}>
                            {punchTypeLabel(type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="missed-reason">Reason</Label>
                    <Textarea
                      id="missed-reason"
                      rows={3}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      required
                    />
                  </div>
                  <div className="flex justify-end sm:col-span-2">
                    <Button className="w-full sm:w-auto" type="submit" disabled={submitting}>
                      {submitting ? "Submitting..." : "Submit missed punch"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-foreground">
                    Missed Punch Requests
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Correction request logs submitted for approval.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-2 p-3 md:hidden">
                  {myRequests.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No missed punch requests submitted yet.
                    </p>
                  ) : (
                    myRequests.map((request) => (
                      <div key={request.id} className="rounded-lg border bg-background p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">
                              {request.date} · {punchTypeLabel(request.eventType)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {new Date(request.punchTime).toLocaleTimeString("en-IN", {
                                timeZone: "Asia/Kolkata",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                          <StatusBadge
                            status={
                              request.status === "PENDING"
                                ? "Pending Approval"
                                : request.status === "APPROVED"
                                  ? "Present"
                                  : "Rejected Attendance"
                            }
                          />
                        </div>
                        <p className="mt-3 break-words text-xs text-muted-foreground">
                          {request.remarks}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Requested Date</TableHead>
                        <TableHead>Requested Time</TableHead>
                        <TableHead>Punch type</TableHead>
                        <TableHead>Reason / Remarks</TableHead>
                        <TableHead>Submitted On</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myRequests.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center py-12 text-xs text-muted-foreground italic"
                          >
                            No missed punch requests submitted yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        myRequests.map((r) => (
                          <TableRow
                            key={r.id}
                            className="hover:bg-muted/5 transition-colors text-xs"
                          >
                            <TableCell className="font-semibold text-foreground whitespace-nowrap">
                              {r.date}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {new Date(r.punchTime).toLocaleTimeString("en-IN", {
                                timeZone: "Asia/Kolkata",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </TableCell>
                            <TableCell className="text-xs">{punchTypeLabel(r.eventType)}</TableCell>
                            <TableCell
                              className="max-w-xs truncate text-muted-foreground"
                              title={r.remarks}
                            >
                              {r.remarks}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {new Date(r.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                status={
                                  r.status === "PENDING"
                                    ? "Pending Approval"
                                    : r.status === "APPROVED"
                                      ? "Present"
                                      : "Rejected Attendance"
                                }
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
