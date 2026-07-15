import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { LeaveRequest } from "@/mock/types";
import { employeesApi, leaveApi } from "@/services/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/leave/approvals")({
  component: LeaveApprovalsPage,
});

function LeaveApprovalsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [history, setHistory] = useState<LeaveRequest[]>([]);
  const [confirm, setConfirm] = useState<{ id: string; action: "Approved" | "Rejected" } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessChecked, setAccessChecked] = useState(false);
  const [canApprove, setCanApprove] = useState(false);

  useEffect(() => {
    if (!user) return;
    employeesApi
      .isReportingManager()
      .then((result) => {
        setCanApprove(result.isReportingManager);
        setAccessChecked(true);
        if (!result.isReportingManager) {
          void navigate({ to: "/dashboard", replace: true });
        }
      })
      .catch(() => {
        setAccessChecked(true);
        setCanApprove(false);
        void navigate({ to: "/dashboard", replace: true });
      });
  }, [navigate, user]);

  useEffect(() => {
    if (!canApprove) return;
    Promise.all([leaveApi.assignedApprovals("PENDING"), leaveApi.assignedApprovals()])
      .then(([pending, all]) => {
        setRows(pending);
        setHistory(all.filter((request) => request.status !== "Pending"));
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [canApprove]);

  async function apply() {
    if (!confirm) return;
    const { id, action } = confirm;
    const updated = action === "Approved" ? await leaveApi.approve(id) : await leaveApi.reject(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
    setHistory((prev) => [updated, ...prev.filter((request) => request.id !== id)]);
    toast.success(`Request ${action.toLowerCase()}`);
    setConfirm(null);
  }

  if (!accessChecked || !canApprove) {
    return (
      <div className="text-sm text-muted-foreground">Checking organization approval access...</div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Leave Approvals"
        description="Approve or reject leave assigned directly to you as the employee's organization head."
      />
      {loading && <p className="text-sm text-muted-foreground">Loading leave approvals...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <h2 className="mb-3 text-base font-semibold">Pending approvals</h2>
      <div className="space-y-3 md:hidden">
        {rows.map((leave) => (
          <Card key={leave.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{leave.employeeName}</p>
                  <p className="text-sm text-muted-foreground">{leave.type}</p>
                </div>
                <StatusBadge status={leave.status} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-3 text-sm">
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Dates</p>
                  <p className="font-medium">
                    {leave.from} to {leave.to}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Days</p>
                  <p className="font-medium">{leave.days}</p>
                </div>
              </div>
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">Reason</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{leave.reason || "-"}</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => setConfirm({ id: leave.id, action: "Rejected" })}
                >
                  Reject
                </Button>
                <Button onClick={() => setConfirm({ id: leave.id, action: "Approved" })}>
                  Approve
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && rows.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground md:hidden">
          No pending leave requests.
        </div>
      )}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
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
        {!loading && rows.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No pending leave requests.</div>
        )}
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">Leave approval history</h2>
      <div className="space-y-3 md:hidden">
        {history.map((leave) => (
          <Card key={leave.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{leave.employeeName}</p>
                  <p className="text-sm text-muted-foreground">{leave.type}</p>
                </div>
                <StatusBadge status={leave.status} />
              </div>
              <p className="mt-3 text-sm">
                {leave.from} to {leave.to} · {leave.days} day(s)
              </p>
              {leave.reason && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {leave.reason}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Updated {leave.updatedOn ? new Date(leave.updatedOn).toLocaleDateString() : "-"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && history.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground md:hidden">
          No completed leave approvals yet.
        </div>
      )}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
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
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((leave) => (
                <TableRow key={leave.id}>
                  <TableCell className="font-medium">{leave.employeeName}</TableCell>
                  <TableCell>{leave.type}</TableCell>
                  <TableCell>{leave.from}</TableCell>
                  <TableCell>{leave.to}</TableCell>
                  <TableCell>{leave.days}</TableCell>
                  <TableCell className="max-w-[280px] whitespace-normal text-sm text-muted-foreground">
                    {leave.reason}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={leave.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {leave.updatedOn ? new Date(leave.updatedOn).toLocaleDateString() : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && history.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No completed leave approvals yet.</div>
        )}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "Approved" ? "Approve leave request?" : "Reject leave request?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Approved leave is added to day logs only on days without attendance. If the employee
              punches in on a leave day, attendance will override the leave mark.
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
