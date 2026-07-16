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
    <Accordion type="multiple" className="space-y-3">
      {records.map((record) => (
        <AccordionItem
          key={record.id}
          value={record.id}
          className="overflow-hidden rounded-lg border bg-background px-0"
        >
          <AccordionTrigger className="gap-3 px-3 py-3 text-left hover:no-underline sm:px-4">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 lg:grid-cols-6">
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
                  <LogIn className="h-3.5 w-3.5 text-emerald-600" /> {record.punchIn ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last out</p>
                <p className="mt-0.5 flex items-center gap-1 text-sm font-medium tabular-nums">
                  <LogOut className="h-3.5 w-3.5 text-amber-600" /> {record.punchOut ?? "-"}
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
          <AccordionContent className="border-t bg-muted/15 px-3 pb-4 pt-3 sm:px-4">
            <AttendanceDayEvents employeeId={record.employeeId} date={record.date} mine={mine} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
