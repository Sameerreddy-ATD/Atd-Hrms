/**
 * Disposable-DB backfill: legacy AttendanceEvents → Workday + Session.
 * Never deletes or mutates raw event evidence fields (time, type, branch, source).
 * Only sets workdayId/sessionId linkage and creates Workday/Session rows.
 */
import { EventType } from "@prisma/client";
import { prisma } from "./prisma.js";
import { startOfDayUtc } from "./attendanceDayRules.js";
import { isCheckInEvent, isCheckOutEvent, punchEventTypes } from "./attendanceEventTypes.js";
import {
  getOrCreateAttendanceWorkday,
  resolveWorkDateForPunch,
  workDateIso,
} from "./attendanceWorkday.js";

export type BackfillFlag =
  | "RESOLVED"
  | "MISSING_OUT"
  | "ORPHAN_OUT"
  | "DUPLICATE_IN"
  | "AMBIGUOUS_WORKDATE"
  | "NEEDS_REVIEW";

export type BackfillResult = {
  employeeId: string;
  eventsProcessed: number;
  workdaysCreated: number;
  sessionsCreated: number;
  flagged: Array<{ eventId: string; flag: BackfillFlag; reason: string }>;
};

function workedMinutes(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
}

/**
 * Backfill one employee. Deterministic: process events by eventTime ascending.
 * Open IN without OUT → session OPEN + MISSING_OUT flag.
 * OUT without open IN → ORPHAN_OUT, no fake IN.
 */
