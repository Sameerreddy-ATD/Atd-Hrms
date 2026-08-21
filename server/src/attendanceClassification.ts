/**
 * Canonical AttendanceWorkday classification.
 * One engine for Dashboard / Attendance / Admin / future payroll reads.
 */
import type { AttendanceWorkday, AttendanceSession, AttendanceException } from "@prisma/client";
import { prisma } from "./prisma.js";
import { audit } from "./audit.js";
import type { ScheduleSnapshot } from "./attendanceWorkday.js";
import { workDateIso } from "./attendanceWorkday.js";
import {
  CLASSIFICATION_VERSION,
  CorrectionLockState,
  ExceptionStatus,
  ExceptionType,
  MISSING_CHECKOUT_THRESHOLD_MINUTES,
  WorkdayAttendanceResult,
  WorkdayLifecycle,
  attendanceResultFromWorkedMinutes,
  employeeCorrectionWindowEndsAt,
  workdayResultLabel,
  type WorkdayAttendanceResultName,
} from "./attendanceExceptionPolicy.js";
import { resolveNoEventStatus, findApprovedLeaveForDay } from "./attendanceDayRules.js";

export type ClassificationInput = {
  workday: AttendanceWorkday;
  sessions: AttendanceSession[];
  exceptions: AttendanceException[];
  now?: Date;
};

export type ClassificationOutput = {
  attendanceResult: WorkdayAttendanceResultName;
  classificationReason: string;
  lifecycleStatus: string;
  closedWorkedMinutes: number;
  liveOpenMinutes: number;
  correctionLockState: string;
  employeeCorrectionEndsAt: Date | null;
  hasOpenSession: boolean;
  hasMissingCheckout: boolean;
  requiresCorrection: boolean;
};

function snapshotOf(workday: AttendanceWorkday): ScheduleSnapshot {
  return workday.scheduleSnapshot as unknown as ScheduleSnapshot;
}

function closedMinutes(sessions: AttendanceSession[]): number {
  return sessions
    .filter((s) => s.status === "CLOSED")
    .reduce((sum, s) => sum + (s.workedMinutes ?? 0), 0);
}

function openSession(sessions: AttendanceSession[]) {
  return sessions.find((s) => s.status === "OPEN") ?? null;
}

function missingCheckoutEligibleAt(workday: AttendanceWorkday): Date | null {
  if (!workday.scheduledEndAt) return null;
  return new Date(
    workday.scheduledEndAt.getTime() + MISSING_CHECKOUT_THRESHOLD_MINUTES * 60_000,
  );
}

