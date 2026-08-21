/**
 * Workday exception detection + sync (no synthetic OUT, no midnight finalize).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { audit } from "./audit.js";
import { readMaintenanceState } from "./maintenance.js";
import { publishNotificationChange } from "./notificationLive.js";
import { sendPushToUsers } from "./push.js";
import type { ScheduleSnapshot } from "./attendanceWorkday.js";
import { workDateIso } from "./attendanceWorkday.js";
import { classifyAttendanceWorkday } from "./attendanceClassification.js";
import {
  ExceptionStatus,
  ExceptionType,
  MISSING_CHECKIN_GRACE_MINUTES,
  MISSING_CHECKOUT_THRESHOLD_MINUTES,
  exceptionDedupeKey,
} from "./attendanceExceptionPolicy.js";

function snapshotOf(raw: unknown): ScheduleSnapshot {
  return raw as ScheduleSnapshot;
}

async function ensureException(input: {
  workdayId: string;
  employeeId: string;
  type: string;
  relatedSessionId?: string | null;
  relatedEventId?: string | null;
  details?: Record<string, unknown>;
  notify?: { title: string; body: string; href: string };
}) {
  const dedupeKey = exceptionDedupeKey(
    input.workdayId,
    input.type,
    input.relatedSessionId,
  );
  const notificationTag = `att-ex-${dedupeKey}`.slice(0, 120);

  try {
    const created = await prisma.attendanceException.create({
      data: {
        workdayId: input.workdayId,
        employeeId: input.employeeId,
        type: input.type,
        status: ExceptionStatus.OPEN,
        relatedSessionId: input.relatedSessionId ?? null,
        relatedEventId: input.relatedEventId ?? null,
        dedupeKey,
        notificationTag,
        details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    await audit({
      action: "EXCEPTION_DETECTED",
      newValue: {
        exceptionId: created.exceptionId,
        type: input.type,
        workdayId: input.workdayId,
        employeeId: input.employeeId,
      },
    });
    if (input.notify) {
      const user = await prisma.user.findFirst({
        where: { employeeId: input.employeeId },
        select: { id: true },
      });
      publishNotificationChange(input.type.toLowerCase(), notificationTag);
      if (user) {
        await sendPushToUsers([user.id], {
          title: input.notify.title,
          body: input.notify.body,
          href: input.notify.href,
          tag: notificationTag,
        });
      }
    }
    return { created: true, exception: created };
  } catch (error) {
    // Unique dedupe_key / notification_tag → concurrent/idempotent detector
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (code === "P2002") {
      const existing = await prisma.attendanceException.findUnique({ where: { dedupeKey } });
      return { created: false, exception: existing };
    }
    throw error;
  }
}

export async function resolveExceptionType(
  workdayId: string,
  type: string,
  _relatedSessionId?: string | null,
) {
  await prisma.attendanceException.updateMany({
    where: {
      workdayId,
      type,
      status: { in: [ExceptionStatus.OPEN, ExceptionStatus.CORRECTION_PENDING] },
    },
    data: { status: ExceptionStatus.RESOLVED, resolvedAt: new Date() },
  });
}

export async function markExceptionsCorrectionPending(workdayId: string) {
  await prisma.attendanceException.updateMany({
    where: {
      workdayId,
      status: ExceptionStatus.OPEN,
      type: {
        in: [ExceptionType.MISSING_CHECK_IN, ExceptionType.MISSING_CHECK_OUT],
      },
    },
    data: { status: ExceptionStatus.CORRECTION_PENDING },
  });
}

/**
 * Recompute late/early/unscheduled/missing flags for one Workday, then classify.
 */
