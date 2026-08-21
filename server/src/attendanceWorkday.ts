/**
 * Attendance Workday Core — logical workday ≠ calendar date.
 * Snapshot schedule at creation; sessions hold actual worked intervals.
 * Checkout always follows the open session's Workday.
 */
import { EventSource, EventType, Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "./errors.js";
import { startOfDayUtc } from "./attendanceDayRules.js";
import { audit } from "./audit.js";
import {
  resolveEmployeeShiftForWorkDate,
  type ResolvedEmployeeShift,
} from "./shiftRoster.js";
import {
  isCheckInEvent,
  isCheckOutEvent,
  punchEventTypes,
} from "./attendanceEventTypes.js";

export const ATTENDANCE_TIMEZONE = "Asia/Kolkata";

/**
 * Inclusive window: [firstStart - LEAD, finalEnd + TRAIL]
 * firstStart-LEAD inclusive; firstStart-(LEAD+1) outside.
 * finalEnd+TRAIL inclusive; finalEnd+(TRAIL+1) outside.
 * Ownership ONLY — not late/early/payroll.
 */
export const WORKDAY_OWNERSHIP_LEAD_MINUTES = 120;
export const WORKDAY_OWNERSHIP_TRAIL_MINUTES = 180;
/** Unscheduled punches: calendar IST date ± this lead/trail around local midnight is unused; use calendar date. */
export const UNSCHEDULED_OWNERSHIP_LEAD_MINUTES = 0;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

type Db = PrismaClient | Prisma.TransactionClient;

export type ScheduleSegmentSnapshot = {
  sequence: number;
  startAt: string;
  endAt: string;
  startMinute: number;
  endMinute: number;
  endDayOffset: number;
};

export type ScheduleSnapshot = {
  workDate: string;
  timezone: string;
  source: string;
  explicitNoShift: boolean;
  shiftTemplateId: string | null;
  shiftCode: string | null;
  shiftName: string | null;
  expectedWorkMinutes: number | null;
  graceInMinutes: number | null;
  graceOutMinutes: number | null;
  segments: ScheduleSegmentSnapshot[];
  ownership: {
    leadMinutes: number;
    trailMinutes: number;
    windowStartAt: string | null;
    windowEndAt: string | null;
  };
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function workDateIso(d: Date): string {
  const x = startOfDayUtc(d);
  return `${x.getUTCFullYear()}-${pad2(x.getUTCMonth() + 1)}-${pad2(x.getUTCDate())}`;
}

export function indiaCalendarDate(date: Date): Date {
  const india = new Date(date.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), india.getUTCDate()));
}

/** Absolute Instant for workDate + minute-of-day in Asia/Kolkata (no DST). */
export function istWallTimeToUtc(workDate: Date, absoluteMinute: number): Date {
  const day = startOfDayUtc(workDate);
  const dayOffset = Math.floor(absoluteMinute / 1440);
  const minuteOfDay = ((absoluteMinute % 1440) + 1440) % 1440;
  const y = day.getUTCFullYear();
  const m = day.getUTCMonth();
  const d = day.getUTCDate() + dayOffset;
  const h = Math.floor(minuteOfDay / 60);
  const min = minuteOfDay % 60;
  // IST = UTC+5:30 → UTC = wall − 5:30
  return new Date(Date.UTC(y, m, d, h, min) - IST_OFFSET_MS);
}

