import {
  AttendanceLocationSource,
  AttendanceResult,
  EventSource,
  EventType,
  Prisma,
  WorkType,
} from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "./errors.js";
import { publishAttendanceChange } from "./attendanceLive.js";
import {
  cancelApprovedLeaveForDay,
  findApprovedLeaveForDay,
  findHolidayForEmployee,
  resolveNoEventStatus,
  startOfDayUtc,
} from "./attendanceDayRules.js";
import {
  attendanceResultFromHours,
  workedAttendanceStatusLabel,
  attendancePunchOutDeadline,
  isOvernightCheckIn,
  classifyMobileSource,
  correctionDeadlineFor,
  decimalHours,
  hoursBetween,
  resolveEmployeeShift,
  shiftWindowBounds,
} from "./attendancePolicy.js";
import { isCheckInEvent, isCheckOutEvent } from "./attendanceEventTypes.js";
import {
  applyCorrectionAttendanceEvent,
  findOpenSessionForEmployee,
  recordAttendancePunch,
} from "./attendanceWorkday.js";

const outTypes = new Set<EventType>([
  EventType.OFFICE_OUT,
  EventType.BRANCH_OUT,
  EventType.FIELD_CHECK_OUT,
  EventType.CLIENT_CHECK_OUT,
  EventType.BREAK_OUT,
]);

const inTypes = new Set<EventType>([
  EventType.OFFICE_IN,
  EventType.BRANCH_IN,
  EventType.FIELD_CHECK_IN,
  EventType.CLIENT_CHECK_IN,
  EventType.BREAK_IN,
]);

export const attendancePunchEventTypes = [...inTypes, ...outTypes];

function startOfDay(date: string | Date) {
  return startOfDayUtc(date);
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function indiaCalendarDate(date: Date) {
  const india = new Date(date.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), india.getUTCDate()));
}

export function attendanceDateForShift(
  eventTime: Date,
  shift: { shiftType: "DAY" | "NIGHT"; shiftEndMinutes: number },
) {
  const india = new Date(eventTime.getTime() + IST_OFFSET_MS);
  const minutes = india.getUTCHours() * 60 + india.getUTCMinutes();
  const date = indiaCalendarDate(eventTime);
  if (shift.shiftType === "NIGHT" && minutes <= shift.shiftEndMinutes) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date;
}

export async function attendanceDateForEmployee(employeeId: string, eventTime: Date) {
  const calendarDate = indiaCalendarDate(eventTime);
  const latest = await prisma.attendanceEvent.findFirst({
    where: { employeeId, eventType: { in: attendancePunchEventTypes } },
    orderBy: { eventTime: "desc" },
    select: { eventType: true, eventDate: true, eventTime: true },
  });
  if (latest && inTypes.has(latest.eventType)) {
    const openShift = await resolveEmployeeShift(employeeId, latest.eventDate);
    if (isOvernightCheckIn(latest.eventTime, openShift)) {
      const deadline = attendancePunchOutDeadline(latest.eventDate, openShift, latest.eventTime);
      if (eventTime.getTime() < deadline.getTime()) {
        return startOfDayUtc(latest.eventDate);
      }
    }
  }
  const shift = await resolveEmployeeShift(employeeId, calendarDate);
  return attendanceDateForShift(eventTime, shift);
}

export function openPunchState(
  events: Array<{ eventType: EventType; eventTime: Date }>,
  now = Date.now(),
) {
  const latestEvent = events.at(-1);
  const hasOpenPunch = Boolean(latestEvent && inTypes.has(latestEvent.eventType));
  return { hasOpenPunch, expired: false, latestEvent };
}