export async function syncWorkdayExceptions(
  workdayId: string,
  options?: { now?: Date; detectMissing?: boolean },
) {
  const now = options?.now ?? new Date();
  const detectMissing = options?.detectMissing !== false;
  const workday = await prisma.attendanceWorkday.findUniqueOrThrow({
    where: { workdayId },
    include: { sessions: { orderBy: { sequence: "asc" } } },
  });

  // Orphan Workdays (employee deleted with FK checks off) must not create exceptions.
  const employeeExists = await prisma.employee.findUnique({
    where: { employeeId: workday.employeeId },
    select: { employeeId: true },
  });
  if (!employeeExists) {
    await prisma.attendanceWorkday.delete({ where: { workdayId } }).catch(() => undefined);
    return null;
  }

  const snap = snapshotOf(workday.scheduleSnapshot);
  const sessions = workday.sessions;
  const open = sessions.find((s) => s.status === "OPEN") ?? null;

  // Unscheduled / explicit NO_SHIFT with punches
  if (
    sessions.length > 0 &&
    (snap.explicitNoShift || snap.source === "NONE" || !snap.segments?.length)
  ) {
    await ensureException({
      workdayId,
      employeeId: workday.employeeId,
      type: snap.explicitNoShift
        ? ExceptionType.SCHEDULED_NO_SHIFT_WORK
        : ExceptionType.UNSCHEDULED_ATTENDANCE,
      details: { source: snap.source, explicitNoShift: snap.explicitNoShift },
    });
  }

  // Late check-in vs first segment + grace (inclusive: exactly grace end = not late)
  const firstSeg = snap.segments?.[0];
  const graceIn = snap.graceInMinutes ?? MISSING_CHECKIN_GRACE_MINUTES;
  if (firstSeg && sessions[0]) {
    const startAt = new Date(firstSeg.startAt);
    const graceEnd = new Date(startAt.getTime() + graceIn * 60_000);
    const firstIn = sessions[0].checkInAt;
    // late if check-in is strictly after grace end
    if (firstIn.getTime() > graceEnd.getTime()) {
      const lateMinutes = Math.floor((firstIn.getTime() - startAt.getTime()) / 60_000);
      await ensureException({
        workdayId,
        employeeId: workday.employeeId,
        type: ExceptionType.LATE_CHECK_IN,
        relatedSessionId: sessions[0].sessionId,
        relatedEventId: sessions[0].checkInEventId,
        details: { lateMinutes, graceInMinutes: graceIn, scheduledStartAt: firstSeg.startAt },
      });
    }
  }

  // Segment-aware late for later segments (metadata only)
  for (let i = 1; i < (snap.segments?.length ?? 0); i++) {
    const seg = snap.segments![i]!;
    const segStart = new Date(seg.startAt);
    const graceEnd = new Date(segStart.getTime() + graceIn * 60_000);
    const matching = sessions.find(
      (s) => s.checkInAt.getTime() >= segStart.getTime() - 60 * 60_000,
    );
    if (matching && matching.checkInAt.getTime() > graceEnd.getTime()) {
      await ensureException({
        workdayId,
        employeeId: workday.employeeId,
        type: ExceptionType.LATE_CHECK_IN,
        relatedSessionId: matching.sessionId,
        relatedEventId: matching.checkInEventId,
        details: {
          segmentSequence: seg.sequence,
          lateMinutes: Math.floor((matching.checkInAt.getTime() - segStart.getTime()) / 60_000),
          scheduledStartAt: seg.startAt,
        },
      });
    }
  }

  // Early checkout vs final scheduled end (or session segment end)
  const lastSeg = snap.segments?.length ? snap.segments[snap.segments.length - 1] : null;
  const graceOut = snap.graceOutMinutes ?? 0;
  for (const session of sessions.filter((s) => s.status === "CLOSED" && s.checkOutAt)) {
    const endRef = lastSeg ? new Date(lastSeg.endAt) : workday.scheduledEndAt;
    if (!endRef) continue;
    const earlyBoundary = new Date(endRef.getTime() - graceOut * 60_000);
    if (session.checkOutAt!.getTime() < earlyBoundary.getTime()) {
      await ensureException({
        workdayId,
        employeeId: workday.employeeId,
        type: ExceptionType.EARLY_CHECK_OUT,
        relatedSessionId: session.sessionId,
        relatedEventId: session.checkOutEventId,
        details: {
          checkOutAt: session.checkOutAt!.toISOString(),
          scheduledEndAt: endRef.toISOString(),
        },
      });
    }
  }

  if (detectMissing && open && workday.scheduledEndAt) {
    const eligibleAt = new Date(
      workday.scheduledEndAt.getTime() + MISSING_CHECKOUT_THRESHOLD_MINUTES * 60_000,
    );
    if (now.getTime() >= eligibleAt.getTime()) {
      await ensureException({
        workdayId,
        employeeId: workday.employeeId,
        type: ExceptionType.MISSING_CHECK_OUT,
        relatedSessionId: open.sessionId,
        relatedEventId: open.checkInEventId,
        details: {
          scheduledEndAt: workday.scheduledEndAt.toISOString(),
          eligibleAt: eligibleAt.toISOString(),
          thresholdMinutes: MISSING_CHECKOUT_THRESHOLD_MINUTES,
          workDate: workDateIso(workday.workDate),
        },
        notify: {
          title: "Missing checkout",
          body: "You did not check out after your shift ended. Submit a correction with your actual punch-out time within two days.",
          href: "/attendance/mine?tab=requests",
        },
      });
    }
  }

  // Missing check-in: scheduled Workday past first-start+grace, no sessions, schedule finished
  if (
    detectMissing &&
    sessions.length === 0 &&
    firstSeg &&
    !snap.explicitNoShift &&
    snap.source !== "NONE"
  ) {
    const startAt = new Date(firstSeg.startAt);
    const missedInAt = new Date(startAt.getTime() + MISSING_CHECKIN_GRACE_MINUTES * 60_000);
    const scheduleDone = workday.scheduledEndAt
      ? now.getTime() >= workday.scheduledEndAt.getTime()
      : false;
    if (now.getTime() >= missedInAt.getTime() && scheduleDone) {
      await ensureException({
        workdayId,
        employeeId: workday.employeeId,
        type: ExceptionType.MISSING_CHECK_IN,
        details: {
          scheduledStartAt: firstSeg.startAt,
          missedInAt: missedInAt.toISOString(),
          workDate: workDateIso(workday.workDate),
        },
        notify: {
          title: "Missed check-in",
          body: "No check-in was recorded for your scheduled Workday. You may submit a correction within two days.",
          href: "/attendance/mine?tab=requests",
        },
      });
    }
  }

  // If sessions closed with OUT, resolve missing checkout
  if (!open) {
    await resolveExceptionType(workdayId, ExceptionType.MISSING_CHECK_OUT);
    if (sessions.length > 0) {
      await resolveExceptionType(workdayId, ExceptionType.MISSING_CHECK_IN);
    }
  }

  return classifyAttendanceWorkday(workdayId, { now });
}