export function buildScheduleSnapshot(
  resolved: ResolvedEmployeeShift,
  workDate: Date,
): ScheduleSnapshot {
  const segments: ScheduleSegmentSnapshot[] = resolved.segments.map((seg) => {
    const startAt = istWallTimeToUtc(workDate, seg.absoluteStartMinute);
    const endAt = istWallTimeToUtc(workDate, seg.absoluteEndMinute);
    return {
      sequence: seg.sequence,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      startMinute: seg.startMinute,
      endMinute: seg.endMinute,
      endDayOffset: seg.endDayOffset,
    };
  });

  let windowStartAt: string | null = null;
  let windowEndAt: string | null = null;
  if (segments.length) {
    const first = segments[0]!;
    const last = segments[segments.length - 1]!;
    windowStartAt = new Date(
      new Date(first.startAt).getTime() - WORKDAY_OWNERSHIP_LEAD_MINUTES * 60_000,
    ).toISOString();
    windowEndAt = new Date(
      new Date(last.endAt).getTime() + WORKDAY_OWNERSHIP_TRAIL_MINUTES * 60_000,
    ).toISOString();
  }

  return {
    workDate: workDateIso(workDate),
    timezone: resolved.timezone || ATTENDANCE_TIMEZONE,
    source: resolved.source,
    explicitNoShift: resolved.explicitNoShift,
    shiftTemplateId: resolved.shiftTemplate?.id ?? null,
    shiftCode: resolved.shiftTemplate?.code ?? null,
    shiftName: resolved.shiftTemplate?.name ?? null,
    expectedWorkMinutes: resolved.explicitNoShift
      ? null
      : resolved.expectedWorkMinutes || null,
    graceInMinutes: resolved.shiftTemplate?.graceInMinutes ?? null,
    graceOutMinutes: resolved.shiftTemplate?.graceOutMinutes ?? null,
    segments,
    ownership: {
      leadMinutes: WORKDAY_OWNERSHIP_LEAD_MINUTES,
      trailMinutes: WORKDAY_OWNERSHIP_TRAIL_MINUTES,
      windowStartAt,
      windowEndAt,
    },
  };
}

export function ownershipWindowContains(
  snapshot: ScheduleSnapshot,
  punchAt: Date,
): boolean {
  if (!snapshot.ownership.windowStartAt || !snapshot.ownership.windowEndAt) {
    return false;
  }
  const t = punchAt.getTime();
  return (
    t >= new Date(snapshot.ownership.windowStartAt).getTime() &&
    t <= new Date(snapshot.ownership.windowEndAt).getTime()
  );
}

/**
 * Deterministic workDate ownership for a punch timestamp.
 * Candidates: local IST calendar date and previous IST calendar date.
 * Prefer schedule-aware ownership window match; if none, unscheduled calendar date.
 *
 * Checkout with an open session must NOT call this for ownership —
 * open session Workday always wins (see recordPunchOut).
 */
export async function resolveWorkDateForPunch(
  employeeId: string,
  punchTimestamp: Date,
): Promise<{
  workDate: Date;
  reason: string;
  matchedSource: string;
  explicitNoShift: boolean;
  unscheduled: boolean;
}> {
  const calendar = indiaCalendarDate(punchTimestamp);
  const previous = new Date(calendar);
  previous.setUTCDate(previous.getUTCDate() - 1);

  const candidates = [calendar, previous];
  type Match = {
    workDate: Date;
    resolved: ResolvedEmployeeShift;
    snapshot: ScheduleSnapshot;
    distanceMs: number;
  };
  const matches: Match[] = [];

  for (const candidate of candidates) {
    const resolved = await resolveEmployeeShiftForWorkDate(employeeId, candidate);
    if (resolved.explicitNoShift || resolved.source === "NONE" || !resolved.segments.length) {
      continue;
    }
    const snapshot = buildScheduleSnapshot(resolved, candidate);
    if (!ownershipWindowContains(snapshot, punchTimestamp)) continue;
    const mid =
      snapshot.segments.length === 1
        ? (new Date(snapshot.segments[0]!.startAt).getTime() +
            new Date(snapshot.segments[0]!.endAt).getTime()) /
          2
        : (new Date(snapshot.ownership.windowStartAt!).getTime() +
            new Date(snapshot.ownership.windowEndAt!).getTime()) /
          2;
    matches.push({
      workDate: candidate,
      resolved,
      snapshot,
      distanceMs: Math.abs(punchTimestamp.getTime() - mid),
    });
  }

  if (matches.length === 1) {
    const m = matches[0]!;
    return {
      workDate: m.workDate,
      reason: "SCHEDULE_OWNERSHIP_WINDOW",
      matchedSource: m.resolved.source,
      explicitNoShift: false,
      unscheduled: false,
    };
  }
  if (matches.length > 1) {
    // Deterministic: prefer smaller distance to schedule midpoint; tie → later workDate (calendar day of punch).
    matches.sort((a, b) => {
      if (a.distanceMs !== b.distanceMs) return a.distanceMs - b.distanceMs;
      return b.workDate.getTime() - a.workDate.getTime();
    });
    const m = matches[0]!;
    return {
      workDate: m.workDate,
      reason: "SCHEDULE_OWNERSHIP_TIE_BREAK",
      matchedSource: m.resolved.source,
      explicitNoShift: false,
      unscheduled: false,
    };
  }

  // No schedule window matched → unscheduled on punch's IST calendar date.
  const resolvedCal = await resolveEmployeeShiftForWorkDate(employeeId, calendar);
  return {
    workDate: calendar,
    reason: resolvedCal.explicitNoShift
      ? "EXPLICIT_NO_SHIFT_CALENDAR"
      : "UNSCHEDULED_CALENDAR",
    matchedSource: resolvedCal.source,
    explicitNoShift: resolvedCal.explicitNoShift,
    unscheduled: true,
  };
}

