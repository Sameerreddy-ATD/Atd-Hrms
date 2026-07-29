import type { AttendanceRecord } from "@/types/domain";
import { isMobileAttendanceSource } from "@/lib/attendance-labels";

export type MissedPunchDirection = "In" | "Out";

export type MissedPunchEventType =
  | "OFFICE_IN"
  | "OFFICE_OUT"
  | "FIELD_CHECK_IN"
  | "FIELD_CHECK_OUT";

export interface MissedPunchItem {
  id: string;
  date: string;
  direction: MissedPunchDirection;
  eventType: MissedPunchEventType;
  record: AttendanceRecord;
}

export interface CorrectionRequestLike {
  date: string;
  eventType: string;
  status: string;
}

function dateKey(value: string) {
  return value.slice(0, 10);
}

export function directionFromEventType(eventType?: string): MissedPunchDirection | null {
  const upper = eventType?.toUpperCase() ?? "";
  if (upper.endsWith("_IN") || upper === "BREAK_IN") return "In";
  if (upper.endsWith("_OUT") || upper === "BREAK_OUT") return "Out";
  return null;
}

function isFieldContext(record: AttendanceRecord, lookingAt: "in" | "out") {
  const source = lookingAt === "in" ? record.punchInSource : record.punchOutSource;
  if (source === "BRANCH_MOBILE" || source === "Branch-Mobile" || source === "Thumb Scanner") {
    return false;
  }
  if (source === "Mobile" || source === "Mobile GPS" || source === "MOBILE_GPS") {
    return true;
  }
  if (isMobileAttendanceSource(source) && !record.actualBranchId && !record.punchInBranchId) {
    return true;
  }
  return Boolean((record.fieldHours ?? 0) > 0 || (record.fieldVisitCount ?? 0) > 0);
}

function outEventTypeFor(record: AttendanceRecord): MissedPunchEventType {
  return isFieldContext(record, "in") ? "FIELD_CHECK_OUT" : "OFFICE_OUT";
}

function inEventTypeFor(record: AttendanceRecord): MissedPunchEventType {
  return isFieldContext(record, "out") ? "FIELD_CHECK_IN" : "OFFICE_IN";
}

function coveredKeys(requests: CorrectionRequestLike[]) {
  const keys = new Set<string>();
  for (const request of requests) {
    if (request.status !== "PENDING" && request.status !== "APPROVED") continue;
    const direction = directionFromEventType(request.eventType);
    if (!direction) continue;
    keys.add(`${dateKey(request.date)}|${direction}`);
  }
  return keys;
}

/** Detect missing In/Out punches the employee can request from. */
export function detectMissedPunchItems(
  records: AttendanceRecord[],
  requests: CorrectionRequestLike[],
): MissedPunchItem[] {
  const covered = coveredKeys(requests);
  const items: MissedPunchItem[] = [];

  for (const record of records) {
    const date = dateKey(record.date);

    const needsOut = Boolean(record.hasMissedCheckout || record.hasMissingOutEvent);
    if (needsOut && !covered.has(`${date}|Out`)) {
      items.push({
        id: `${record.id}-out`,
        date,
        direction: "Out",
        eventType: outEventTypeFor(record),
        record,
      });
    }

    const needsIn = Boolean(record.punchOut) && !record.punchIn;
    if (needsIn && !covered.has(`${date}|In`)) {
      items.push({
        id: `${record.id}-in`,
        date,
        direction: "In",
        eventType: inEventTypeFor(record),
        record,
      });
    }
  }

  return items.sort((a, b) => b.date.localeCompare(a.date));
}