/**
 * Periodic detector — scans recent/open Workdays. Idempotent via dedupe_key.
 */
export async function runAttendanceExceptionDetector(now = new Date()) {
  if (readMaintenanceState().enabled) {
    return { skipped: true, reason: "maintenance", scanned: 0, created: 0 };
  }

  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.attendanceWorkday.findMany({
    where: {
      OR: [
        { status: { in: ["OPEN", "AWAITING_CORRECTION"] } },
        { openSessionId: { not: null } },
        {
          workDate: { gte: windowStart },
          attendanceResult: { in: ["PENDING", "CORRECTION_REQUIRED"] },
        },
      ],
    },
    select: { workdayId: true, employeeId: true },
    take: 500,
  });

  const employeeIds = [...new Set(candidates.map((c) => c.employeeId))];
  const living = await prisma.employee.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { employeeId: true },
  });
  const livingSet = new Set(living.map((e) => e.employeeId));
  const orphanIds = candidates.filter((c) => !livingSet.has(c.employeeId)).map((c) => c.workdayId);
  if (orphanIds.length) {
    await prisma.attendanceWorkday.deleteMany({ where: { workdayId: { in: orphanIds } } });
  }
  const validCandidates = candidates.filter((c) => livingSet.has(c.employeeId));

  let created = 0;
  for (const row of validCandidates) {
    const before = await prisma.attendanceException.count({
      where: { workdayId: row.workdayId },
    });
    await syncWorkdayExceptions(row.workdayId, { now, detectMissing: true });
    const after = await prisma.attendanceException.count({
      where: { workdayId: row.workdayId },
    });
    created += Math.max(0, after - before);
  }

  return {
    skipped: false,
    scanned: validCandidates.length,
    orphansRemoved: orphanIds.length,
    created,
  };
}
