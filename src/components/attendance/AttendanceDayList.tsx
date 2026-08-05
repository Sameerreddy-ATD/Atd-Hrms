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
      <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" />
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
      <span className="flex flex-wrap items-center gap-1 text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {formatStoredWorkedTime(record.totalHours, record.workedMinutes)}
        <span className="font-normal">· Confirm out</span>
      </span>
    );
  }

  return <>{formatStoredWorkedTime(record.totalHours, record.workedMinutes)}</>;
}

function DayRecordSummary({
  record,
  showEmployee,
}: {
  record: AttendanceRecord;
  showEmployee: boolean;
}) {
  const lastOut = lastOutLabel(record);
  const lastOutAlert = lastOut.provisional || Boolean(lastOut.missing) || lastOut.text === "Punch-out required";

  return (
    <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4 lg:grid-cols-6">
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
  );
}

function EmployeeDayRecord({ record, mine }: { record: AttendanceRecord; mine: boolean }) {
  return (
    <AccordionItem
      value={record.id}
      className="overflow-hidden rounded-md border bg-background px-0 [content-visibility:auto] [contain-intrinsic-size:74px]"
    >
      <AccordionTrigger className="gap-2 px-3 py-2.5 text-left hover:no-underline sm:px-3.5">
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
      <Accordion type="multiple" className="space-y-2">
        {dateGroups.map(([date, dateRecords]) => {
          const presentCount = dateRecords.filter((record) =>
            record.status.toLowerCase().startsWith("present"),
          ).length;
          return (
            <AccordionItem
              key={date}
              value={`date-${date}`}
              className="overflow-hidden rounded-md border bg-background px-0"
            >
              <AccordionTrigger className="gap-3 px-3 py-3 text-left hover:no-underline sm:px-4">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
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
              </AccordionTrigger>
              <AccordionContent className="border-t bg-muted/15 px-2.5 pb-3 pt-2.5 sm:px-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  Select an employee to see every punch recorded on this date.
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
    <Accordion type="multiple" className="space-y-2">
      {records.map((record) => (
        <AccordionItem
          key={record.id}
          value={record.id}
          className="overflow-hidden rounded-md border bg-background px-0 [content-visibility:auto] [contain-intrinsic-size:74px]"
        >
          <AccordionTrigger className="gap-2 px-3 py-2.5 text-left hover:no-underline sm:px-3.5">
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
