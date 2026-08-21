/**
 * HR / manager Attendance Exceptions list (paginated).
 */
import { useEffect, useState } from "react";
import { attendanceApi } from "@/services/api";
import { LoadingState } from "@/components/common/LoadingState";
import {
  ResponsiveListShell,
  MobileList,
  MobileListItem,
  MobileListHeader,
  MobileListFields,
  MobileListField,
  DesktopTable,
} from "@/components/common/ResponsiveList";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type ExceptionRow = {
  exceptionId: string;
  type: string;
  status: string;
  detectedAt: string;
  workDate: string;
  shiftName?: string | null;
  result?: string | null;
  employee: { employeeId: string; name: string; employeeCode: string };
};

export function AttendanceExceptionsPanel({ className }: { className?: string }) {
  const [items, setItems] = useState<ExceptionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("OPEN");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await attendanceApi.listExceptions({ limit: "50", status });
        if (!cancelled) {
          setItems(data.items);
          setTotal(data.total);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load exceptions");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <section className={cn("space-y-4", className)} data-testid="attendance-exceptions-panel">
      <div className="flex flex-wrap gap-2">
        {["OPEN", "CORRECTION_PENDING", "RESOLVED", "DISMISSED"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              "min-h-11 rounded-lg border px-3 text-sm",
              status === s ? "border-primary bg-primary/10" : "border-border",
            )}
          >
            {s.replaceAll("_", " ")}
          </button>
        ))}
      </div>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No exceptions in this filter.</p>
      ) : (
        <ResponsiveListShell>
          <MobileList>
            {items.map((row) => (
              <MobileListItem key={row.exceptionId}>
                <MobileListHeader
                  title={row.employee.name}
                  meta={`${row.workDate} · ${row.type.replaceAll("_", " ")}`}
                />
                <MobileListFields>
                  <MobileListField label="Status" value={row.status} />
                  <MobileListField label="Result" value={row.result ?? "—"} />
                  <MobileListField label="Shift" value={row.shiftName ?? "—"} />
                </MobileListFields>
              </MobileListItem>
            ))}
          </MobileList>
          <DesktopTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Work Date</TableHead>
                  <TableHead>Exception</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.exceptionId}>
                    <TableCell>{row.employee.name}</TableCell>
                    <TableCell>{row.workDate}</TableCell>
                    <TableCell>{row.type.replaceAll("_", " ")}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.result ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DesktopTable>
        </ResponsiveListShell>
      )}
      <p className="text-xs text-muted-foreground">{total} total</p>
    </section>
  );
}