export async function getOrCreateAttendanceWorkday(
  employeeId: string,
  workDateInput: Date,
  db: Db = prisma,
) {
  const workDate = startOfDayUtc(workDateInput);
  const existing = await db.attendanceWorkday.findUnique({
    where: { employeeId_workDate: { employeeId, workDate } },
  });
  if (existing) return existing;

  const resolved = await resolveEmployeeShiftForWorkDate(employeeId, workDate);
  const snapshot = buildScheduleSnapshot(resolved, workDate);
  const scheduledStartAt = snapshot.segments[0]
    ? new Date(snapshot.segments[0].startAt)
    : null;
  const scheduledEndAt = snapshot.segments.length
    ? new Date(snapshot.segments[snapshot.segments.length - 1]!.endAt)
    : null;

  try {
    const created = await db.attendanceWorkday.create({
      data: {
        employeeId,
        workDate,
        timezone: snapshot.timezone,
        scheduleSource: snapshot.source,
        explicitNoShift: snapshot.explicitNoShift,
        shiftTemplateId: snapshot.shiftTemplateId,
        shiftCodeSnapshot: snapshot.shiftCode,
        shiftNameSnapshot: snapshot.shiftName,
        expectedWorkMinutes: snapshot.expectedWorkMinutes,
        scheduledStartAt,
        scheduledEndAt,
        scheduleSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        status: "OPEN",
      },
    });
    await audit({
      action: "WORKDAY_CREATED",
      newValue: {
        workdayId: created.workdayId,
        employeeId,
        workDate: workDateIso(workDate),
        source: snapshot.source,
      },
    });
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await db.attendanceWorkday.findUnique({
        where: { employeeId_workDate: { employeeId, workDate } },
      });
      if (again) return again;
    }
    throw error;
  }
}

async function lockEmployee(tx: Prisma.TransactionClient, employeeId: string) {
  await tx.$queryRaw`SELECT \`employee_id\` FROM \`employees\` WHERE \`employee_id\` = ${employeeId} FOR UPDATE`;
}

async function findOpenSession(db: Db, employeeId: string) {
  return db.attendanceSession.findFirst({
    where: { employeeId, status: "OPEN" },
    include: { workday: true },
    orderBy: { checkInAt: "desc" },
  });
}

/** Global open session for an employee (any workday). */
export async function findOpenSessionForEmployee(employeeId: string) {
  return findOpenSession(prisma, employeeId);
}

const IDEMPOTENCY_TIME_TOLERANCE_MS = 5 * 60_000;

