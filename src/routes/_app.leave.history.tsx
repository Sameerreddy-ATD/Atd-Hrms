import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LeaveRequest } from "@/types/domain";
import { leaveApi } from "@/services/api";
import { CalendarDays, Clock3, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_app/leave/history")({
  component: LeaveHistoryPage,
});

function LeaveHistoryPage() {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    leaveApi
      .mine()
      .then(setLeaveRequests)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  async function cancelLeave(request: LeaveRequest) {
    if (!window.confirm("Cancel the remaining current and future dates in this leave request?"))
      return;
    setCancellingId(request.id);
    try {
      const updated = await leaveApi.cancel(request.id);
      setLeaveRequests((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      toast.success("Leave cancellation recorded");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Leave History"
        description="All your submitted leave requests and their current status."
      />
      {loading && <LoadingState label="Loading leave history" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {leaveRequests
          .filter((leave) => leave.type === "Sick Leave" && leave.medicalDocumentDueAt)
          .map((leave) => (
            <MedicalDocumentCard
              key={`medical-${leave.id}`}
              leave={leave}
              onUpdated={(updated) =>
                setLeaveRequests((rows) =>
                  rows.map((row) => (row.id === updated.id ? updated : row)),
                )
              }
            />
          ))}
      </div>
      <div className="space-y-3 md:hidden">
        {leaveRequests.map((leave) => (
          <Card key={leave.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{leave.type}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    {leave.from} to {leave.to}
                  </p>
                </div>
                <StatusBadge status={leave.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Days</p>
                  <p className="font-medium">{leave.days}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Applied</p>
                  <p className="font-medium">{leave.appliedOn}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Approver</p>
                  <p className="break-words font-medium">{leave.approverName ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Progress</p>
                  <p className="break-words font-medium">{leave.workflowStatus ?? leave.status}</p>
                </div>
              </div>
              {(leave.cancelledDates?.length ?? 0) > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Cancelled: {leave.cancelledDates?.join(", ")}
                </p>
              )}
              {["Pending", "Approved"].includes(leave.status) && (
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  disabled={cancellingId === leave.id}
                  onClick={() => cancelLeave(leave)}
                >
                  {cancellingId === leave.id ? "Cancelling..." : "Cancel leave"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Approver</TableHead>
                <TableHead>Approval progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaveRequests.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.type}</TableCell>
                  <TableCell>{l.from}</TableCell>
                  <TableCell>{l.to}</TableCell>
                  <TableCell>{l.days}</TableCell>
                  <TableCell>{l.appliedOn}</TableCell>
                  <TableCell>{l.approverName ?? "-"}</TableCell>
                  <TableCell className="max-w-[260px] text-sm text-muted-foreground">
                    {l.workflowStatus ?? l.status}
                    {(l.cancelledDates?.length ?? 0) > 0 && (
                      <div className="mt-1 text-xs">Cancelled: {l.cancelledDates?.join(", ")}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={l.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {["Pending", "Approved"].includes(l.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancellingId === l.id}
                        onClick={() => cancelLeave(l)}
                      >
                        {cancellingId === l.id ? "Cancelling..." : "Cancel leave"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && leaveRequests.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No leave requests found.</div>
        )}
      </div>
      {!loading && leaveRequests.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground md:hidden">
          No leave requests found.
        </div>
      )}
    </div>
  );
}

function MedicalDocumentCard({
  leave,
  onUpdated,
}: {
  leave: LeaveRequest;
  onUpdated: (leave: LeaveRequest) => void;
}) {
  const [url, setUrl] = useState(leave.medicalDocumentUrl ?? "");
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, new Date(leave.medicalDocumentDueAt!).getTime() - now);
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  async function save() {
    if (!url.trim()) return toast.error("Enter the shareable Google Drive link");
    setSaving(true);
    try {
      const updated = await leaveApi.updateMedicalDocument(leave.id, url.trim());
      onUpdated(updated);
      toast.success("Medical document link saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-amber-200 dark:border-amber-900/50">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Sick Leave medical report</p>
            <p className="text-sm text-muted-foreground">
              {leave.from} to {leave.to}
            </p>
          </div>
          <div className="rounded-md bg-amber-50 px-3 py-2 dark:bg-amber-950/30 text-right">
            <p className="flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300">
              <Clock3 className="h-3.5 w-3.5" /> Time remaining
            </p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-amber-950 dark:text-amber-200">
              {remaining ? `${days}d ${hours}h ${minutes}m ${seconds}s` : "Deadline passed"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            value={url}
            placeholder="Google Drive link shared with anyone who has the link"
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button onClick={save} disabled={saving} className="sm:shrink-0">
            {saving ? "Saving..." : "Save link"}
          </Button>
          {leave.medicalDocumentUrl && (
            <Button asChild variant="outline" size="icon" title="Open medical document">
              <a href={leave.medicalDocumentUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The link must allow anyone with the link to view the report. HR and your organization head
          can review it.
        </p>
      </CardContent>
    </Card>
  );
}
