import { EventSource, EventType, Prisma, WorkType } from "@prisma/client";
import { prisma } from "./prisma.js";
import { publishAttendanceChange } from "./attendanceLive.js";
import {
  cancelApprovedLeaveForDay,
  findApprovedLeaveForDay,
  resolveNoEventStatus,
  startOfDayUtc,
} from "./attendanceDayRules.js";

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

function startOfDay(date: string | Date) {
  return startOfDayUtc(date);
}

function hoursBetween(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 36e5);
}

const officeGeofences = [
  { names: ["Banjara", "Hills"], latitude: 17.4131417, longitude: 78.423295 },
  { names: ["Madhapur"], latitude: 17.4391592, longitude: 78.3947783 },
];
const branchDetectionRadiusKm = 0.3;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function branchForCoordinates(latitude?: number, longitude?: number) {
  if (latitude === undefined || longitude === undefined) return undefined;
  for (const geofence of officeGeofences) {
    if (
      distanceKm(latitude, longitude, geofence.latitude, geofence.longitude) >
      branchDetectionRadiusKm
    )
      continue;
    const branch = await prisma.branch.findFirst({
      where: {
        status: "ACTIVE",
        OR: geofence.names.map((name) => ({
          branchName: { contains: name },
        })),
      },
    });
    if (branch) return branch.branchId;
  }
  return undefined;
}

export async function inferThumbEventType(employeeId: string, branchId: string, eventTime: Date) {
  const day = startOfDay(eventTime);
  const previous = await prisma.attendanceEvent.findFirst({
    where: { employeeId, eventDate: day, eventSource: EventSource.THUMB_SCANNER },
    orderBy: { eventTime: "desc" },
  });
  if (!previous) return EventType.OFFICE_IN;
  if (previous.branchId !== branchId) return EventType.BRANCH_IN;
  return inTypes.has(previous.eventType) ? EventType.OFFICE_OUT : EventType.OFFICE_IN;
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
}) {
  const eventTime = input.eventTime ?? new Date();
  const eventDate = startOfDay(eventTime);
  let eventType =
    input.eventType ??
    (input.eventSource === EventSource.THUMB_SCANNER && input.branchId
      ? await inferThumbEventType(input.employeeId, input.branchId, eventTime)
      : EventType.FIELD_CHECK_IN);

  let branchId = input.branchId;

  if (input.eventSource === EventSource.MOBILE_GPS) {
    branchId = branchId ?? (await branchForCoordinates(input.latitude, input.longitude));
    if (branchId && eventType === EventType.FIELD_CHECK_IN) eventType = EventType.OFFICE_IN;
    if (branchId && eventType === EventType.FIELD_CHECK_OUT) eventType = EventType.OFFICE_OUT;
  }

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
  if (input.eventSource === EventSource.THUMB_SCANNER) {
    await cancelApprovedLeaveForDay(input.employeeId, eventDate);
  }
  await recalculateDailySummary(input.employeeId, eventDate);
  publishAttendanceChange(input.employeeId, eventDate);
  return event;
}

export async function recalculateDailySummary(employeeId: string, date: string | Date) {
  const eventDate = startOfDay(date);
  const [employee, schedule, events] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { employeeId } }),
    prisma.employeeBranchSchedule.findUnique({
      where: { employeeId_date: { employeeId, date: eventDate } },
    }),
    prisma.attendanceEvent.findMany({
      where: { employeeId, eventDate },
      orderBy: { eventTime: "asc" },
      include: { branch: true },
    }),
  ]);

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
  const sourceSet = new Set(events.map((e) => e.eventSource));
  const hasThumb = sourceSet.has(EventSource.THUMB_SCANNER);
  const hasGps = sourceSet.has(EventSource.MOBILE_GPS);
  const sourceSummary =
    hasThumb && hasGps
      ? "OFFICE_PLUS_FIELD"
      : hasThumb
        ? "THUMB_SCANNER"
        : hasGps
          ? "MOBILE_GPS"
          : "SYSTEM";
  const lastOut = [...events].reverse().find((e) => outTypes.has(e.eventType));
  const latestEvent = events.at(-1);
  const hasOpenPunch = Boolean(latestEvent && inTypes.has(latestEvent.eventType));
  const openPunchExpired = Boolean(
    hasOpenPunch &&
    latestEvent &&
    Date.now() - latestEvent.eventTime.getTime() >= 9 * 60 * 60 * 1000,
  );
  // An active work session is valid for nine hours. It becomes a missed checkout only
  // after that window, rather than appearing as an exception immediately after check-in.
  const hasMissingOutEvent = openPunchExpired;
  const hasMissedCheckout = openPunchExpired;

  let officeHours = 0;
  let fieldHours = 0;
  let clientVisitHours = 0;
  let totalWorkedHours = 0;
  let activeWorkStart: Date | undefined;
  const open = new Map<string, Date>();
  for (const event of events) {
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

  const firstCheckIn = events.find((event) => inTypes.has(event.eventType))?.eventTime;
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

  let status = "Absent";
  if (events.length) {
    if (hasThumb && hasGps) status = "Present - Office + Field";
    else if (branches.length > 1) status = "Present - Multi Branch";
    else if (hasGps && !branches.length) status = "Present - Field";
    else if (isBranchMismatch) status = "Present - Other Branch";
    else status = "Present";
    if (hasMissedCheckout) status = "Missed Checkout";
  } else {
    status = await resolveNoEventStatus(employeeId, eventDate);
  }

  const summary = await prisma.attendanceDailySummary.upsert({
    where: { employeeId_date: { employeeId, date: eventDate } },
    create: {
      employeeId,
      date: eventDate,
      firstCheckIn,
      lastCheckOut: lastOut?.eventTime,
      totalHours: new Prisma.Decimal(totalWorkedHours),
      officeHours: new Prisma.Decimal(officeHours),
      fieldHours: new Prisma.Decimal(fieldHours),
      clientVisitHours: new Prisma.Decimal(clientVisitHours),
      attendanceSourceSummary: sourceSummary,
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
      hasMissedCheckout,
    },
    update: {
      firstCheckIn,
      lastCheckOut: lastOut?.eventTime,
      totalHours: new Prisma.Decimal(totalWorkedHours),
      officeHours: new Prisma.Decimal(officeHours),
      fieldHours: new Prisma.Decimal(fieldHours),
      clientVisitHours: new Prisma.Decimal(clientVisitHours),
      attendanceSourceSummary: sourceSummary,
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
      hasMissedCheckout,
    },
  });
  if (firstCheckIn && lastOut) {
    const holiday = await prisma.holiday.findFirst({
      where: {
        status: "ACTIVE",
        date: eventDate,
        OR: [
          { branchId: null },
          ...(employee.homeBranchId ? [{ branchId: employee.homeBranchId }] : []),
        ],
      },
      orderBy: { branchId: "desc" },
    });
    if (holiday) {
      await prisma.compOffCredit.upsert({
        where: { employeeId_earnedDate: { employeeId, earnedDate: eventDate } },
        create: { employeeId, earnedDate: eventDate, holidayId: holiday.holidayId },
        update: { holidayId: holiday.holidayId },
      });
    }
  }
  return summary;
}
