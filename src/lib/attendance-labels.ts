import type { AttendanceRecord, AttendanceTimelineEvent } from "@/mock/types";

const PUNCH_TYPE_META: Record<
  string,
  { direction: "In" | "Out"; place: "Branch" | "Field"; defaultSource: "biometric" | "mobile" }
> = {
  OFFICE_IN: { direction: "In", place: "Branch", defaultSource: "mobile" },
  OFFICE_OUT: { direction: "Out", place: "Branch", defaultSource: "mobile" },
  BRANCH_IN: { direction: "In", place: "Branch", defaultSource: "biometric" },
  BRANCH_OUT: { direction: "Out", place: "Branch", defaultSource: "biometric" },
  FIELD_CHECK_IN: { direction: "In", place: "Field", defaultSource: "mobile" },
  FIELD_CHECK_OUT: { direction: "Out", place: "Field", defaultSource: "mobile" },
  CLIENT_CHECK_IN: { direction: "In", place: "Field", defaultSource: "mobile" },
  CLIENT_CHECK_OUT: { direction: "Out", place: "Field", defaultSource: "mobile" },
  BREAK_IN: { direction: "In", place: "Field", defaultSource: "mobile" },
  BREAK_OUT: { direction: "Out", place: "Field", defaultSource: "mobile" },
};

/** Mobile missed-punch options only (no biometric; field covers outside-office). */
export const MISSED_PUNCH_TYPE_OPTIONS = [
  "OFFICE_IN",
  "OFFICE_OUT",
  "FIELD_CHECK_IN",
  "FIELD_CHECK_OUT",
] as const;

function movementPlaceLabel(
  eventType: string,
  eventSource?: string,
  branchName?: string,
): string {
  if (eventSource === "THUMB_SCANNER") {
    return `${branchName ?? "Branch"} - biometric`;
  }
  if (eventSource === "MOBILE_GPS" && branchName) {
    return `${branchName} - mobile`;
  }
  if (eventSource === "MOBILE_GPS") {
    return "Field - mobile";
  }

  const meta = PUNCH_TYPE_META[eventType.toUpperCase()];
  if (meta?.place === "Branch") {
    return `${branchName ?? "Branch"} - mobile`;
  }
  return "Field - mobile";
}

export function punchTypeLabel(eventType: string, eventSource?: string, branchName?: string) {
  const meta = PUNCH_TYPE_META[eventType.toUpperCase()];
  if (!meta) return eventType.replaceAll("_", " ");

  const direction = meta.direction;
  let source = movementPlaceLabel(eventType, eventSource, branchName);
  if (!eventSource && meta.defaultSource === "biometric") {
    source = `${branchName ?? "Branch"} - biometric`;
  }
  return `${direction} · ${source}`;
}

export function branchNameFromMap(branches: Array<{ id: string; name: string }>, id?: string) {
  return branches.find((branch) => branch.id === id)?.name;
}

export function movementDirectionLabel(type: string) {
  const upper = type.toUpperCase();
  if (upper.endsWith("_IN") || upper === "BREAK_IN") return "In";
  if (upper.endsWith("_OUT") || upper === "BREAK_OUT") return "Out";
  return "";
}

export function movementSourceLabel(row: AttendanceTimelineEvent) {
  return movementPlaceLabel(row.type, row.source, row.branchName);
}

export function movementEventLabel(row: AttendanceTimelineEvent) {
  const direction = movementDirectionLabel(row.type);
  const source = movementSourceLabel(row);
  return direction ? `${direction} · ${source}` : row.statusLabel || source;
}

export function movementStatusLabel(row: AttendanceTimelineEvent) {
  return movementEventLabel(row);
}

export function captureSourceLabel(row: AttendanceTimelineEvent) {
  const source = row.source?.toUpperCase() ?? "";
  if (source === "THUMB_SCANNER") return "Biometric";
  if (source === "MOBILE_GPS") return "Mobile GPS";
  return row.source || "-";
}

export function attendanceSourceLabel(
  row: AttendanceRecord,
  branches: Array<{ id: string; name: string }>,
) {
  const branch = branchNameFromMap(branches, row.actualBranchId);
  if (row.source === "Thumb Scanner") return `${branch ?? "Branch"} - biometric`;
  if (row.source === "Mobile GPS" && row.actualBranchId) return `${branch ?? "Branch"} - mobile`;
  if (row.source === "Mobile GPS") return "Field - mobile";
  return row.source;
}