async function resolveClientEventIdempotency(
  tx: Prisma.TransactionClient,
  input: RecordPunchInput,
) {
  if (!input.clientEventId) return null;
  const prior = await tx.attendanceEvent.findFirst({
    where: {
      employeeId: input.employeeId,
      clientEventId: input.clientEventId,
    },
  });
  if (!prior) return null;

  const timeDiff = Math.abs(prior.eventTime.getTime() - input.punchAt.getTime());
  if (prior.eventType !== input.eventType || timeDiff > IDEMPOTENCY_TIME_TOLERANCE_MS) {
    throw new HttpError(409, "This punch id was already used with different details.");
  }

  const session = prior.sessionId
    ? await tx.attendanceSession.findUnique({ where: { sessionId: prior.sessionId } })
    : null;
  const workday = prior.workdayId
    ? await tx.attendanceWorkday.findUnique({ where: { workdayId: prior.workdayId } })
    : null;
  return { event: prior, session, workday, idempotent: true as const };
}

function workedMinutesBetween(checkInAt: Date, checkOutAt: Date): number {
  return Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60_000));
}

async function refreshWorkdayCache(db: Db, workdayId: string) {
  const sessions = await db.attendanceSession.findMany({
    where: { workdayId },
    orderBy: { sequence: "asc" },
  });
  const closedMinutes = sessions
    .filter((s) => s.status === "CLOSED" && s.workedMinutes != null)
    .reduce((sum, s) => sum + (s.workedMinutes ?? 0), 0);
  const open = sessions.find((s) => s.status === "OPEN");
  const punches = sessions.flatMap((s) => {
    const times = [s.checkInAt];
    if (s.checkOutAt) times.push(s.checkOutAt);
    return times;
  });
  const firstPunchAt = punches.length
    ? new Date(Math.min(...punches.map((t) => t.getTime())))
    : null;
  const lastPunchAt = punches.length
    ? new Date(Math.max(...punches.map((t) => t.getTime())))
    : null;

  return db.attendanceWorkday.update({
    where: { workdayId },
    data: {
      actualWorkedMinutes: closedMinutes,
      firstPunchAt,
      lastPunchAt,
      openSessionId: open?.sessionId ?? null,
      version: { increment: 1 },
    },
  });
}

export type PunchLocationMeta = {
  branchId?: string | null;
  locationMode: "REGISTERED_LOCATION" | "MOBILE_FIELD";
  latitude?: number;
  longitude?: number;
  address?: string;
  locationAccuracy?: number;
};

export type RecordPunchInput = {
  employeeId: string;
  eventType: EventType;
  eventSource: EventSource;
  punchAt: Date;
  location: PunchLocationMeta;
  workType?: Prisma.AttendanceEventCreateInput["workType"];
  mobileDeviceId?: string;
  photoUrl?: string;
  remarks?: string;
  clientName?: string;
  clientLocationName?: string;
  createdByUserId?: string;
  /** Optional additive idempotency key (Android 1.0.15 may omit). */
  clientEventId?: string | null;
  rawPayload?: Prisma.InputJsonValue;
};

/**
 * Route a live punch to check-in or check-out based on event type.
 */
export async function recordAttendancePunch(input: RecordPunchInput) {
  if (isCheckInEvent(input.eventType)) return recordPunchIn(input);
  if (isCheckOutEvent(input.eventType)) return recordPunchOut(input);
  throw new HttpError(400, "Expected a check-in or check-out event type");
}

/**
 * Check-in: resolve workDate → get/create Workday → ensure no open session →
 * create Event + open Session transactionally.
 */
