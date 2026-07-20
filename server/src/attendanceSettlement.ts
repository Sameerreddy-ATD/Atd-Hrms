import { recalculateDailySummary } from "./attendanceEngine.js";
import { activeEmployeeIdsExcludingDeveloperAdmin, startOfDayUtc } from "./attendanceDayRules.js";
import { prisma } from "./prisma.js";
function todayIstDate(): Date {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
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
  const target = todayIstDate();
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  if (!force && istNow.getUTCHours() < 10) {
    return { skipped: true, date: target.toISOString().slice(0, 10) };
  }
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
    void Promise.all([runDailyAttendanceSettlement(), settleExpiredOpenPunches()]).catch(
      (error) => {
        console.error("Attendance settlement failed", error);
      },
    );
  };

  // Let health checks and returning user sessions complete before this
  // database-heavy maintenance pass starts after a deployment or restart.
  setTimeout(tick, 30_000).unref();
  setInterval(tick, 60 * 60 * 1000).unref();
}

async function settleExpiredOpenPunches() {
  const today = todayIstDate();
  const cutoff = new Date(Date.now() - 9 * 60 * 60 * 1000);
  const candidates = await prisma.attendanceDailySummary.findMany({
    where: {
      date: today,
      firstCheckIn: { lte: cutoff },
      hasMissedCheckout: false,
      employee: { attendanceRequired: true, status: "ACTIVE" },
    },
    select: { employeeId: true },
  });
  await Promise.all(candidates.map(({ employeeId }) => recalculateDailySummary(employeeId, today)));
}
