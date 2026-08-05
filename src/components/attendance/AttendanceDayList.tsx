import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  LogIn,
  LogOut,
  UserRound,
  UsersRound,
} from "lucide-react";
import { AttendanceDayEvents } from "@/components/attendance/AttendanceDayEvents";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EmptyState } from "@/components/common/EmptyState";
import type { AttendanceRecord } from "@/types/domain";
import {
  attendanceStatusWithFlags,
  hasProvisionalSystemOut,
  lastOutLabel,
} from "@/lib/attendance-labels";
import { formatStoredWorkedTime, formatWorkedTime } from "@/lib/worked-time";
import { formatDisplayDate, indiaDateKey } from "@/lib/india-date";

function WorkedTime({ record }: { record: AttendanceRecord }) {
  const [now, setNow] = useState(() => Date.now());
  const isOpenToday =
    record.hasMissingOutEvent &&
    !record.hasMissedCheckout &&
    record.date === indiaDateKey() &&
    Boolean(record.latestOpenPunchAt);
  const provisional = hasProvisionalSystemOut(record);
  const needsOut =
    !provisional && (record.hasMissedCheckout || (record.hasMissingOutEvent && !isOpenToday));

  useEffect(() => {
    if (!isOpenToday) return;
    const tick = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [isOpenToday]);

  if (needsOut) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Punch-out required
      </span>
    );
  }

  if (isOpenToday) {
    const completedMs = Math.round(Math.max(0, record.totalHours ?? 0) * 3600) * 1000;
    const openMs = Math.max(0, now - new Date(record.latestOpenPunchAt!).getTime());
    return (
      <span className="text-emerald-700 dark:text-emerald-400">
        {formatWorkedTime(completedMs + openMs)} · In progress
      </span>
    );
  }

  if (provisional) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1 text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {formatStoredWorkedTime(record.totalHours, record.workedMinutes)}
        <span className="font-normal">· Confirm out</span>
      </span>
    );
  }

  return <>{formatStoredWorkedTime(record.totalHours, record.workedMinutes)}</>;
}

function PunchPair({ record }: { record: AttendanceRecord }) {
  const lastOut = lastOutLabel(record);
  const lastOutAlert =
    lastOut.provisional || Boolean(lastOut.missing) || lastOut.text === "Punch-out required";

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="min-w-0 rounded-md border border-border/80 bg-muted/40 px-2.5 py-2">
        <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <LogIn className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          Check in
        </p>
        <p className="mt-1 text-base font-semibold tabular-nums tracking-tight">
          {record.punchIn ?? "—"}
        </p>
      </div>
      <div className="min-w-0 rounded-md border border-border/80 bg-muted/40 px-2.5 py-2">
        <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <LogOut className="h-3 w-3 text-amber-600 dark:text-amber-400" />
          Check out
        </p>
        <p
          className={`mt-1 text-base font-semibold tabular-nums tracking-tight ${
            lastOutAlert ? "text-amber-700 dark:text-amber-400" : ""
          }`}
        >
          {lastOut.text}
        </p>
      </div>
    </div>
  );
}