export function attendanceTransitionIssue(
  latestEvent: { eventType: EventType; eventDate: Date } | null,
  requestedEventDate: Date,
  isCheckOut: boolean,
) {
  const latestIsOpen = Boolean(latestEvent && inTypes.has(latestEvent.eventType));
  if (!isCheckOut && latestIsOpen) {
    // Prior-day open punches stay empty (Missed Checkout); same-day double check-in is blocked.
    if (latestEvent!.eventDate.getTime() !== requestedEventDate.getTime()) {
      return undefined;
    }
    return "You are already checked in. Refresh to see the latest punch.";
  }
  if (isCheckOut && !latestIsOpen) {
    return "No active check-in was found. Refresh to see the latest punch.";
  }
  // Checkout may close an open punch from the prior attendance date (real GPS out).
  return undefined;
}

function eventLocationSource(event: {
  eventSource: EventSource;
  branchId?: string | null;
}): AttendanceLocationSource {
  if (event.eventSource === EventSource.THUMB_SCANNER)
    return AttendanceLocationSource.THUMB_SCANNER;
  if (event.eventSource === EventSource.MANUAL_CORRECTION) return AttendanceLocationSource.MANUAL;
  if (event.eventSource === EventSource.SYSTEM) return AttendanceLocationSource.SYSTEM;
  if (event.eventSource === EventSource.MOBILE_GPS) {
    return classifyMobileSource(event.branchId);
  }
  return AttendanceLocationSource.SYSTEM;
}

export async function inferThumbEventType(employeeId: string, _branchId: string, _eventTime: Date) {
  const open = await findOpenSessionForEmployee(employeeId);
  if (open) return EventType.OFFICE_OUT;
  return EventType.OFFICE_IN;
}

/**
 * Prefer the client's punch instant (when they completed check-in/out), not server
 * time after face verify / network delay. Clamp absurd clock skew.
 */
export function resolveMobileEventTime(
  clientTime?: Date | null,
  options: { deferred?: boolean } = {},
) {
  const now = new Date();
  if (!clientTime || Number.isNaN(clientTime.getTime())) return now;
  const skewMs = clientTime.getTime() - now.getTime();
  // More than 2 minutes in the future → use server now (bad device clock).
  if (skewMs > 2 * 60_000) return now;
  // Live punches: 5 minutes of clock / network lag. Deferred punches use the signed ticket window.
  if (!options.deferred && skewMs < -5 * 60_000) return now;
  if (options.deferred && skewMs < -16 * 3600_000) {
    throw new HttpError(400, "Queued punch is too old to sync. Check out again while online.");
  }
  return clientTime;
}