export async function backfillEmployeeAttendanceWorkdays(
  employeeId: string,
): Promise<BackfillResult> {
  const events = await prisma.attendanceEvent.findMany({
    where: {
      employeeId,
      eventType: { in: punchEventTypes as EventType[] },
      workdayId: null,
    },
    orderBy: { eventTime: "asc" },
  });

  const flagged: BackfillResult["flagged"] = [];
  let workdaysCreated = 0;
  let sessionsCreated = 0;
  let open: {
    sessionId: string;
    workdayId: string;
    checkInAt: Date;
    sequence: number;
  } | null = null;

  const knownWorkdays = new Set<string>();

  for (const event of events) {
    if (isCheckInEvent(event.eventType)) {
      if (open) {
        flagged.push({
          eventId: event.eventId,
          flag: "DUPLICATE_IN",
          reason: "Check-in while prior session still open",
        });
        // Close prior as MISSING_OUT without inventing OUT
        await prisma.attendanceSession.update({
          where: { sessionId: open.sessionId },
          data: { status: "OPEN" },
        });
        await prisma.attendanceWorkday.update({
          where: { workdayId: open.workdayId },
          data: { status: "NEEDS_REVIEW" },
        });
        flagged.push({
          eventId: open.sessionId,
          flag: "MISSING_OUT",
          reason: "Prior open session left open during backfill",
        });
        open = null;
      }

      let ownership;
      try {
        ownership = await resolveWorkDateForPunch(employeeId, event.eventTime);
      } catch {
        flagged.push({
          eventId: event.eventId,
          flag: "AMBIGUOUS_WORKDATE",
          reason: "Could not resolve workDate",
        });
        continue;
      }

      const before = await prisma.attendanceWorkday.findUnique({
        where: {
          employeeId_workDate: {
            employeeId,
            workDate: startOfDayUtc(ownership.workDate),
          },
        },
      });
      const workday = await getOrCreateAttendanceWorkday(employeeId, ownership.workDate);
      if (!before) workdaysCreated += 1;
      knownWorkdays.add(workday.workdayId);

      const seqAgg = await prisma.attendanceSession.aggregate({
        where: { workdayId: workday.workdayId },
        _max: { sequence: true },
      });
      const sequence = (seqAgg._max.sequence ?? 0) + 1;
      const session = await prisma.attendanceSession.create({
        data: {
          workdayId: workday.workdayId,
          employeeId,
          sequence,
          checkInEventId: event.eventId,
          checkInAt: event.eventTime,
          checkInLocationId: event.branchId,
          checkInLocationMode: event.branchId ? "REGISTERED_LOCATION" : "MOBILE_FIELD",
          status: "OPEN",
        },
      });
      sessionsCreated += 1;
      await prisma.attendanceEvent.update({
        where: { eventId: event.eventId },
        data: { workdayId: workday.workdayId, sessionId: session.sessionId },
      });
      await prisma.attendanceWorkday.update({
        where: { workdayId: workday.workdayId },
        data: {
          openSessionId: session.sessionId,
          firstPunchAt: workday.firstPunchAt ?? event.eventTime,
          lastPunchAt: event.eventTime,
        },
      });
      open = {
        sessionId: session.sessionId,
        workdayId: workday.workdayId,
        checkInAt: event.eventTime,
        sequence,
      };
      flagged.push({
        eventId: event.eventId,
        flag: "RESOLVED",
        reason: `Linked to workDate ${workDateIso(ownership.workDate)}`,
      });
      continue;
    }

    if (isCheckOutEvent(event.eventType)) {
      if (!open) {
        flagged.push({
          eventId: event.eventId,
          flag: "ORPHAN_OUT",
          reason: "Checkout without open session",
        });
        // Still attach to calendar eventDate workday for audit without fabricating IN
        const workday = await getOrCreateAttendanceWorkday(employeeId, event.eventDate);
        await prisma.attendanceEvent.update({
          where: { eventId: event.eventId },
          data: { workdayId: workday.workdayId },
        });
        await prisma.attendanceWorkday.update({
          where: { workdayId: workday.workdayId },
          data: { status: "NEEDS_REVIEW" },
        });
        continue;
      }

      const minutes = workedMinutes(open.checkInAt, event.eventTime);
      await prisma.attendanceSession.update({
        where: { sessionId: open.sessionId },
        data: {
          checkOutEventId: event.eventId,
          checkOutAt: event.eventTime,
          checkOutLocationId: event.branchId,
          checkOutLocationMode: event.branchId ? "REGISTERED_LOCATION" : "MOBILE_FIELD",
          workedMinutes: minutes,
          status: "CLOSED",
        },
      });
      await prisma.attendanceEvent.update({
        where: { eventId: event.eventId },
        data: { workdayId: open.workdayId, sessionId: open.sessionId },
      });
      const sessions = await prisma.attendanceSession.findMany({
        where: { workdayId: open.workdayId, status: "CLOSED" },
      });
      const actual = sessions.reduce((s, x) => s + (x.workedMinutes ?? 0), 0);
      await prisma.attendanceWorkday.update({
        where: { workdayId: open.workdayId },
        data: {
          openSessionId: null,
          actualWorkedMinutes: actual,
          lastPunchAt: event.eventTime,
        },
      });
      flagged.push({
        eventId: event.eventId,
        flag: "RESOLVED",
        reason: `Closed session ${open.sessionId}`,
      });
      open = null;
    }
  }

  if (open) {
    flagged.push({
      eventId: open.sessionId,
      flag: "MISSING_OUT",
      reason: "Session still open at end of backfill",
    });
    await prisma.attendanceWorkday.update({
      where: { workdayId: open.workdayId },
      data: { status: "NEEDS_REVIEW" },
    });
  }

  return {
    employeeId,
    eventsProcessed: events.length,
    workdaysCreated,
    sessionsCreated,
    flagged,
  };
}

export async function backfillAllAttendanceWorkdays(limitEmployees = 500) {
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: { employeeId: true },
    take: limitEmployees,
  });
  const results: BackfillResult[] = [];
  for (const e of employees) {
    results.push(await backfillEmployeeAttendanceWorkdays(e.employeeId));
  }
  return results;
}

/** Assert raw evidence untouched (for migration rehearsal). */
export async function assertRawEventsUnchanged(
  before: Array<{ eventId: string; eventTime: Date; branchId: string | null }>,
) {
  for (const row of before) {
    const after = await prisma.attendanceEvent.findUniqueOrThrow({
      where: { eventId: row.eventId },
      select: { eventId: true, eventTime: true, branchId: true },
    });
    if (after.eventTime.getTime() !== row.eventTime.getTime()) {
      throw new Error(`Timestamp mutated for ${row.eventId}`);
    }
    if (after.branchId !== row.branchId) {
      throw new Error(`branchId mutated for ${row.eventId}`);
    }
  }
}
