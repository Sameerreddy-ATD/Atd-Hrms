import { recalculateDailySummary } from "./attendanceEngine.js";
import { activeEmployeeIdsExcludingDeveloperAdmin, startOfDayUtc } from "./attendanceDayRules.js";
function yesterdayIstDate(): Date {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  ist.setUTCDate(ist.getUTCDate() - 1);
  return startOfDayUtc(
    new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate())),
  );
}

export async function settleAttendanceForDate(date: Date) {
  const eventDate = startOfDayUtc(date);
  const employeeIds = await activeEmployeeIdsExcludingDeveloperAdmin();
  for (const employeeId of employeeIds) {
    await recalculateDailySummary(employeeId, eventDate);
  }
  return { date: eventDate.toISOString().slice(0, 10), employees: employeeIds.length };
}

let lastSettledDateKey = "";

export async function runDailyAttendanceSettlement(force = false) {
  const target = yesterdayIstDate();
  const key = target.toISOString().slice(0, 10);
  if (!force && lastSettledDateKey === key) {
    return { skipped: true, date: key };
  }

  const result = await settleAttendanceForDate(target);
  lastSettledDateKey = key;
  return { skipped: false, ...result };
}

export function startAttendanceSettlementScheduler() {
  const tick = () => {
    void runDailyAttendanceSettlement().catch((error) => {
      console.error("Attendance settlement failed", error);
    });
  };

  tick();
  setInterval(tick, 60 * 60 * 1000).unref();
}
