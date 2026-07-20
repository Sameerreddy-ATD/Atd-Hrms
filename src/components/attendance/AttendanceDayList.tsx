import { CalendarDays, Clock3, LogIn, LogOut, UserRound } from "lucide-react";
import { AttendanceDayEvents } from "@/components/attendance/AttendanceDayEvents";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { AttendanceRecord, Branch } from "@/mock/types";
import { formatStoredWorkedTime } from "@/lib/worked-time";

export function AttendanceDayList({
  records,
  branches,
  showEmployee = false,
  mine = false,
  emptyText = "No attendance records found.",
}: {
  records: AttendanceRecord[];
  branches: Branch[];
  showEmployee?: boolean;
  mine?: boolean;
  emptyText?: string;
}) {
  if (!records.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <Accordion type="multiple" className="space-y-2">
      {records.map((record) => (
        <AccordionItem
          key={record.id}
          value={record.id}
          className="overflow-hidden rounded-md border bg-background px-0"
        >
          <AccordionTrigger className="gap-2 px-3 py-2.5 text-left hover:no-underline sm:px-3.5">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4 lg:grid-cols-6">
              {showEmployee && (
                <div className="col-span-2 min-w-0 sm:col-span-2 lg:col-span-1">
                  <p className="text-xs text-muted-foreground">Employee</p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-semibold">
                    <UserRound className="h-3.5 w-3.5 shrink-0" /> {record.employeeName}
                  </p>
                </div>
              )}
              <div className={showEmployee ? "" : "col-span-1"}>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
                  <CalendarDays className="h-3.5 w-3.5" /> {record.date}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-0.5">
                  <StatusBadge status={record.status} />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">First in</p>
                <p className="mt-0.5 flex items-center gap-1 text-sm font-medium tabular-nums">
                  <LogIn className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />{" "}
                  {record.punchIn ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last out</p>
                <p className="mt-0.5 flex items-center gap-1 text-sm font-medium tabular-nums">
                  <LogOut className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />{" "}
                  {record.punchOut ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Worked</p>
                <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold tabular-nums">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatStoredWorkedTime(record.totalHours, record.workedMinutes)}
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="border-t bg-muted/15 px-2.5 pb-3 pt-2.5 sm:px-3">
            <AttendanceDayEvents employeeId={record.employeeId} date={record.date} mine={mine} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