export function classifyAttendanceWorkdayInput(input: ClassificationInput): ClassificationOutput {
  const now = input.now ?? new Date();
  const snap = snapshotOf(input.workday);
  const open = openSession(input.sessions);
  const closed = closedMinutes(input.sessions);
  const liveOpen =
    open != null
      ? Math.max(0, Math.floor((now.getTime() - open.checkInAt.getTime()) / 60_000))
      : 0;

  const openExceptions = input.exceptions.filter(
    (e) => e.status === ExceptionStatus.OPEN || e.status === ExceptionStatus.CORRECTION_PENDING,
  );
  const missingOut = openExceptions.some((e) => e.type === ExceptionType.MISSING_CHECK_OUT);
  const missingIn = openExceptions.some((e) => e.type === ExceptionType.MISSING_CHECK_IN);
  const unscheduledFlag = openExceptions.some(
    (e) =>
      e.type === ExceptionType.UNSCHEDULED_ATTENDANCE ||
      e.type === ExceptionType.SCHEDULED_NO_SHIFT_WORK,
  );

  const eligibility = missingCheckoutEligibleAt(input.workday);
  const pastMissingOutThreshold =
    Boolean(open) && eligibility != null && now.getTime() >= eligibility.getTime();

  let employeeCorrectionEndsAt = input.workday.employeeCorrectionEndsAt;
  let correctionLockState = input.workday.correctionLockState || CorrectionLockState.OPEN;

  if (pastMissingOutThreshold || missingOut) {
    const base = eligibility ?? now;
    employeeCorrectionEndsAt = employeeCorrectionEndsAt ?? employeeCorrectionWindowEndsAt(base);
    if (employeeCorrectionEndsAt && now.getTime() > employeeCorrectionEndsAt.getTime()) {
      correctionLockState = CorrectionLockState.EMPLOYEE_LOCKED;
    }
  }

  const requiresCorrection = Boolean(
    (open && pastMissingOutThreshold) || missingOut || missingIn,
  );

  // Open session before missing-checkout threshold → live Pending (not finalized Full/Half/Absent)
  if (open && !pastMissingOutThreshold && !missingOut) {
    return {
      attendanceResult: WorkdayAttendanceResult.PENDING,
      classificationReason: "Open session — classification pending until checkout",
      lifecycleStatus: WorkdayLifecycle.OPEN,
      closedWorkedMinutes: closed,
      liveOpenMinutes: liveOpen,
      correctionLockState,
      employeeCorrectionEndsAt,
      hasOpenSession: true,
      hasMissingCheckout: false,
      requiresCorrection: false,
    };
  }

  if (requiresCorrection) {
    return {
      attendanceResult: WorkdayAttendanceResult.CORRECTION_REQUIRED,
      classificationReason: missingIn
        ? "Missing check-in — correction required"
        : "Missing checkout — session left open; no synthetic OUT",
      lifecycleStatus:
        correctionLockState === CorrectionLockState.EMPLOYEE_LOCKED
          ? WorkdayLifecycle.FINAL
          : WorkdayLifecycle.AWAITING_CORRECTION,
      closedWorkedMinutes: closed,
      liveOpenMinutes: liveOpen,
      correctionLockState,
      employeeCorrectionEndsAt,
      hasOpenSession: Boolean(open),
      hasMissingCheckout: Boolean(open || missingOut),
      requiresCorrection: true,
    };
  }

  const unscheduled =
    snap.explicitNoShift ||
    snap.source === "NONE" ||
    unscheduledFlag ||
    (!snap.segments?.length && input.sessions.length > 0);

  if (unscheduled && input.sessions.length > 0) {
    return {
      attendanceResult: WorkdayAttendanceResult.UNSCHEDULED,
      classificationReason: "Unscheduled / NO_SHIFT attendance — not auto Full Day",
      lifecycleStatus: WorkdayLifecycle.READY,
      closedWorkedMinutes: closed,
      liveOpenMinutes: 0,
      correctionLockState: CorrectionLockState.OPEN,
      employeeCorrectionEndsAt: null,
      hasOpenSession: false,
      hasMissingCheckout: false,
      requiresCorrection: false,
    };
  }

  if (input.sessions.length === 0) {
    // External day types only when no punch evidence on this Workday
    return {
      attendanceResult: WorkdayAttendanceResult.PENDING,
      classificationReason: "No sessions on Workday yet",
      lifecycleStatus: WorkdayLifecycle.OPEN,
      closedWorkedMinutes: 0,
      liveOpenMinutes: 0,
      correctionLockState: CorrectionLockState.OPEN,
      employeeCorrectionEndsAt: null,
      hasOpenSession: false,
      hasMissingCheckout: false,
      requiresCorrection: false,
    };
  }

  const band = attendanceResultFromWorkedMinutes(closed);
  return {
    attendanceResult: WorkdayAttendanceResult[band],
    classificationReason: `Closed worked minutes ${closed} → ${band}`,
    lifecycleStatus: WorkdayLifecycle.READY,
    closedWorkedMinutes: closed,
    liveOpenMinutes: 0,
    correctionLockState: CorrectionLockState.OPEN,
    employeeCorrectionEndsAt: null,
    hasOpenSession: false,
    hasMissingCheckout: false,
    requiresCorrection: false,
  };
}

/**
 * Persist classification onto the Workday. Optionally enrich ABSENT/PENDING with leave/holiday
 * when there is no session evidence (read-only leave awareness — no leave mutation).
 */