export async function createAttendanceEvent(input: {
  employeeId: string;
  eventTime?: Date;
  eventSource: EventSource;
  eventType?: EventType;
  branchId?: string;
  deviceId?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  clientName?: string;
  clientLocationName?: string;
  workType?: WorkType;
  mobileDeviceId?: string;
  photoUrl?: string;
  remarks?: string;
  rawPayload?: Prisma.InputJsonValue;
  createdByUserId?: string;
  clientEventId?: string | null;
}) {
  const eventTime = input.eventTime ?? new Date();
  let eventType =
    input.eventType ??
    (input.eventSource === EventSource.THUMB_SCANNER && input.branchId
      ? await inferThumbEventType(input.employeeId, input.branchId, eventTime)
      : EventType.FIELD_CHECK_IN);

  const branchId = input.branchId;

  if (input.eventSource === EventSource.MOBILE_GPS) {
    if (branchId && eventType === EventType.FIELD_CHECK_IN) eventType = EventType.OFFICE_IN;
    if (branchId && eventType === EventType.FIELD_CHECK_OUT) eventType = EventType.OFFICE_OUT;
  }

  if (isCheckInEvent(eventType) || isCheckOutEvent(eventType)) {
    if (input.eventSource === EventSource.MANUAL_CORRECTION) {
      const event = await applyCorrectionAttendanceEvent({
        employeeId: input.employeeId,
        eventType,
        punchAt: eventTime,
        branchId,
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
        rawPayload: input.rawPayload,
      });
      await recalculateDailySummary(input.employeeId, event.eventDate);
      publishAttendanceChange(input.employeeId, event.eventDate);
      return event;
    }

    const { event } = await recordAttendancePunch({
      employeeId: input.employeeId,
      eventType,
      eventSource: input.eventSource,
      punchAt: eventTime,
      location: {
        branchId: branchId ?? null,
        locationMode: branchId ? "REGISTERED_LOCATION" : "MOBILE_FIELD",
        latitude: input.latitude,
        longitude: input.longitude,
        address: input.address,
      },
      workType: input.workType,
      mobileDeviceId: input.mobileDeviceId,
      photoUrl: input.photoUrl,
      remarks: input.remarks,
      clientName: input.clientName,
      clientLocationName: input.clientLocationName,
      createdByUserId: input.createdByUserId,
      clientEventId: input.clientEventId,
      rawPayload: {
        ...(typeof input.rawPayload === "object" && input.rawPayload
          ? (input.rawPayload as object)
          : {}),
        ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      } as Prisma.InputJsonValue,
    });

    if (input.eventSource === EventSource.THUMB_SCANNER) {
      const leave = await findApprovedLeaveForDay(input.employeeId, event.eventDate, true).then(
        (paidLeave) => paidLeave ?? findApprovedLeaveForDay(input.employeeId, event.eventDate, false),
      );
      if (leave?.session === "FULL") {
        await cancelApprovedLeaveForDay(input.employeeId, event.eventDate);
      }
    }
    await recalculateDailySummary(input.employeeId, event.eventDate);
    publishAttendanceChange(input.employeeId, event.eventDate);
    return event;
  }

  // Non-punch events (LEAVE_MARK, HOLIDAY_MARK, MANUAL_ADJUSTMENT, …): legacy path.
  const eventDate = await attendanceDateForEmployee(input.employeeId, eventTime);
  const event = await prisma.attendanceEvent.create({
    data: {
      employeeId: input.employeeId,
      eventDate,
      eventTime,
      eventSource: input.eventSource,
      eventType,
      branchId,
      deviceId: input.deviceId,
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      clientName: input.clientName,
      clientLocationName: input.clientLocationName,
      workType: input.workType,
      mobileDeviceId: input.mobileDeviceId,
      photoUrl: input.photoUrl,
      remarks: input.remarks,
      rawPayload: input.rawPayload,
      createdByUserId: input.createdByUserId,
    },
  });
  await recalculateDailySummary(input.employeeId, eventDate);
  publishAttendanceChange(input.employeeId, eventDate);
  return event;
}

