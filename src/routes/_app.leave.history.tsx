import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LeaveRequest } from "@/mock/types";
import { leaveApi } from "@/services/api";
import { Plus } from "lucide-react";

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
      {loading && <p className="text-sm text-muted-foreground">Loading leave history...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
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
    </div>
  );
}
