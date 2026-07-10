import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableToolbar } from "@/components/common/TableToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { attendanceApi } from "@/services/api";
import type { AttendanceRecord } from "@/mock/types";
import { useAuth } from "@/lib/auth";
import { punchTypeLabel } from "@/lib/attendance-labels";
import { ArrowRight, Check, X, FileClock, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/attendance/corrections")({
  component: AttendanceCorrectionsPage,
});

interface CorrectionRequestItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  date: string;
  punchTime: string;
  eventType: string;
  remarks: string;
  status: string;
  createdAt: string;
}

function AttendanceCorrectionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [requests, setRequests] = useState<CorrectionRequestItem[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [punchOutTarget, setPunchOutTarget] = useState<AttendanceRecord | null>(null);
  const [punchOutTime, setPunchOutTime] = useState("18:00");
  const [punchOutRemarks, setPunchOutRemarks] = useState("Missed punch-out corrected by HR");

  const canRecalculate = user && ["developer_admin", "main_admin", "hr"].includes(user.role);
  const canHrCorrect = user && ["developer_admin", "main_admin", "hr"].includes(user.role);

  const loadAlerts = useCallback(() => {
    setLoading(true);
    setError("");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const queryFrom = from || yesterdayStr;
    const queryTo = to || yesterdayStr;
    attendanceApi
      .list({ status: "Missed", from: queryFrom, to: queryTo })
      .then((records) =>
        setRows(
          records.filter(
            (record) => record.status.includes("Missed") || record.status.includes("Manual"),
          ),
        ),
      )
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    setFrom(yesterdayStr);
    setTo(yesterdayStr);
  }, []);

  const loadRequests = useCallback(() => {
    setLoadingReqs(true);
    attendanceApi
      .listCorrectionRequests()
      .then(setRequests)
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoadingReqs(false));
  }, []);

  useEffect(() => {
    loadAlerts();
    loadRequests();
  }, [loadAlerts, loadRequests]);

  async function submitPunchOut() {
    if (!punchOutTarget || !punchOutRemarks.trim()) return;
    setActionId(punchOutTarget.id);
    try {
      const punchTime = new Date(`${punchOutTarget.date}T${punchOutTime}:00+05:30`);
      const eventType = punchOutTarget.status.includes("Field") ? "FIELD_CHECK_OUT" : "OFFICE_OUT";
      await attendanceApi.hrPunchCorrection({
        employeeId: punchOutTarget.employeeId,
        date: new Date(punchOutTarget.date),
        punchTime,
        eventType,
        remarks: punchOutRemarks.trim(),
      });
      toast.success("Punch-out added and attendance updated");
      setPunchOutTarget(null);
      loadAlerts();
    } catch (err) {
      toast.error((err as Error).message || "Failed to add punch-out");
    } finally {
      setActionId("");
    }
  }

  async function recalculate(row: AttendanceRecord) {
    setActionId(row.id);
    try {
      const updated = await attendanceApi.recalculate(row.employeeId, row.date);
      setRows((current) => current.map((item) => (item.id === row.id ? updated : item)));
      toast.success("Attendance recalculated");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActionId("");
    }
  }

  async function handleApprove(id: string) {
    setActionId(id);
    try {
      await attendanceApi.approveCorrectionRequest(id);
      toast.success("Correction request approved");
      loadRequests();
      loadAlerts();
    } catch (err) {
      toast.error((err as Error).message || "Failed to approve request");
    } finally {
      setActionId("");
    }
  }

  async function handleReject(id: string) {
    setActionId(id);
    try {
      await attendanceApi.rejectCorrectionRequest(id);
      toast.success("Correction request rejected");
      loadRequests();
    } catch (err) {
      toast.error((err as Error).message || "Failed to reject request");
    } finally {
      setActionId("");
    }
  }

  const pendingRequests = requests.filter((r) => r.status === "PENDING");

  function openDayLogs(employeeId: string, employeeName: string, date: string) {
    sessionStorage.setItem(
      "attendance-day-log-selection",
      JSON.stringify({ employeeId, employeeName, from: date, to: date }),
    );
    void navigate({ to: "/attendance/locations" });
  }

  return (
    <div>
      <PageHeader
        title="Attendance Corrections"
        description="Review employee missed punch requests and system mismatch logs."
      />

      <Tabs defaultValue="requests" className="mt-6 w-full">
        <TabsList className="grid w-full max-w-[400px] grid-cols-2">
          <TabsTrigger value="requests" className="flex items-center gap-2">
            <FileClock className="h-4 w-4" />
            Pending Requests ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            System Alerts ({rows.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          {loadingReqs && (
            <p className="text-sm text-muted-foreground">Loading pending requests...</p>
          )}

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Requested Date</TableHead>
                    <TableHead>Punch Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Submitted On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        <div className="font-medium">{req.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{req.employeeId}</div>
                      </TableCell>
                      <TableCell>{req.date}</TableCell>
                      <TableCell>
                        {new Date(req.punchTime).toLocaleTimeString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-xs">{punchTypeLabel(req.eventType)}</TableCell>
                      <TableCell
                        className="max-w-xs truncate text-muted-foreground"
                        title={req.remarks}
                      >
                        {req.remarks}
                      </TableCell>
                      <TableCell>{new Date(req.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDayLogs(req.employeeId, req.employeeName, req.date)}
                          >
                            Open Day Logs <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={actionId === req.id}
                            onClick={() => handleApprove(req.id)}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={actionId === req.id}
                            onClick={() => handleReject(req.id)}
                          >
                            <X className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!loadingReqs && pendingRequests.length === 0 && (
              <div className="p-6">
                <EmptyState
                  title="No pending requests"
                  description="All employee missed punch requests have been reviewed."
                />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
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

          {loading && <p className="text-sm text-muted-foreground">Loading system alerts...</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Punch In</TableHead>
                    <TableHead>Punch Out</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{row.employeeId}</div>
                      </TableCell>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.punchIn ?? "-"}</TableCell>
                      <TableCell>{row.punchOut ?? "-"}</TableCell>
                      <TableCell>{row.source}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDayLogs(row.employeeId, row.employeeName, row.date)}
                          >
                            Open Day Logs <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </Button>
                          {canHrCorrect &&
                            (row.status.includes("Missed Punch") ||
                              row.status.includes("Missed Checkout")) && (
                              <Button
                                size="sm"
                                disabled={actionId === row.id}
                                onClick={() => setPunchOutTarget(row)}
                              >
                                Add punch out
                              </Button>
                            )}
                          {canRecalculate && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionId === row.id}
                              onClick={() => recalculate(row)}
                            >
                              Recalculate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!loading && rows.length === 0 && (
              <div className="p-6">
                <EmptyState
                  title="No system alerts"
                  description="No missed punch or mismatch items detected."
                />
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!punchOutTarget} onOpenChange={(open) => !open && setPunchOutTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add punch out</DialogTitle>
          </DialogHeader>
          {punchOutTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {punchOutTarget.employeeName} · {punchOutTarget.date}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="punch-out-time">Punch-out time</Label>
                <Input
                  id="punch-out-time"
                  type="time"
                  value={punchOutTime}
                  onChange={(e) => setPunchOutTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="punch-out-remarks">Remarks</Label>
                <Textarea
                  id="punch-out-remarks"
                  rows={3}
                  value={punchOutRemarks}
                  onChange={(e) => setPunchOutRemarks(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPunchOutTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitPunchOut} disabled={!punchOutRemarks.trim() || !!actionId}>
              Submit correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
