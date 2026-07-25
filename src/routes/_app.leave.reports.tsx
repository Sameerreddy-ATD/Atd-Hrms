import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { leaveApi } from "@/services/api";
import type { LeaveRequest } from "@/types/domain";
import { downloadCsv } from "@/lib/csv";
import { useAuth } from "@/lib/auth";
import {
  BadgeCheck,
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/leave/reports")({
  component: LeaveReportsPage,
});

function LeaveReportsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const canVerifyMedicalReport = ["developer_admin", "main_admin", "hr"].includes(user?.role ?? "");

  const verifyMedicalReport = async (id: string) => {
    setVerifyingId(id);
    try {
      const updated = await leaveApi.verifyMedicalDocument(id);
      setRows((current) => current.map((row) => (row.id === id ? updated : row)));
      toast.success("Medical report marked as verified");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setVerifyingId(null);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    leaveApi
      .list()
      .then(setRows)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const leaveTypes = useMemo(
    () => [...new Set(rows.map((row) => row.type))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const statusMatches =
        statusFilter === "all" || row.status.toUpperCase() === statusFilter.toUpperCase();
      const typeMatches = typeFilter === "all" || row.type === typeFilter;
      const searchMatches =
        !term ||
        [row.employeeName, row.employeeId, row.type, row.approverName, row.reason, row.decisionNote]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      return statusMatches && typeMatches && searchMatches;
    });
  }, [rows, search, statusFilter, typeFilter]);

  const pendingCount = rows.filter((row) => row.status === "Pending").length;
  const approvedCount = rows.filter((row) => row.status === "Approved").length;
  const rejectedCount = rows.filter((row) => row.status === "Rejected").length;
  const cancelledCount = rows.filter((row) => row.status === "Cancelled").length;

  const csvRows = filteredRows.map((row) => ({
    employee: row.employeeName,
    employeeId: row.employeeId,
    organizationApprover: row.approverName ?? row.managerName ?? "",
    leaveType: row.type,
    from: row.from,
    to: row.to,
    days: row.days,
    status: row.status,
    workflow: row.workflowStatus ?? row.status,
    appliedOn: row.appliedOn,
    updatedOn: row.updatedOn ?? "",
    reviewedBy: row.reviewerName ?? "",
    reviewedAt: row.reviewedAt ?? "",
    decisionNote: row.decisionNote ?? "",
    reason: row.reason,
    medicalDocument: row.medicalDocumentUrl ?? "",
    medicalDocumentDue: row.medicalDocumentDueAt ?? "",
    medicalDocumentVerified: row.medicalDocumentVerifiedAt ?? "",
  }));

  return (
    <div>
      <PageHeader
        title="Leave Tracking"
        description="Organization-wide, read-only register of leave requests, assigned approvers, decisions, and medical-report verification."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {user?.role !== "ceo" && (
              <Button asChild size="sm" variant="outline">
                <Link to="/leave/approvals">
                  <BadgeCheck className="mr-2 h-4 w-4" /> Approval queue
                </Link>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={filteredRows.length === 0}
              onClick={() => downloadCsv("leave-tracking.csv", csvRows)}
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        }
      />
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <LoadingState label="Loading leave requests" />}
      {!loading && (
        <>
          <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <TrackingMetric icon={Clock3} label="Pending" value={pendingCount} />
            <TrackingMetric icon={CheckCircle2} label="Approved" value={approvedCount} />
            <TrackingMetric icon={XCircle} label="Rejected" value={rejectedCount} />
            <TrackingMetric icon={Ban} label="Cancelled" value={cancelledCount} />
          </section>
          <section className="mb-4 grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_200px]">
            <div className="relative sm:col-span-2 xl:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee, approver, type, or reason"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter leave type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All leave types</SelectItem>
                {leaveTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
        </>
      )}
      <div className="space-y-3 md:hidden">
        {filteredRows.map((row) => (
          <Card key={row.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{row.employeeName}</p>
                  <p className="text-xs text-muted-foreground">{row.employeeId}</p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-3 text-sm font-medium">{row.type}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4" /> {row.from} to {row.to} · {row.days} day(s)
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Approver</p>
                  <p className="break-words font-medium">
                    {row.approverName ?? row.managerName ?? "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Flow</p>
                  <p className="break-words font-medium">{row.workflowStatus ?? row.status}</p>
                </div>
              </div>
              {row.reason && (
                <div className="mt-3 rounded-md bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Reason</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                    {row.reason}
                  </p>
                </div>
              )}
              {row.status !== "Pending" && (
                <div className="mt-3 border-t pt-3 text-sm">
                  <p className="text-xs text-muted-foreground">Decision</p>
                  <p className="font-medium">{row.reviewerName ?? "System"}</p>
                  {row.decisionNote && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                      {row.decisionNote}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.reviewedAt
                      ? new Date(row.reviewedAt).toLocaleString()
                      : (row.updatedOn ?? "-")}
                  </p>
                </div>
              )}
              {row.type === "Sick Leave" && (
                <div className="mt-3 rounded-md border p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Medical report</p>
                  {row.medicalDocumentUrl ? (
                    <a
                      href={row.medicalDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary underline"
                    >
                      Open report
                    </a>
                  ) : (
                    <p className="font-medium text-amber-700 dark:text-amber-400">Not submitted</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.medicalDocumentVerifiedAt
                      ? "Verified by HR"
                      : `Due ${row.medicalDocumentDueAt ? new Date(row.medicalDocumentDueAt).toLocaleString() : "-"}`}
                  </p>
                  {canVerifyMedicalReport &&
                    row.medicalDocumentUrl &&
                    !row.medicalDocumentVerifiedAt && (
                      <Button
                        className="mt-3 w-full"
                        size="sm"
                        variant="outline"
                        disabled={verifyingId === row.id}
                        onClick={() => void verifyMedicalReport(row.id)}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {verifyingId === row.id ? "Verifying..." : "Mark verified"}
                      </Button>
                    )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {!loading && filteredRows.length === 0 && (
        <div className="rounded-lg border bg-card p-6 md:hidden">
          <EmptyState
            title="No leave requests"
            description="No leave requests match the selected filter."
          />
        </div>
      )}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <Table className="min-w-[1320px]">
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Organization approver</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Flow status</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Medical report</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.employeeName}</div>
                    <div className="text-xs text-muted-foreground">{row.employeeId}</div>
                  </TableCell>
                  <TableCell>{row.approverName ?? row.managerName ?? "-"}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell>{row.from}</TableCell>
                  <TableCell>{row.to}</TableCell>
                  <TableCell>{row.days}</TableCell>
                  <TableCell>{row.appliedOn}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.workflowStatus ?? row.status}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="min-w-[210px] text-sm">
                    {row.status === "Pending" ? (
                      <span className="text-muted-foreground">Awaiting decision</span>
                    ) : (
                      <>
                        <p className="font-medium">{row.reviewerName ?? "System"}</p>
                        {row.decisionNote && (
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                            {row.decisionNote}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.reviewedAt
                            ? new Date(row.reviewedAt).toLocaleString()
                            : (row.updatedOn ?? "-")}
                        </p>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[260px] max-w-[420px] whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                    {row.reason}
                  </TableCell>
                  <TableCell className="min-w-[180px] text-sm">
                    {row.type === "Sick Leave" ? (
                      row.medicalDocumentUrl ? (
                        <div className="space-y-2">
                          <a
                            href={row.medicalDocumentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block font-medium text-primary underline"
                          >
                            Open report
                          </a>
                          {row.medicalDocumentVerifiedAt ? (
                            <span className="text-xs text-emerald-700 dark:text-emerald-400">
                              Verified by HR
                            </span>
                          ) : canVerifyMedicalReport ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={verifyingId === row.id}
                              onClick={() => void verifyMedicalReport(row.id)}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              {verifyingId === row.id ? "Verifying..." : "Mark verified"}
                            </Button>
                          ) : (
                            <span className="text-xs text-amber-700 dark:text-amber-400">
                              Awaiting verification
                            </span>
                          )}
                        </div>
                      ) : (
                        "Not submitted"
                      )
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && filteredRows.length === 0 && (
          <div className="p-6">
            <EmptyState
              title="No leave requests"
              description="No leave requests match the selected filter."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TrackingMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
