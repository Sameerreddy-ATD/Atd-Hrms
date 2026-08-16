import { EventSource, EventType } from "@prisma/client";
import { recalculateDailySummary, attendanceDateForEmployee } from "./attendanceEngine.js";
import {
  activeEmployeeIdsExcludingDeveloperAdmin,
  startOfDayUtc,
  todayIstDate,
} from "./attendanceDayRules.js";
import {
  resolveEmployeeShift,
  shiftWindowBounds,
  attendancePunchOutDeadline,
} from "./attendancePolicy.js";
import { prisma } from "./prisma.js";
import { publishNotificationChange } from "./notificationLive.js";
import { sendPushToUsers } from "./push.js";
import {
  syncEmployeeLeaveBalances,
  runMonthEndCasualLeaveAccrual,
  runYearEndLeaveExpiry,
} from "./leavePolicy.js";
import { processMedicalCertificateReminders } from "./leaveJobs.js";

export async function settleAttendanceForDate(date: Date) {
  const eventDate = startOfDayUtc(date);
  const employeeIds = await activeEmployeeIdsExcludingDeveloperAdmin();
  for (const employeeId of employeeIds) {
    await recalculateDailySummary(employeeId, eventDate);
  }
  return { date: eventDate.toISOString().slice(0, 10), employees: employeeIds.length };
}

let lastSettledDateKey = "";
let lastLeaveJobKey = "";

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

async function employeeUserMap(employeeIds: string[]) {
  const users = await prisma.user.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { id: true, employeeId: true },
  });
  return new Map(users.map((user) => [user.employeeId!, user.id]));
}