export async function recordPunchIn(input: RecordPunchInput) {
  if (!isCheckInEvent(input.eventType)) {
    throw new HttpError(400, "Expected a check-in event type");
  }

  return prisma.$transaction(async (tx) => {
    await lockEmployee(tx, input.employeeId);

    const idempotent = await resolveClientEventIdempotency(tx, input);
    if (idempotent) return idempotent;

    const open = await findOpenSession(tx, input.employeeId);
    if (open) {
      throw new HttpError(409, "You're already checked in.");
    }

    const ownership = await resolveWorkDateForPunch(input.employeeId, input.punchAt);
    const workday = await getOrCreateAttendanceWorkday(
      input.employeeId,
      ownership.workDate,
      tx,
    );

    const seqAgg = await tx.attendanceSession.aggregate({
      where: { workdayId: workday.workdayId },
      _max: { sequence: true },
    });
    const sequence = (seqAgg._max.sequence ?? 0) + 1;

    const event = await tx.attendanceEvent.create({
      data: {
        employeeId: input.employeeId,
        eventDate: workday.workDate,
        eventTime: input.punchAt,
        eventSource: input.eventSource,
        eventType: input.eventType,
        branchId: input.location.branchId ?? undefined,
        latitude: input.location.latitude,
        longitude: input.location.longitude,
        address: input.location.address,
        clientName: input.clientName,
        clientLocationName: input.clientLocationName,
        workType: input.workType,
        mobileDeviceId: input.mobileDeviceId,
        photoUrl: input.photoUrl,
        remarks: input.remarks,
        createdByUserId: input.createdByUserId,
        workdayId: workday.workdayId,
        clientEventId: input.clientEventId || null,
        rawPayload: {
          ...(typeof input.rawPayload === "object" && input.rawPayload
            ? (input.rawPayload as object)
            : {}),
          locationMode: input.location.locationMode,
          locationAccuracy: input.location.locationAccuracy,
          workdayCore: true,
        } as Prisma.InputJsonValue,
      },
    });

    const session = await tx.attendanceSession.create({
      data: {
        workdayId: workday.workdayId,
        employeeId: input.employeeId,
        sequence,
        checkInEventId: event.eventId,
        checkInAt: input.punchAt,
        checkInLocationId: input.location.branchId ?? null,
        checkInLocationMode: input.location.locationMode,
        status: "OPEN",
      },
    });

    await tx.attendanceEvent.update({
      where: { eventId: event.eventId },
      data: { sessionId: session.sessionId },
    });

    const updatedWorkday = await refreshWorkdayCache(tx, workday.workdayId);

    await audit({
      action: "CHECK_IN",
      newValue: {
        sessionId: session.sessionId,
        workdayId: workday.workdayId,
        eventId: event.eventId,
        employeeId: input.employeeId,
      },
    });

    return {
      event: { ...event, sessionId: session.sessionId },
      session,
      workday: updatedWorkday,
      idempotent: false as const,
    };
  });
}

/**
 * Check-out: open session owns the Workday — never calendar-date reassignment.
 */
export async function recordPunchOut(input: RecordPunchInput) {
  if (!isCheckOutEvent(input.eventType)) {
    throw new HttpError(400, "Expected a check-out event type");
  }

  return prisma.$transaction(async (tx) => {
    await lockEmployee(tx, input.employeeId);

    const idempotent = await resolveClientEventIdempotency(tx, input);
    if (idempotent) return idempotent;

    const open = await findOpenSession(tx, input.employeeId);
    if (!open) {
      throw new HttpError(409, "No active attendance session was found.");
    }

    const event = await tx.attendanceEvent.create({
      data: {
        employeeId: input.employeeId,
        eventDate: open.workday.workDate,
        eventTime: input.punchAt,
        eventSource: input.eventSource,
        eventType: input.eventType,
        branchId: input.location.branchId ?? undefined,
        latitude: input.location.latitude,
        longitude: input.location.longitude,
        address: input.location.address,
        clientName: input.clientName,
        clientLocationName: input.clientLocationName,
        workType: input.workType,
        mobileDeviceId: input.mobileDeviceId,
        photoUrl: input.photoUrl,
        remarks: input.remarks,
        createdByUserId: input.createdByUserId,
        workdayId: open.workdayId,
        sessionId: open.sessionId,
        clientEventId: input.clientEventId || null,
        rawPayload: {
          ...(typeof input.rawPayload === "object" && input.rawPayload
            ? (input.rawPayload as object)
            : {}),
          locationMode: input.location.locationMode,
          locationAccuracy: input.location.locationAccuracy,
          workdayCore: true,
        } as Prisma.InputJsonValue,
      },
    });

    const minutes = workedMinutesBetween(open.checkInAt, input.punchAt);
    const session = await tx.attendanceSession.update({
      where: { sessionId: open.sessionId },
      data: {
        checkOutEventId: event.eventId,
        checkOutAt: input.punchAt,
        checkOutLocationId: input.location.branchId ?? null,
        checkOutLocationMode: input.location.locationMode,
        workedMinutes: minutes,
        status: "CLOSED",
      },
    });

    const updatedWorkday = await refreshWorkdayCache(tx, open.workdayId);

    await audit({
      action: "CHECK_OUT",
      newValue: {
        sessionId: session.sessionId,
        workdayId: open.workdayId,
        eventId: event.eventId,
        workedMinutes: minutes,
        employeeId: input.employeeId,
      },
    });

    return {
      event,
      session,
      workday: updatedWorkday,
      idempotent: false as const,
    };
  });
}