export async function classifyAttendanceWorkday(
  workdayId: string,
  options?: { now?: Date; actorUserId?: string | null },
) {
  const workday = await prisma.attendanceWorkday.findUniqueOrThrow({
    where: { workdayId },
    include: {
      sessions: { orderBy: { sequence: "asc" } },
      exceptions: true,
    },
  });

  let result = classifyAttendanceWorkdayInput({
    workday,
    sessions: workday.sessions,
    exceptions: workday.exceptions,
    now: options?.now,
  });

  if (workday.sessions.length === 0 && result.attendanceResult === WorkdayAttendanceResult.PENDING) {
    const external = await resolveNoEventStatus(workday.employeeId, workday.workDate);
    if (external.startsWith("Holiday")) {
      result = {
        ...result,
        attendanceResult: WorkdayAttendanceResult.HOLIDAY,
        classificationReason: external,
        lifecycleStatus: WorkdayLifecycle.READY,
      };
    } else if (external.startsWith("Week Off")) {
      result = {
        ...result,
        attendanceResult: WorkdayAttendanceResult.WEEKLY_OFF,
        classificationReason: external,
        lifecycleStatus: WorkdayLifecycle.READY,
      };
    } else if (external === "Paid Leave") {
      result = {
        ...result,
        attendanceResult: WorkdayAttendanceResult.PAID_LEAVE,
        classificationReason: "Approved Leave (paid) — Workday has no punches",
        lifecycleStatus: WorkdayLifecycle.READY,
      };
    } else if (external.startsWith("Unpaid")) {
      result = {
        ...result,
        attendanceResult: WorkdayAttendanceResult.UNPAID_LEAVE,
        classificationReason: "Approved Leave (unpaid) — Workday has no punches",
        lifecycleStatus: WorkdayLifecycle.READY,
      };
    } else if (external === "Absent") {
      const end = workday.scheduledEndAt;
      const now = options?.now ?? new Date();
      if (end && now.getTime() >= end.getTime()) {
        result = {
          ...result,
          attendanceResult: WorkdayAttendanceResult.ABSENT,
          classificationReason: "No check-in after scheduled Workday end",
          lifecycleStatus: WorkdayLifecycle.READY,
        };
      }
    }
  } else if (workday.sessions.length > 0) {
    // Preserve punches + leave; never discard either source silently.
    const paidLeave = await findApprovedLeaveForDay(workday.employeeId, workday.workDate, true);
    const unpaidLeave = await findApprovedLeaveForDay(workday.employeeId, workday.workDate, false);
    const leave = paidLeave ?? unpaidLeave;
    if (leave) {
      result = {
        ...result,
        attendanceResult: WorkdayAttendanceResult.LEAVE_ATTENDANCE_CONFLICT,
        classificationReason: `Approved leave (${leave.session}) with recorded attendance — review required. Sessions preserved.`,
        lifecycleStatus: WorkdayLifecycle.READY,
      };
    }
  }

  const previous = workday.attendanceResult;
  const updated = await prisma.attendanceWorkday.update({
    where: { workdayId },
    data: {
      attendanceResult: result.attendanceResult,
      classificationReason: result.classificationReason,
      classificationVersion: CLASSIFICATION_VERSION,
      classifiedAt: new Date(),
      status: result.lifecycleStatus,
      correctionLockState: result.correctionLockState,
      employeeCorrectionEndsAt: result.employeeCorrectionEndsAt,
      actualWorkedMinutes: result.closedWorkedMinutes,
    },
  });

  if (previous !== result.attendanceResult) {
    await audit({
      action: "WORKDAY_RECLASSIFIED",
      performedByUserId: options?.actorUserId ?? undefined,
      oldValue: { attendanceResult: previous, workdayId },
      newValue: {
        attendanceResult: result.attendanceResult,
        reason: result.classificationReason,
        workDate: workDateIso(workday.workDate),
        workdayId,
      },
    });
  }

  return { workday: updated, classification: result, resultLabel: workdayResultLabel(result.attendanceResult) };
}
