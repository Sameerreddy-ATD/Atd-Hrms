import { createFileRoute } from "@tanstack/react-router";
import { format, startOfWeek, addDays } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { opsReportsApi } from "@/services/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/reports")({ component: OpsReportsPage });

function OpsReportsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof opsReportsApi.summary>> | null>(
    null,
  );
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const [from, setFrom] = useState(format(weekStart, "yyyy-MM-dd"));
  const [to, setTo] = useState(format(addDays(weekStart, 6), "yyyy-MM-dd"));
  const [variance, setVariance] = useState<Awaited<
    ReturnType<typeof opsReportsApi.rosterVariance>
  > | null>(null);
  const [varianceLoading, setVarianceLoading] = useState(false);

  useEffect(() => {
    void opsReportsApi
      .summary()
      .then(setSummary)
      .catch((error) => toast.error((error as Error).message || "Unable to load reports"))
      .finally(() => setLoading(false));
  }, []);

  async function loadVariance() {
    setVarianceLoading(true);
    try {
      setVariance(await opsReportsApi.rosterVariance(from, to));
    } catch (error) {
      toast.error((error as Error).message || "Unable to load roster variance");
    } finally {
      setVarianceLoading(false);
    }
  }

  useEffect(() => {
    void loadVariance();
  }, []);

  async function runExport(action: () => Promise<void>, label: string) {
    setExporting(true);
    try {
      await action();
      toast.success(`${label} downloaded`);
    } catch (error) {
      toast.error((error as Error).message || `Unable to download ${label.toLowerCase()}`);
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <LoadingState label="Loading operations reports" />;
  if (!summary) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Reports are available to managers, HR, and leadership.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 pb-16 sm:px-6">
      <PageHeader
        title="Operations reports"
        description="Attendance coverage, leave queue, planner load, paid claims, and roster vs attendance."
        actions={
          ["developer_admin", "main_admin", "hr", "ceo", "manager"].includes(user?.role ?? "") ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={exporting}
                onClick={() => void runExport(opsReportsApi.downloadOpsExcel, "Excel report")}
              >
                Export Excel
              </Button>
              {["developer_admin", "main_admin", "hr", "ceo"].includes(user?.role ?? "") && (
                <Button
                  variant="outline"
                  disabled={exporting}
                  onClick={() => void runExport(opsReportsApi.downloadClaimsCsv, "Claims CSV")}
                >
                  Export paid claims CSV
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Active employees", summary.activeEmployees],
          ["Present today", `${summary.presentToday} (${summary.attendancePct}%)`],
          ["Pending leave", summary.pendingLeave],
          ["Overdue tasks", summary.overdueTasks],
          ["Open tasks", summary.openTasks],
          ["Paid claims (month)", summary.paidClaimsThisMonth],
          ["Paid amount (month)", `INR ${summary.paidClaimsAmount.toLocaleString("en-IN")}`],
        ].map(([label, value]) => (
          <Card key={String(label)} className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <h2 className="mr-auto text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Roster vs attendance
          </h2>
          <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="outline" disabled={varianceLoading} onClick={() => void loadVariance()}>
            Refresh
          </Button>
        </div>
        {varianceLoading && !variance ? (
          <LoadingState label="Loading roster variance" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(variance?.branches ?? []).map((branch) => (
              <Card key={branch.branch} className="shadow-none">
                <CardContent className="space-y-1 p-4 text-sm">
                  <p className="font-semibold">{branch.branch}</p>
                  <p>Rostered: {branch.rostered}</p>
                  <p>Present: {branch.present}</p>
                  <p>Late: {branch.late}</p>
                  <p>Absent / unmarked: {branch.absent}</p>
                  <p>Off shifts: {branch.off}</p>
                </CardContent>
              </Card>
            ))}
            {(variance?.branches.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">
                No published roster rows in this date range.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Boards
        </h2>
        <div className="space-y-1.5">
          {summary.boards.map((board) => (
            <div
              key={board.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
            >
              <span className="font-medium">{board.name}</span>
              <span className="text-muted-foreground">
                {board.active} active · {board.overdue} overdue
              </span>
            </div>
          ))}
          {summary.boards.length === 0 && (
            <p className="text-sm text-muted-foreground">No active boards.</p>
          )}
        </div>
      </section>
    </div>
  );
}