export async function recalculateDailySummary(employeeId: string, date: string | Date) {
  const eventDate = startOfDay(date);
  const [employee, schedule, events, shift, existing] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { employeeId } }),
    prisma.employeeBranchSchedule.findUnique({
      where: { employeeId_date: { employeeId, date: eventDate } },
    }),
    prisma.attendanceEvent.findMany({
      where: { employeeId, eventDate },
      orderBy: { eventTime: "asc" },
      include: { branch: true },
    }),
    resolveEmployeeShift(employeeId, eventDate),
    prisma.attendanceDailySummary.findUnique({
      where: { employeeId_date: { employeeId, date: eventDate } },
    }),
  ]);

  const bounds = shiftWindowBounds(eventDate, shift);
  const branches = [...new Set(events.map((e) => e.branchId).filter(Boolean))] as string[];
  const visitedLocations = events
    .filter((e) => e.latitude && e.longitude)
    .map((e) => ({
      latitude: Number(e.latitude),
      longitude: Number(e.longitude),
      address: e.address,
      clientName: e.clientName,
      time: e.eventTime.toISOString(),
    }));

  const realCheckIns = events.filter(
    (e) => inTypes.has(e.eventType) && e.eventSource !== EventSource.SYSTEM,
  );
  const realCheckOuts = events.filter(
    (e) => outTypes.has(e.eventType) && e.eventSource !== EventSource.SYSTEM,
  );

  const firstCheckIn =
    realCheckIns[0]?.eventTime ?? events.find((e) => inTypes.has(e.eventType))?.eventTime;
  const lastRealOut = realCheckOuts.at(-1)?.eventTime;
  const { hasOpenPunch } = openPunchState(events);
  // Open session: keep punch-out empty until a real out (never invent a time).
  const lastOut = hasOpenPunch ? null : lastRealOut;
  const lastOpenCheckIn = hasOpenPunch
    ? (realCheckIns.at(-1)?.eventTime ??
      events.filter((event) => inTypes.has(event.eventType)).at(-1)?.eventTime)
    : undefined;
  const punchOutDeadline = attendancePunchOutDeadline(eventDate, shift, lastOpenCheckIn);
  const pastPunchOutDeadline = Date.now() >= punchOutDeadline.getTime();
  // After the day (or night-shift) deadline with no out → Missed Checkout for correction.
  const isMissedCheckout = Boolean(hasOpenPunch && pastPunchOutDeadline);

  let officeHours = 0;
  let fieldHours = 0;
  let clientVisitHours = 0;
  let totalWorkedHours = 0;
  let activeWorkStart: Date | undefined;
  const open = new Map<string, Date>();
  for (const event of events) {
    if (event.eventSource === EventSource.SYSTEM) continue;
    if (inTypes.has(event.eventType) && !activeWorkStart) activeWorkStart = event.eventTime;
    if (outTypes.has(event.eventType) && activeWorkStart) {
      totalWorkedHours += hoursBetween(activeWorkStart, event.eventTime);
      activeWorkStart = undefined;
    }
    const key = event.eventType.includes("CLIENT")
      ? "client"
      : event.eventType.includes("FIELD")
        ? "field"
        : "office";
    if (inTypes.has(event.eventType)) open.set(key, event.eventTime);
    if (outTypes.has(event.eventType) && open.has(key)) {
      const h = hoursBetween(open.get(key)!, event.eventTime);
      if (key === "client") clientVisitHours += h;
      else if (key === "field") fieldHours += h;
      else officeHours += h;
      open.delete(key);
    }
  }

  const hasMissingOutEvent = hasOpenPunch;
  const isLate = false;

  const checkInEvent = realCheckIns[0] ?? events.find((e) => inTypes.has(e.eventType));
  const latestOutEvent = [...events]
    .filter((e) => outTypes.has(e.eventType) && e.eventSource !== EventSource.SYSTEM)
    .sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime())
    .at(-1);
  const checkOutEvent = hasOpenPunch ? undefined : latestOutEvent;
  const checkInSource = checkInEvent ? eventLocationSource(checkInEvent) : null;
  const checkOutSource = checkOutEvent ? eventLocationSource(checkOutEvent) : null;
  const matchedBranchId = checkInEvent?.branchId ?? branches[0] ?? null;

  const sourceSet = new Set(events.map((e) => e.eventSource));
  const hasThumb = sourceSet.has(EventSource.THUMB_SCANNER);
  const hasGps = sourceSet.has(EventSource.MOBILE_GPS);
  const attendanceSourceSummary =
    checkInSource === AttendanceLocationSource.BRANCH_MOBILE
      ? "BRANCH_MOBILE"
      : checkInSource === AttendanceLocationSource.MOBILE
        ? "MOBILE"
        : hasThumb && hasGps
          ? "OFFICE_PLUS_FIELD"
          : hasThumb
            ? "THUMB_SCANNER"
            : hasGps
              ? "MOBILE_GPS"
              : "SYSTEM";

  const isBranchMismatch = Boolean(
    schedule?.scheduledBranchId &&
    branches.length &&
    !branches.includes(schedule.scheduledBranchId),
  );
  const fieldIn = events.find(
    (e) => e.eventType === EventType.FIELD_CHECK_IN || e.eventType === EventType.CLIENT_CHECK_IN,
  );
  const fieldOut = [...events]
    .reverse()
    .find(
      (e) =>
        e.eventType === EventType.FIELD_CHECK_OUT || e.eventType === EventType.CLIENT_CHECK_OUT,
    );

  let attendanceResult: AttendanceResult = AttendanceResult.PENDING;
  let status = "Pending attendance";
  let holidayName: string | undefined;

  const hasPunched = Boolean(firstCheckIn || lastRealOut || hasOpenPunch || realCheckIns.length);
  if (hasPunched) {
    const openCutoff = pastPunchOutDeadline ? punchOutDeadline : new Date();
    const openSessionHours =
      hasOpenPunch && activeWorkStart ? hoursBetween(activeWorkStart, openCutoff) : 0;
    const hoursForStatus = totalWorkedHours + openSessionHours;

    attendanceResult = attendanceResultFromHours(hoursForStatus);
    // Any real punch means the day is not Absent (Full Day only at ≥9h; otherwise Present).
    if (
      attendanceResult === AttendanceResult.ABSENT ||
      attendanceResult === AttendanceResult.HALF_DAY
    ) {
      attendanceResult = AttendanceResult.PENDING;
    }
    status = workedAttendanceStatusLabel(attendanceResult);
  } else {
    const noEvent = await resolveNoEventStatus(employeeId, eventDate);
    status = noEvent;
    if (noEvent.startsWith("Holiday")) {
      attendanceResult = AttendanceResult.HOLIDAY;
      holidayName = noEvent.replace(/^Holiday - /, "");
    } else if (noEvent.startsWith("Week Off")) attendanceResult = AttendanceResult.WEEKLY_OFF;
    else if (noEvent === "Paid Leave") attendanceResult = AttendanceResult.PAID_LEAVE;
    else if (noEvent.startsWith("Unpaid")) attendanceResult = AttendanceResult.UNPAID_LEAVE;
    else if (noEvent === "Absent") attendanceResult = AttendanceResult.ABSENT;
    else attendanceResult = AttendanceResult.PENDING;
  }

  const provisionalCheckOutAt = null;
  let correctionDeadlineAt = existing?.correctionDeadlineAt ?? null;
  let isLocked = existing?.isLocked ?? false;
  if (isMissedCheckout) {
    correctionDeadlineAt =
      correctionDeadlineAt ?? correctionDeadlineFor(eventDate, punchOutDeadline);
    if (correctionDeadlineAt && Date.now() > correctionDeadlineAt.getTime() && hasOpenPunch) {
      isLocked = true;
    }
  } else if (!hasOpenPunch) {
    correctionDeadlineAt = null;
    isLocked = false;
  }

  const summary = await prisma.attendanceDailySummary.upsert({
    where: { employeeId_date: { employeeId, date: eventDate } },
    create: {
      employeeId,
      date: eventDate,
      firstCheckIn,
      lastCheckOut: lastOut,
      totalHours: decimalHours(totalWorkedHours),
      officeHours: decimalHours(officeHours),
      fieldHours: decimalHours(fieldHours),
      clientVisitHours: decimalHours(clientVisitHours),
      attendanceSourceSummary,
      attendanceResult,
      checkInSource,
      checkOutSource,
      matchedBranchId,
      isLate,
      isMissedCheckout,
      isLocked,
      provisionalCheckOutAt,
      correctionDeadlineAt,
      status,
      homeBranchId: employee.homeBranchId,
      scheduledBranchId: schedule?.scheduledBranchId,
      primaryAttendedBranchId: branches[0],
      actualAttendedBranchIds: branches,
      visitedBranchIds: branches,
      visitedLocations,
      branchMovementCount: Math.max(0, branches.length - 1),
      fieldVisitCount: events.filter((e) => e.eventType === EventType.FIELD_CHECK_IN).length,
      clientVisitCount: events.filter((e) => e.eventType === EventType.CLIENT_CHECK_IN).length,
      fieldCheckInLatitude: fieldIn?.latitude,
      fieldCheckInLongitude: fieldIn?.longitude,
      fieldCheckOutLatitude: fieldOut?.latitude,
      fieldCheckOutLongitude: fieldOut?.longitude,
      isBranchMismatch,
      hasOfficeAndField: hasThumb && hasGps,
      hasMissingOutEvent,
      hasMissedCheckout: isMissedCheckout,
    },
    update: {
      firstCheckIn,
      lastCheckOut: lastOut,
      totalHours: decimalHours(totalWorkedHours),
      officeHours: decimalHours(officeHours),
      fieldHours: decimalHours(fieldHours),
      clientVisitHours: decimalHours(clientVisitHours),
      attendanceSourceSummary,
      attendanceResult,
      checkInSource,
      checkOutSource,
      matchedBranchId,
      isLate,
      isMissedCheckout,
      isLocked,
      provisionalCheckOutAt,
      correctionDeadlineAt,
      status,
      homeBranchId: employee.homeBranchId,
      scheduledBranchId: schedule?.scheduledBranchId,
      primaryAttendedBranchId: branches[0],
      actualAttendedBranchIds: branches,
      visitedBranchIds: branches,
      visitedLocations,
      branchMovementCount: Math.max(0, branches.length - 1),
      fieldVisitCount: events.filter((e) => e.eventType === EventType.FIELD_CHECK_IN).length,
      clientVisitCount: events.filter((e) => e.eventType === EventType.CLIENT_CHECK_IN).length,
      fieldCheckInLatitude: fieldIn?.latitude,
      fieldCheckInLongitude: fieldIn?.longitude,
      fieldCheckOutLatitude: fieldOut?.latitude,
      fieldCheckOutLongitude: fieldOut?.longitude,
      isBranchMismatch,
      hasOfficeAndField: hasThumb && hasGps,
      hasMissingOutEvent,
      hasMissedCheckout: isMissedCheckout,
    },
  });

  if (!hasOpenPunch && !isMissedCheckout) {
    await prisma.attendanceReminder.updateMany({
      where: { employeeId, eventDate, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }

  // Comp Off: only full ≥9h holiday sessions earn one credit; revoke invalid demo credits.
  const holiday = await findHolidayForEmployee(employeeId, eventDate);
  if (holiday && firstCheckIn && lastOut && totalWorkedHours >= 9 && !isMissedCheckout) {
    await prisma.compOffCredit.upsert({
      where: { employeeId_earnedDate: { employeeId, earnedDate: eventDate } },
      create: { employeeId, earnedDate: eventDate, holidayId: holiday.holidayId },
      update: {
        holidayId: holiday.holidayId,
        revokedAt: null,
        revokeReason: null,
      },
    });
  } else if (holiday) {
    const existingCredit = await prisma.compOffCredit.findUnique({
      where: { employeeId_earnedDate: { employeeId, earnedDate: eventDate } },
    });
    if (existingCredit && !existingCredit.consumedByLeaveRequestId && !existingCredit.revokedAt) {
      if (!firstCheckIn || !lastOut || totalWorkedHours < 9 || isMissedCheckout) {
        await prisma.compOffCredit.update({
          where: { compOffCreditId: existingCredit.compOffCreditId },
          data: {
            revokedAt: new Date(),
            revokeReason: "Holiday work below nine hours — Comp Off revoked under updated policy",
          },
        });
        await prisma.auditLog.create({
          data: {
            action: "comp_off_credit_revoked",
            newValue: {
              employeeId,
              earnedDate: eventDate.toISOString().slice(0, 10),
              totalHours: totalWorkedHours,
              reason: "Holiday work below nine hours",
            },
          },
        });
      }
    }
  }

  return summary;
}
