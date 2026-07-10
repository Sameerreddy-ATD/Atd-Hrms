import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    leaveApi
      .list()
      .then(setLeaveRequests)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

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
                <TableHead>Status</TableHead>
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
                  <TableCell>
                    <StatusBadge status={l.status} />
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
