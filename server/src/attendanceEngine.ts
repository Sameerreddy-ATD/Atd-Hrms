import { EventSource, EventType, Prisma, WorkType } from "@prisma/client";
import { prisma } from "./prisma.js";

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
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function hoursBetween(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 36e5);
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
  const eventType =
    input.eventType ??
    (input.eventSource === EventSource.THUMB_SCANNER && input.branchId
      ? await inferThumbEventType(input.employeeId, input.branchId, eventTime)
      : EventType.FIELD_CHECK_IN);

  const event = await prisma.attendanceEvent.create({
    data: {
      employeeId: input.employeeId,
      eventDate,
      eventTime,
      eventSource: input.eventSource,
      eventType,
      branchId: input.branchId,
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
  return event;
}

export async function recalculateDailySummary(employeeId: string, date: string | Date) {
  const eventDate = startOfDay(date);
  const [employee, schedule, events, paidLeave, unpaidLeave] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { employeeId } }),
    prisma.employeeBranchSchedule.findUnique({
      where: { employeeId_date: { employeeId, date: eventDate } },
    }),
    prisma.attendanceEvent.findMany({
      where: { employeeId, eventDate },
      orderBy: { eventTime: "asc" },
      include: { branch: true },
    }),
    prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        fromDate: { lte: eventDate },
        toDate: { gte: eventDate },
        status: "APPROVED",
        leaveType: { paid: true },
      },
    }),
    prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        fromDate: { lte: eventDate },
        toDate: { gte: eventDate },
        status: "APPROVED",
        leaveType: { paid: false },
      },
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
  const hasMissingOutEvent = events.length > 0 && !lastOut;
  const hasMissedCheckout =
    events.some((e) => e.eventType === EventType.CLIENT_CHECK_IN) &&
    !events.some((e) => e.eventType === EventType.CLIENT_CHECK_OUT);

  let officeHours = 0;
  let fieldHours = 0;
  let clientVisitHours = 0;
  const open = new Map<string, Date>();
  for (const event of events) {
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

  const firstCheckIn = events[0]?.eventTime;
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
    else if (hasGps) status = "Present - Field";
    else if (isBranchMismatch) status = "Present - Other Branch";
    else status = "Present";
    if (hasMissedCheckout) status = "Missed Checkout";
    else if (hasMissingOutEvent) status = "Missed Punch";
  } else if (paidLeave) status = "Paid Leave";
  else if (unpaidLeave) status = "Unpaid Leave / LOP";

  return prisma.attendanceDailySummary.upsert({
    where: { employeeId_date: { employeeId, date: eventDate } },
    create: {
      employeeId,
      date: eventDate,
      firstCheckIn,
      lastCheckOut: lastOut?.eventTime,
      totalHours: new Prisma.Decimal(officeHours + fieldHours + clientVisitHours),
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
      totalHours: new Prisma.Decimal(officeHours + fieldHours + clientVisitHours),
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
}
