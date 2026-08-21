import { useEffect, useState } from "react";
import { attendanceApi } from "@/services/api";
import { indiaDateKey } from "@/lib/india-date";
import { DateField } from "@/components/ui/date-field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function formatHm(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function formatMinutes(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${String(min).padStart(2, "0")}m`;
}

/** Admin / manager Workday list (additive; legacy day logs remain). */
export function AttendanceAdminWorkdays() {
  const [date, setDate] = useState(indiaDateKey());
  const [openFilter, setOpenFilter] = useState<"all" | "true" | "false">("all");
  const [rows, setRows] = useState<
    Awaited<ReturnType<typeof attendanceApi.adminWorkdays>>["items"]
  >([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError("");
    void attendanceApi
      .adminWorkdays({
        date,
        openSession: openFilter === "all" ? undefined : openFilter,
        limit: "50",
      })
      .then((res) => {
        setRows(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [date, openFilter]);

  return (
    <section className="space-y-3" data-testid="admin-workdays">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="admin-workdate">Work date</Label>
          <DateField id="admin-workdate" value={date} onChange={setDate} />
        </div>
        <div className="space-y-1.5">
          <Label>Session state</Label>
          <Select
            value={openFilter}
            onValueChange={(v) => setOpenFilter(v as "all" | "true" | "false")}
          >
            <SelectTrigger className="min-h-11 w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="true">Open session</SelectItem>
              <SelectItem value="false">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground sm:ml-auto">{total} workday(s)</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading workdays…</p>}

      {!loading && !error && (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Employee</th>
                  <th className="py-2 pr-3 font-medium">Shift</th>
                  <th className="py-2 pr-3 font-medium">First In</th>
                  <th className="py-2 pr-3 font-medium">Last Out</th>
                  <th className="py-2 pr-3 font-medium">Worked</th>
                  <th className="py-2 pr-3 font-medium">Sessions</th>
                  <th className="py-2 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.workdayId} className="border-b border-border/50">
                    <td className="py-2.5 pr-3 font-medium">
                      {row.employee.name}
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {row.employee.employeeCode}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">{row.shift ?? "—"}</td>
                    <td className="py-2.5 pr-3">{formatHm(row.firstIn)}</td>
                    <td className="py-2.5 pr-3">{formatHm(row.lastOut)}</td>
                    <td className="py-2.5 pr-3">{formatMinutes(row.workedMinutes)}</td>
                    <td className="py-2.5 pr-3">{row.sessions}</td>
                    <td className="py-2.5">{row.openSession ? "Open" : row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 md:hidden">
            {rows.map((row) => (
              <li
                key={row.workdayId}
                className="rounded-lg border border-border/60 px-3 py-2.5 text-sm"
              >
                <p className="font-medium">{row.employee.name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.shift ?? "—"} · {formatMinutes(row.workedMinutes)} · {row.sessions}{" "}
                  session(s)
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatHm(row.firstIn)} → {formatHm(row.lastOut)}
                  {row.openSession ? " · Open" : ""}
                </p>
              </li>
            ))}
          </ul>

          {!rows.length && (
            <p className="text-sm text-muted-foreground">No workdays for this date yet.</p>
          )}
        </>
      )}
    </section>
  );
}
