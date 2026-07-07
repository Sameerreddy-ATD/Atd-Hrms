import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { leaveRequests as initial } from "@/mock/data";
import type { LeaveRequest } from "@/mock/types";
import { leaveApi } from "@/services/api";

export const Route = createFileRoute("/_app/leave/approvals")({
  component: LeaveApprovalsPage,
});

function LeaveApprovalsPage() {
  const [rows, setRows] = useState<LeaveRequest[]>([...initial]);
  const [confirm, setConfirm] = useState<{ id: string; action: "Approved" | "Rejected" } | null>(
    null,
  );

  async function apply() {
    if (!confirm) return;
    const { id, action } = confirm;
    if (action === "Approved") await leaveApi.approve(id);
    else await leaveApi.reject(id);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: action } : r)));
    toast.success(`Request ${action.toLowerCase()}`);
    setConfirm(null);
  }

  return (
    <div>
      <PageHeader
        title="Leave Approvals"
        description="Approve or reject leave requests from your team."
      />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.employeeName}</TableCell>
                  <TableCell>{l.type}</TableCell>
                  <TableCell>{l.from}</TableCell>
                  <TableCell>{l.to}</TableCell>
                  <TableCell>{l.days}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                    {l.reason}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={l.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {l.status === "Pending" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirm({ id: l.id, action: "Rejected" })}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setConfirm({ id: l.id, action: "Approved" })}
                        >
                          Approve
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "Approved" ? "Approve leave request?" : "Reject leave request?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              The employee will be notified of your decision. This action is logged for audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={apply}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
