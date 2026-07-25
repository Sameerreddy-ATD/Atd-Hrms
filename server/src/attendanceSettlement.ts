import { EventType, Prisma } from "@prisma/client";
import { recalculateDailySummary } from "./attendanceEngine.js";
import { activeEmployeeIdsExcludingDeveloperAdmin, startOfDayUtc } from "./attendanceDayRules.js";
import { prisma } from "./prisma.js";
import { publishNotificationChange } from "./notificationLive.js";
import { sendPushToUsers } from "./push.js";
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

export async function settleExpiredOpenPunches(employeeId?: string) {
  const cutoff = new Date(Date.now() - 9 * 60 * 60 * 1000);
  const lookback = new Date(cutoff.getTime() - 31 * 24 * 60 * 60 * 1000);
  const employeeClause = employeeId
    ? Prisma.sql`AND latest.employee_id = ${employeeId}`
    : Prisma.empty;
  const openTypes = [
    EventType.OFFICE_IN,
    EventType.BRANCH_IN,
    EventType.FIELD_CHECK_IN,
    EventType.CLIENT_CHECK_IN,
    EventType.BREAK_IN,
  ];
  const candidates = await prisma.$queryRaw<
    Array<{ employeeId: string; eventDate: Date; eventId: string; eventTime: Date }>
  >(
    Prisma.sql`
      SELECT DISTINCT latest.employee_id AS employeeId, latest.event_date AS eventDate,
        latest.event_id AS eventId, latest.event_time AS eventTime
      FROM attendance_events latest
      INNER JOIN (
        SELECT employee_id, event_date, MAX(event_time) AS latest_time
        FROM attendance_events
        WHERE event_date >= ${lookback}
        GROUP BY employee_id, event_date
      ) final_event
        ON final_event.employee_id = latest.employee_id
       AND final_event.event_date = latest.event_date
       AND final_event.latest_time = latest.event_time
      INNER JOIN employees employee ON employee.employee_id = latest.employee_id
      WHERE latest.event_time <= ${cutoff}
        AND latest.event_type IN (${Prisma.join(openTypes)})
        AND employee.attendance_required = true
        AND employee.status = 'ACTIVE'
        ${employeeClause}
    `,
  );
  if (candidates.length === 0) return 0;
  await Promise.all(
    candidates.map((candidate) =>
      prisma.attendanceDailySummary.updateMany({
        where: { employeeId: candidate.employeeId, date: candidate.eventDate },
        data: { hasMissingOutEvent: true, hasMissedCheckout: true },
      }),
    ),
  );
  const existing = await prisma.attendanceReminder.findMany({
    where: { eventId: { in: candidates.map((candidate) => candidate.eventId) } },
    select: { eventId: true },
  });
  const existingIds = new Set(existing.map((row) => row.eventId));
  const newReminders = candidates.filter((candidate) => !existingIds.has(candidate.eventId));
  if (newReminders.length === 0) return 0;

  await prisma.attendanceReminder.createMany({
    data: newReminders.map((candidate) => ({
      employeeId: candidate.employeeId,
      eventId: candidate.eventId,
      eventDate: candidate.eventDate,
      eventTime: candidate.eventTime,
    })),
    skipDuplicates: true,
  });
  const users = await prisma.user.findMany({
    where: { employeeId: { in: newReminders.map((candidate) => candidate.employeeId) } },
    select: { id: true, employeeId: true },
  });
  await Promise.all(
    newReminders.map(async (reminder) => {
      const userId = users.find((user) => user.employeeId === reminder.employeeId)?.id;
      publishNotificationChange("attendance-checkout-reminder", reminder.eventId);
      if (userId) {
        await sendPushToUsers([userId], {
          title: "Attendance is still running",
          body: "You have been checked in for more than 9 hours. Check out when your work is complete.",
          href: "/dashboard",
          tag: `attendance-${reminder.eventId}`,
        });
      }
    }),
  );
  return newReminders.length;
}