export type CorrectionAttendanceEventInput = {
  employeeId: string;
  eventType: EventType;
  punchAt: Date;
  branchId?: string | null;
  latitude?: number;
  longitude?: number;
  address?: string;
  clientName?: string;
  clientLocationName?: string;
  workType?: Prisma.AttendanceEventCreateInput["workType"];
  mobileDeviceId?: string;
  photoUrl?: string;
  remarks?: string;
  createdByUserId?: string;
  rawPayload?: Prisma.InputJsonValue;
};

/**
 * Insert MANUAL_CORRECTION punch evidence, then rebuild sessions via reconcile.
 * Does not use recordPunchIn/Out (avoids live-session 409 conflicts).
 */
export async function applyCorrectionAttendanceEvent(input: CorrectionAttendanceEventInput) {
  if (!isCheckInEvent(input.eventType) && !isCheckOutEvent(input.eventType)) {
    throw new HttpError(400, "Correction must be a check-in or check-out event type");
  }

  return prisma.$transaction(async (tx) => {
    await lockEmployee(tx, input.employeeId);

    const open = await findOpenSession(tx, input.employeeId);
    let workDate: Date;
    if (open && isCheckOutEvent(input.eventType)) {
      workDate = open.workday.workDate;
    } else {
      const ownership = await resolveWorkDateForPunch(input.employeeId, input.punchAt);
      workDate = ownership.workDate;
    }

    const workday = await getOrCreateAttendanceWorkday(input.employeeId, workDate, tx);

    const event = await tx.attendanceEvent.create({
      data: {
        employeeId: input.employeeId,
        eventDate: workday.workDate,
        eventTime: input.punchAt,
        eventSource: EventSource.MANUAL_CORRECTION,
        eventType: input.eventType,
        branchId: input.branchId ?? undefined,
        latitude: input.latitude,
        longitude: input.longitude,
        address: input.address,
        clientName: input.clientName,
        clientLocationName: input.clientLocationName,
        workType: input.workType,
        mobileDeviceId: input.mobileDeviceId,
        photoUrl: input.photoUrl,
        remarks: input.remarks,
        createdByUserId: input.createdByUserId,
        workdayId: workday.workdayId,
        rawPayload: {
          ...(typeof input.rawPayload === "object" && input.rawPayload
            ? (input.rawPayload as object)
            : {}),
          workdayCore: true,
          correction: true,
        } as Prisma.InputJsonValue,
      },
    });

    await reconcileAttendanceWorkday(input.employeeId, workday.workDate, { db: tx });

    const refreshed = await tx.attendanceEvent.findUniqueOrThrow({
      where: { eventId: event.eventId },
    });
    return refreshed;
  });
}

/**
 * Deterministic session rebuild for one workday from punch evidence.
 * Non-destructive to raw event fields (time/type/source/branch). Idempotent for clean pairs.
 */