/** Phone-first day row: date + status, punch pair, worked time. Desktop keeps denser columns. */
function DayRecordSummary({
  record,
  showEmployee,
}: {
  record: AttendanceRecord;
  showEmployee: boolean;
}) {
  const lastOut = lastOutLabel(record);
  const lastOutAlert =
    lastOut.provisional || Boolean(lastOut.missing) || lastOut.text === "Punch-out required";

  return (
    <>
      {/* Mobile / narrow */}
      <div className="min-w-0 flex-1 space-y-2.5 md:hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {showEmployee ? (
              <>
                <p className="truncate text-sm font-semibold leading-snug">{record.employeeName}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3 w-3 shrink-0" />
                  {formatDisplayDate(record.date)}
                </p>
              </>
            ) : (
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {formatDisplayDate(record.date)}
              </p>
            )}
          </div>
          <StatusBadge status={attendanceStatusWithFlags(record)} />
        </div>
        <PunchPair record={record} />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium text-foreground">
            <WorkedTime record={record} />
          </span>
        </p>
      </div>

      {/* Desktop / tablet+ */}
      <div className="hidden min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4 lg:grid-cols-6 md:grid">
        {showEmployee && (
          <div className="col-span-2 min-w-0 sm:col-span-2 lg:col-span-1">
            <p className="text-xs text-muted-foreground">Employee</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-semibold">
              <UserRound className="h-3.5 w-3.5 shrink-0" /> {record.employeeName}
            </p>
          </div>
        )}
        {!showEmployee && (
          <div>
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
              <CalendarDays className="h-3.5 w-3.5" /> {formatDisplayDate(record.date)}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="mt-0.5">
            <StatusBadge status={attendanceStatusWithFlags(record)} />
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">First in</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm font-medium tabular-nums">
            <LogIn className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            {record.punchIn ?? "-"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Last out</p>
          <p
            className={`mt-0.5 flex items-center gap-1 text-sm font-medium tabular-nums ${
              lastOutAlert ? "text-amber-700 dark:text-amber-400" : ""
            }`}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="min-w-0 break-words">{lastOut.text}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Worked</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold tabular-nums">
            <Clock3 className="h-3.5 w-3.5" />
            <WorkedTime record={record} />
          </p>
        </div>
      </div>
    </>
  );
}

function EmployeeDayRecord({ record, mine }: { record: AttendanceRecord; mine: boolean }) {
  return (
    <AccordionItem
      value={record.id}
      className="overflow-hidden rounded-lg border bg-background px-0 [content-visibility:auto] [contain-intrinsic-size:120px]"
    >
      <AccordionTrigger className="min-h-11 items-start gap-2 px-3 py-3 text-left hover:no-underline sm:items-center sm:px-3.5 [&_svg]:mt-1 sm:[&_svg]:mt-0">
        <DayRecordSummary record={record} showEmployee />
      </AccordionTrigger>
      <AccordionContent className="border-t bg-muted/15 px-2.5 pb-3 pt-2.5 sm:px-3">
        <AttendanceDayEvents
          employeeId={record.employeeId}
          date={record.date}
          mine={mine}
          punchOutRequired={Boolean(record.hasMissedCheckout)}
        />
      </AccordionContent>
    </AccordionItem>
  );
}

export function AttendanceDayList({
  records,
  showEmployee = false,
  mine = false,
  emptyText = "No attendance records found.",
}: {
  records: AttendanceRecord[];
  showEmployee?: boolean;
  mine?: boolean;
  emptyText?: string;
}) {
  if (!records.length) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={emptyText}
        description="Days with punches or leave will show up here once recorded."
      />
    );
  }

  if (showEmployee) {
    const recordsByDate = new Map<string, AttendanceRecord[]>();
    for (const record of records) {
      const dateRows = recordsByDate.get(record.date) ?? [];
      dateRows.push(record);
      recordsByDate.set(record.date, dateRows);
    }
    const dateGroups = [...recordsByDate.entries()].sort(([left], [right]) =>
      right.localeCompare(left),
    );

    return (
      <Accordion type="multiple" className="space-y-2.5">
        {dateGroups.map(([date, dateRecords]) => {
          const presentCount = dateRecords.filter((record) =>
            record.status.toLowerCase().startsWith("present"),
          ).length;
          return (
            <AccordionItem
              key={date}
              value={`date-${date}`}
              className="overflow-hidden rounded-lg border bg-background px-0"
            >
              <AccordionTrigger className="min-h-11 items-start gap-3 px-3 py-3 text-left hover:no-underline sm:items-center sm:px-4 [&_svg]:mt-1 sm:[&_svg]:mt-0">
                <div className="min-w-0 flex-1 space-y-2 md:space-y-0">
                  <div className="flex items-center justify-between gap-2 md:hidden">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatDisplayDate(date)}
                    </p>
                    <p className="text-xs font-medium tabular-nums text-muted-foreground">
                      {dateRecords.length} people
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 md:hidden">
                    <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                      <p className="text-[10px] text-muted-foreground">Total</p>
                      <p className="text-sm font-semibold tabular-nums">{dateRecords.length}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                      <p className="text-[10px] text-muted-foreground">Present</p>
                      <p className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {presentCount}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/50 px-2 py-1.5 text-center">
                      <p className="text-[10px] text-muted-foreground">Other</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {dateRecords.length - presentCount}
                      </p>
                    </div>
                  </div>
                  <div className="hidden min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4 md:grid">
                    <div>
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
                        <CalendarDays className="h-3.5 w-3.5" /> {formatDisplayDate(date)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Employees</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                        <UsersRound className="h-3.5 w-3.5" /> {dateRecords.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Present</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {presentCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Other status</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums">
                        {dateRecords.length - presentCount}
                      </p>
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="border-t bg-muted/15 px-2.5 pb-3 pt-2.5 sm:px-3">
                <p className="mb-2.5 text-xs text-muted-foreground">
                  Open an employee to see every punch for this date.
                </p>
                <Accordion type="multiple" className="space-y-2">
                  {dateRecords
                    .sort((left, right) => left.employeeName.localeCompare(right.employeeName))
                    .map((record) => (
                      <EmployeeDayRecord key={record.id} record={record} mine={mine} />
                    ))}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    );
  }

  return (
    <Accordion type="multiple" className="space-y-2.5">
      {records.map((record) => (
        <AccordionItem
          key={record.id}
          value={record.id}
          className="overflow-hidden rounded-lg border bg-background px-0 [content-visibility:auto] [contain-intrinsic-size:140px]"
        >
          <AccordionTrigger className="min-h-11 items-start gap-2 px-3 py-3 text-left hover:no-underline sm:items-center sm:px-3.5 [&_svg]:mt-1 sm:[&_svg]:mt-0">
            <DayRecordSummary record={record} showEmployee={false} />
          </AccordionTrigger>
          <AccordionContent className="border-t bg-muted/15 px-2.5 pb-3 pt-2.5 sm:px-3">
            <AttendanceDayEvents
              employeeId={record.employeeId}
              date={record.date}
              mine={mine}
              punchOutRequired={Boolean(record.hasMissedCheckout)}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