/** Missed check-in notification at shift start + 30 minutes. */
export async function processMissedCheckInNotifications(now = new Date()) {
  const employeeIds = await activeEmployeeIdsExcludingDeveloperAdmin();
  const users = await employeeUserMap(employeeIds);
  let created = 0;
  for (const employeeId of employeeIds) {
    const attendanceDate = await attendanceDateForEmployee(employeeId, now);
    const shift = await resolveEmployeeShift(employeeId, attendanceDate);
    const bounds = shiftWindowBounds(attendanceDate, shift);
    if (now.getTime() < bounds.missedCheckInAt.getTime()) continue;
    if (now.getTime() > bounds.end.getTime()) continue;

    const events = await prisma.attendanceEvent.count({
      where: {
        employeeId,
        eventDate: attendanceDate,
        eventType: {
          in: [
            EventType.OFFICE_IN,
            EventType.BRANCH_IN,
            EventType.FIELD_CHECK_IN,
            EventType.CLIENT_CHECK_IN,
            EventType.BREAK_IN,
          ],
        },
      },
    });
    if (events > 0) continue;

    const tag = `missed-checkin-${employeeId}-${attendanceDate.toISOString().slice(0, 10)}`;
    // The synthetic eventId is the idempotency key, and it is what the unique
    // index covers. A read-then-create also matched on eventDate, so a stored
    // row whose date differed by a whisker was missed and every sweep retried
    // the insert: a logged constraint error each tick, and — because the
    // conflict was swallowed and execution continued — the same "missed
    // check-in" push resent to the employee over and over. Insert first and let
    // the row count say whether this sweep is the one that owns the notice.
    const inserted = await prisma.attendanceReminder.createMany({
      data: [
        {
          employeeId,
          eventId: tag,
          eventDate: attendanceDate,
          eventTime: bounds.missedCheckInAt,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted.count === 0) continue;

    const userId = users.get(employeeId);
    publishNotificationChange("attendance-missed-checkin", tag);
    if (userId) {
      await sendPushToUsers([userId], {
        title: "Missed check-in",
        body: "You have not checked in within 30 minutes of your shift start. Submit a correction within two days if needed.",
        href: "/attendance/missed-punch",
        tag,
      });
    }
    created += 1;
  }
  return created;
}

const provisionalSystemOutReasons = new Set([
  "MISSED_CHECKOUT_AUTO_STOP",
  "PRIOR_DAY_AUTO_CLOSE_ON_CHECK_IN",
]);

/** Remove legacy provisional SYSTEM outs so punch-out stays empty until a real out or correction. */
async function clearProvisionalSystemCheckouts() {
  // MySQL Prisma JSON `path` filters are unreliable here — load SYSTEM outs and filter in app code.
  const candidates = await prisma.attendanceEvent.findMany({
    where: {
      eventSource: EventSource.SYSTEM,
      eventType: {
        in: [
          EventType.OFFICE_OUT,
          EventType.BRANCH_OUT,
          EventType.FIELD_CHECK_OUT,
          EventType.CLIENT_CHECK_OUT,
          EventType.BREAK_OUT,
        ],
      },
    },
    select: {
      eventId: true,
      employeeId: true,
      eventDate: true,
      remarks: true,
      rawPayload: true,
    },
  });

  const rows = candidates.filter((row) => {
    if (row.remarks?.includes("Missed Checkout")) return true;
    const payload = row.rawPayload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    const reason = (payload as { reason?: unknown }).reason;
    return typeof reason === "string" && provisionalSystemOutReasons.has(reason);
  });
  if (!rows.length) return 0;

  const touched = new Map<string, Date>();
  for (const row of rows) {
    touched.set(`${row.employeeId}|${row.eventDate.toISOString()}`, row.eventDate);
  }
  await prisma.attendanceEvent.deleteMany({
    where: { eventId: { in: rows.map((row) => row.eventId) } },
  });
  for (const [key, eventDate] of touched) {
    const employeeId = key.split("|")[0]!;
    await recalculateDailySummary(employeeId, eventDate);
  }
  return rows.length;
}

/**
 * After the attendance day's punch-out deadline: mark Missed Checkout, keep punch-out empty, notify.
 * Does not invent a SYSTEM checkout — employee (or head) supplies the real out via missed punch.
 */
export async function processMissedCheckouts(now = new Date()) {
  try {
    await clearProvisionalSystemCheckouts();
  } catch (error) {
    console.error("clearProvisionalSystemCheckouts failed", error);
  }

  const employeeIds = await activeEmployeeIdsExcludingDeveloperAdmin();
  const users = await employeeUserMap(employeeIds);
  let processed = 0;

  for (const employeeId of employeeIds) {
    const open = await prisma.attendanceEvent.findFirst({
      where: {
        employeeId,
        eventType: {
          in: [
            EventType.OFFICE_IN,
            EventType.BRANCH_IN,
            EventType.FIELD_CHECK_IN,
            EventType.CLIENT_CHECK_IN,
            EventType.BREAK_IN,
          ],
        },
      },
      orderBy: { eventTime: "desc" },
    });
    if (!open) continue;

    // Confirm still open (latest event is an IN)
    const latest = await prisma.attendanceEvent.findFirst({
      where: {
        employeeId,
        eventType: {
          in: [
            EventType.OFFICE_IN,
            EventType.OFFICE_OUT,
            EventType.BRANCH_IN,
            EventType.BRANCH_OUT,
            EventType.FIELD_CHECK_IN,
            EventType.FIELD_CHECK_OUT,
            EventType.CLIENT_CHECK_IN,
            EventType.CLIENT_CHECK_OUT,
            EventType.BREAK_IN,
            EventType.BREAK_OUT,
          ],
        },
      },
      orderBy: { eventTime: "desc" },
    });
    const openTypes = new Set<EventType>([
      EventType.OFFICE_IN,
      EventType.BRANCH_IN,
      EventType.FIELD_CHECK_IN,
      EventType.CLIENT_CHECK_IN,
      EventType.BREAK_IN,
    ]);
    if (!latest || !openTypes.has(latest.eventType)) continue;

    const shift = await resolveEmployeeShift(employeeId, latest.eventDate);
    const deadline = attendancePunchOutDeadline(latest.eventDate, shift);
    if (now.getTime() < deadline.getTime()) continue;

    await recalculateDailySummary(employeeId, latest.eventDate);

    const tag = `missed-checkout-${employeeId}-${latest.eventDate.toISOString().slice(0, 10)}`;
    // Same idempotency shape as the missed check-in sweep above: the insert
    // decides ownership. A plain create() here threw on every later sweep for
    // an employee who already had the reminder, and the swallowed rejection
    // still cost a round trip and logged a prisma:error each tick.
    const inserted = await prisma.attendanceReminder.createMany({
      data: [
        {
          employeeId,
          eventId: tag,
          eventDate: latest.eventDate,
          eventTime: deadline,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted.count === 0) continue;

    const userId = users.get(employeeId);
    publishNotificationChange("attendance-missed-checkout", tag);
    if (userId) {
      await sendPushToUsers([userId], {
        title: "Punch-out required",
        body: "The day ended and you did not check out. Punch-out is empty — submit a missed punch with your actual time within two days for your head to approve. Tomorrow’s check-in is not affected.",
        href: "/attendance/missed-punch",
        tag,
      });
    }
    processed += 1;
  }
  return processed;
}

export async function lockExpiredMissedCheckouts(now = new Date()) {
  const due = await prisma.attendanceDailySummary.findMany({
    where: {
      isMissedCheckout: true,
      isLocked: false,
      correctionDeadlineAt: { lte: now },
    },
    select: { attendanceId: true },
  });
  if (!due.length) return 0;
  await prisma.attendanceDailySummary.updateMany({
    where: { attendanceId: { in: due.map((row) => row.attendanceId) } },
    data: { isLocked: true },
  });
  return due.length;
}

export async function runPolicyMaintenanceJobs(force = false) {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const key = `${istNow.getUTCFullYear()}-${istNow.getUTCMonth()}-${istNow.getUTCDate()}-${istNow.getUTCHours()}`;
  if (!force && lastLeaveJobKey === key) return { skipped: true };
  lastLeaveJobKey = key;

  const missedIn = await processMissedCheckInNotifications();
  const missedOut = await processMissedCheckouts();
  const locked = await lockExpiredMissedCheckouts();
  const medical = await processMedicalCertificateReminders();

  // Month-end / year-end leave jobs (idempotent)
  const day = istNow.getUTCDate();
  const lastDay = new Date(
    Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 0),
  ).getUTCDate();
  let leaveAccrual = 0;
  let leaveExpiry = 0;
  if (day === lastDay || force) {
    leaveAccrual = await runMonthEndCasualLeaveAccrual(new Date());
  }
  if ((istNow.getUTCMonth() === 11 && day === 31) || force) {
    leaveExpiry = await runYearEndLeaveExpiry(istNow.getUTCFullYear());
  }

  // Keep balances in sync periodically
  const employeeIds = await activeEmployeeIdsExcludingDeveloperAdmin();
  for (const employeeId of employeeIds.slice(0, 50)) {
    await syncEmployeeLeaveBalances(employeeId).catch(() => undefined);
  }

  return { missedIn, missedOut, locked, medical, leaveAccrual, leaveExpiry };
}

export function startAttendanceSettlementScheduler() {
  const tick = () => {
    void Promise.all([runDailyAttendanceSettlement(), runPolicyMaintenanceJobs()]).catch(
      (error) => {
        console.error("Attendance settlement failed", error);
      },
    );
  };

  setTimeout(tick, 30_000).unref();
  setInterval(tick, 5 * 60 * 1000).unref();
}

/** @deprecated — use processMissedCheckouts (marks empty punch-out, no SYSTEM out) */
export async function settleExpiredOpenPunches(_employeeId?: string) {
  return processMissedCheckouts();
}

const openInTypes = new Set<EventType>([
  EventType.OFFICE_IN,
  EventType.BRANCH_IN,
  EventType.FIELD_CHECK_IN,
  EventType.CLIENT_CHECK_IN,
  EventType.BREAK_IN,
]);

/**
 * When an employee starts a new attendance day while a prior day is still open,
 * mark that prior day as Missed Checkout with empty punch-out so today's check-in
 * is never blocked. Correction remains available for two days; it is not a gate.
 */
export async function closePriorOpenPunchForNewDay(
  employeeId: string,
  currentEventDate: Date,
  _now = new Date(),
) {
  const latest = await prisma.attendanceEvent.findFirst({
    where: {
      employeeId,
      eventType: {
        in: [
          EventType.OFFICE_IN,
          EventType.OFFICE_OUT,
          EventType.BRANCH_IN,
          EventType.BRANCH_OUT,
          EventType.FIELD_CHECK_IN,
          EventType.FIELD_CHECK_OUT,
          EventType.CLIENT_CHECK_IN,
          EventType.CLIENT_CHECK_OUT,
          EventType.BREAK_IN,
          EventType.BREAK_OUT,
        ],
      },
    },
    orderBy: { eventTime: "desc" },
  });
  if (!latest || !openInTypes.has(latest.eventType)) return null;
  if (latest.eventDate.getTime() >= currentEventDate.getTime()) return null;

  await recalculateDailySummary(employeeId, latest.eventDate);
  return null;
}