export async function reconcileAttendanceWorkday(
  employeeId: string,
  workDateInput: Date | string,
  options?: { db?: Db },
) {
  const workDate =
    typeof workDateInput === "string"
      ? startOfDayUtc(workDateInput)
      : startOfDayUtc(workDateInput);

  const run = async (db: Db) => {
    await lockEmployee(db as Prisma.TransactionClient, employeeId);

    const workday = await getOrCreateAttendanceWorkday(employeeId, workDate, db);

    const linkedOrSameDate = await db.attendanceEvent.findMany({
      where: {
        OR: [
          { workdayId: workday.workdayId },
          {
            employeeId,
            eventDate: workDate,
            eventType: { in: punchEventTypes as EventType[] },
          },
        ],
      },
      orderBy: [{ eventTime: "asc" }, { eventId: "asc" }],
    });

    const byId = new Map<string, (typeof linkedOrSameDate)[number]>();
    for (const ev of linkedOrSameDate) {
      if (!isCheckInEvent(ev.eventType) && !isCheckOutEvent(ev.eventType)) continue;
      byId.set(ev.eventId, ev);
    }
    const events = [...byId.values()].sort((a, b) => {
      const t = a.eventTime.getTime() - b.eventTime.getTime();
      return t !== 0 ? t : a.eventId.localeCompare(b.eventId);
    });

    await db.attendanceWorkday.update({
      where: { workdayId: workday.workdayId },
      data: { openSessionId: null },
    });
    await db.attendanceEvent.updateMany({
      where: { workdayId: workday.workdayId },
      data: { sessionId: null },
    });
    // Also clear sessionId on same-date punches that may not yet have workdayId.
    if (events.length) {
      await db.attendanceEvent.updateMany({
        where: { eventId: { in: events.map((e) => e.eventId) } },
        data: { sessionId: null },
      });
    }
    await db.attendanceSession.deleteMany({ where: { workdayId: workday.workdayId } });

    let needsReview = false;
    let open: {
      sessionId: string;
      checkInAt: Date;
    } | null = null;
    let sequence = 0;

    for (const event of events) {
      if (event.workdayId !== workday.workdayId) {
        await db.attendanceEvent.update({
          where: { eventId: event.eventId },
          data: { workdayId: workday.workdayId },
        });
      }

      if (isCheckInEvent(event.eventType)) {
        if (open) {
          // Leave previous session OPEN (no synthetic out); start a new session.
          needsReview = true;
          open = null;
        }
        sequence += 1;
        const session = await db.attendanceSession.create({
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
        await db.attendanceEvent.update({
          where: { eventId: event.eventId },
          data: { workdayId: workday.workdayId, sessionId: session.sessionId },
        });
        open = { sessionId: session.sessionId, checkInAt: event.eventTime };
        continue;
      }

      if (isCheckOutEvent(event.eventType)) {
        if (!open) {
          // Orphan OUT: keep on workday, no session link.
          needsReview = true;
          await db.attendanceEvent.update({
            where: { eventId: event.eventId },
            data: { workdayId: workday.workdayId, sessionId: null },
          });
          continue;
        }
        const minutes = workedMinutesBetween(open.checkInAt, event.eventTime);
        await db.attendanceSession.update({
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
        await db.attendanceEvent.update({
          where: { eventId: event.eventId },
          data: { workdayId: workday.workdayId, sessionId: open.sessionId },
        });
        open = null;
      }
    }

    const status = needsReview ? "NEEDS_REVIEW" : open ? "OPEN" : "COMPLETE";
    await db.attendanceWorkday.update({
      where: { workdayId: workday.workdayId },
      data: { status },
    });

    const updatedWorkday = await refreshWorkdayCache(db, workday.workdayId);
    const sessions = await db.attendanceSession.findMany({
      where: { workdayId: workday.workdayId },
      orderBy: { sequence: "asc" },
    });

    return {
      workday: updatedWorkday,
      sessions,
      eventCount: events.length,
    };
  };

  if (options?.db) {
    return run(options.db);
  }
  return prisma.$transaction(async (tx) => run(tx));
}

export async function getCurrentAttendanceState(employeeId: string) {
  const open = await findOpenSession(prisma, employeeId);
  let workday = open?.workday ?? null;
  if (!workday) {
    const ownership = await resolveWorkDateForPunch(employeeId, new Date());
    workday = await prisma.attendanceWorkday.findUnique({
      where: {
        employeeId_workDate: {
          employeeId,
          workDate: startOfDayUtc(ownership.workDate),
        },
      },
    });
  }

  const sessions = workday
    ? await prisma.attendanceSession.findMany({
        where: { workdayId: workday.workdayId },
        orderBy: { sequence: "asc" },
        include: {
          workday: false,
        },
      })
    : [];

  const snapshot = (workday?.scheduleSnapshot ?? null) as ScheduleSnapshot | null;
  const closedMinutes = sessions
    .filter((s) => s.status === "CLOSED")
    .reduce((sum, s) => sum + (s.workedMinutes ?? 0), 0);
  const openSession = sessions.find((s) => s.status === "OPEN") ?? null;
  const liveOpenMinutes = openSession
    ? workedMinutesBetween(openSession.checkInAt, new Date())
    : 0;

  return {
    workdayId: workday?.workdayId ?? null,
    workDate: workday ? workDateIso(workday.workDate) : null,
    checkedIn: Boolean(openSession),
    currentSession: openSession,
    firstCheckIn: workday?.firstPunchAt ?? null,
    workedMinutes: closedMinutes,
    liveWorkedMinutes: closedMinutes + liveOpenMinutes,
    scheduledShift: snapshot
      ? {
          source: snapshot.source,
          explicitNoShift: snapshot.explicitNoShift,
          shiftCode: snapshot.shiftCode,
          shiftName: snapshot.shiftName,
          expectedMinutes: snapshot.expectedWorkMinutes,
          segments: snapshot.segments,
          timezone: snapshot.timezone,
        }
      : null,
    sessions,
    nextExpectedAction: openSession ? ("CHECK_OUT" as const) : ("CHECK_IN" as const),
  };
}

export async function serializeWorkdayDetail(workdayId: string) {
  const workday = await prisma.attendanceWorkday.findUnique({
    where: { workdayId },
    include: {
      sessions: { orderBy: { sequence: "asc" } },
      employee: {
        select: {
          employeeId: true,
          employeeCode: true,
          name: true,
          homeBranchId: true,
        },
      },
    },
  });
  if (!workday) return null;
  const snapshot = workday.scheduleSnapshot as ScheduleSnapshot;
  return {
    workdayId: workday.workdayId,
    employee: workday.employee,
    workDate: workDateIso(workday.workDate),
    status: workday.status,
    schedule: {
      source: workday.scheduleSource,
      explicitNoShift: workday.explicitNoShift,
      shift: workday.shiftTemplateId
        ? {
            id: workday.shiftTemplateId,
            code: workday.shiftCodeSnapshot,
            name: workday.shiftNameSnapshot,
          }
        : null,
      timezone: workday.timezone,
      expectedMinutes: workday.expectedWorkMinutes,
      segments: snapshot.segments ?? [],
      scheduledStartAt: workday.scheduledStartAt,
      scheduledEndAt: workday.scheduledEndAt,
    },
    actual: {
      workedMinutes: workday.actualWorkedMinutes,
      firstPunchAt: workday.firstPunchAt,
      lastPunchAt: workday.lastPunchAt,
      openSessionId: workday.openSessionId,
      sessions: workday.sessions,
    },
  };
}

/** Live display helper — does not persist. */
export function liveWorkedMinutesForWorkday(
  sessions: Array<{ status: string; workedMinutes: number | null; checkInAt: Date }>,
  now = new Date(),
): number {
  let total = 0;
  for (const s of sessions) {
    if (s.status === "CLOSED" && s.workedMinutes != null) total += s.workedMinutes;
    else if (s.status === "OPEN") total += workedMinutesBetween(s.checkInAt, now);
  }
  return total;
}

export { punchEventTypes };
