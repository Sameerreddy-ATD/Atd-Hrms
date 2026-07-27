import { EventSource, EventType } from "@prisma/client";
import {
  createAttendanceEvent,
  recalculateDailySummary,
  attendanceDateForEmployee,
} from "./attendanceEngine.js";
import {
  activeEmployeeIdsExcludingDeveloperAdmin,
  startOfDayUtc,
  todayIstDate,
} from "./attendanceDayRules.js";
import {
  resolveEmployeeShift,
  shiftWindowBounds,
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
    const existing = await prisma.attendanceReminder.findFirst({
      where: { employeeId, eventDate: attendanceDate, eventId: tag },
    });
    if (existing) continue;

    // Use reminder table with synthetic eventId key for idempotency
    await prisma.attendanceReminder.create({
      data: {
        employeeId,
        eventId: tag,
        eventDate: attendanceDate,
        eventTime: bounds.missedCheckInAt,
      },
    }).catch(async () => {
      // unique conflict = already notified
    });

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

/** At shift end + 30: notify, system checkout, mark Missed Checkout. */
export async function processMissedCheckouts(now = new Date()) {
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
    const bounds = shiftWindowBounds(latest.eventDate, shift);
    if (now.getTime() < bounds.missedCheckOutAt.getTime()) continue;

    const alreadySystem = await prisma.attendanceEvent.findFirst({
      where: {
        employeeId,
        eventDate: latest.eventDate,
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
    });
    if (alreadySystem) {
      await recalculateDailySummary(employeeId, latest.eventDate);
      continue;
    }

    const outType =
      latest.eventType === EventType.OFFICE_IN || latest.eventType === EventType.BRANCH_IN
        ? EventType.OFFICE_OUT
        : latest.eventType === EventType.CLIENT_CHECK_IN
          ? EventType.CLIENT_CHECK_OUT
          : latest.eventType === EventType.BREAK_IN
            ? EventType.BREAK_OUT
            : EventType.FIELD_CHECK_OUT;

    await createAttendanceEvent({
      employeeId,
      eventTime: bounds.missedCheckOutAt,
      eventSource: EventSource.SYSTEM,
      eventType: outType,
      branchId: latest.branchId ?? undefined,
      remarks: "System checkout after shift end + 30 minutes (Missed Checkout)",
      rawPayload: { reason: "MISSED_CHECKOUT_AUTO_STOP", shiftEnd: bounds.end.toISOString() },
    });

    // Force event onto the open attendance date
    await prisma.attendanceEvent.updateMany({
      where: {
        employeeId,
        eventSource: EventSource.SYSTEM,
        eventTime: bounds.missedCheckOutAt,
      },
      data: { eventDate: latest.eventDate },
    });
    await recalculateDailySummary(employeeId, latest.eventDate);

    const tag = `missed-checkout-${employeeId}-${latest.eventDate.toISOString().slice(0, 10)}`;
    await prisma.attendanceReminder
      .create({
        data: {
          employeeId,
          eventId: tag,
          eventDate: latest.eventDate,
          eventTime: bounds.missedCheckOutAt,
        },
      })
      .catch(() => undefined);

    const userId = users.get(employeeId);
    publishNotificationChange("attendance-missed-checkout", tag);
    if (userId) {
      await sendPushToUsers([userId], {
        title: "Missed checkout",
        body: "Your shift ended 30 minutes ago without checkout. The timer was stopped. Submit your actual checkout within two days.",
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
  const lastDay = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 0)).getUTCDate();
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
    void Promise.all([
      runDailyAttendanceSettlement(),
      runPolicyMaintenanceJobs(),
    ]).catch((error) => {
      console.error("Attendance settlement failed", error);
    });
  };

  setTimeout(tick, 30_000).unref();
  setInterval(tick, 5 * 60 * 1000).unref();
}

/** @deprecated — replaced by shift-end + 30 system checkout */
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

function matchingSystemOutType(checkInType: EventType): EventType {
  switch (checkInType) {
    case EventType.OFFICE_IN:
    case EventType.BRANCH_IN:
      return EventType.OFFICE_OUT;
    case EventType.CLIENT_CHECK_IN:
      return EventType.CLIENT_CHECK_OUT;
    case EventType.BREAK_IN:
      return EventType.BREAK_OUT;
    default:
      return EventType.FIELD_CHECK_OUT;
  }
}

/**
 * When an employee starts a new attendance day while a prior day is still open,
 * close that prior day with the Missed Checkout system out so today's check-in
 * is never blocked. Correction remains available for two days; it is not a gate.
 */
export async function closePriorOpenPunchForNewDay(
  employeeId: string,
  currentEventDate: Date,
  now = new Date(),
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

  const shift = await resolveEmployeeShift(employeeId, latest.eventDate);
  const bounds = shiftWindowBounds(latest.eventDate, shift);
  const eventTime =
    now.getTime() < bounds.missedCheckOutAt.getTime() ? now : bounds.missedCheckOutAt;

  const alreadySystem = await prisma.attendanceEvent.findFirst({
    where: {
      employeeId,
      eventDate: latest.eventDate,
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
  });
  if (alreadySystem) {
    await recalculateDailySummary(employeeId, latest.eventDate);
    return alreadySystem;
  }

  const created = await createAttendanceEvent({
    employeeId,
    eventTime,
    eventSource: EventSource.SYSTEM,
    eventType: matchingSystemOutType(latest.eventType),
    branchId: latest.branchId ?? undefined,
    remarks: "System checkout before next-day check-in (Missed Checkout)",
    rawPayload: {
      reason: "PRIOR_DAY_AUTO_CLOSE_ON_CHECK_IN",
      openEventId: latest.eventId,
      shiftEnd: bounds.end.toISOString(),
    },
  });

  await prisma.attendanceEvent.update({
    where: { eventId: created.eventId },
    data: { eventDate: latest.eventDate },
  });
  await recalculateDailySummary(employeeId, latest.eventDate);
  await recalculateDailySummary(employeeId, created.eventDate).catch(() => undefined);
  return created;
}
