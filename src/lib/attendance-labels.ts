import type { AttendanceRecord, AttendanceTimelineEvent } from "@/types/domain";

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

function movementPlaceLabel(eventType?: string, eventSource?: string, branchName?: string): string {
  if (eventSource === "THUMB_SCANNER") {
    return `${branchName ?? "Branch"} - biometric`;
  }
  if (eventSource === "MOBILE_GPS" && branchName) {
    return `Branch-Mobile · ${branchName}`;
  }
  if (eventSource === "MOBILE_GPS") {
    return "Mobile";
  }
  if (eventSource === "SYSTEM") return "System";

  const meta = PUNCH_TYPE_META[eventType?.toUpperCase() ?? ""];
  if (meta?.place === "Branch") {
    return `Branch-Mobile · ${branchName ?? "Branch"}`;
  }
  return "Mobile";
}

export function punchTypeLabel(eventType?: string, eventSource?: string, branchName?: string) {
  const meta = PUNCH_TYPE_META[eventType?.toUpperCase() ?? ""];
  if (!meta) return eventType?.replaceAll("_", " ") ?? "Attendance event";

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

export function movementDirectionLabel(type?: string) {
  const upper = type?.toUpperCase() ?? "";
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
  if (source === "THUMB_SCANNER") return `Biometric - ${row.branchName ?? "Branch"}`;
  if (source === "MOBILE_GPS") return row.branchName ? `Branch-Mobile · ${row.branchName}` : "Mobile";
  if (source === "SYSTEM") return "System";
  return row.source || "-";
}

export function attendanceSourceLabel(
  row: AttendanceRecord,
  branches: Array<{ id: string; name: string }>,
) {
  const branch = branchNameFromMap(branches, row.actualBranchId);
  if (typeof row.source === "string" && row.source.startsWith("Branch-Mobile")) return row.source;
  if (row.source === "Mobile" || row.source === "Thumb Scanner" || row.source === "System") {
    return row.source === "Thumb Scanner" ? `${branch ?? "Branch"} - biometric` : row.source;
  }
  if (row.source === "Mobile GPS" && row.actualBranchId) {
    return `Branch-Mobile · ${branch ?? "Branch"}`;
  }
  if (row.source === "Mobile GPS") return "Mobile";
  return row.source;
}

export function punchSourceLabel(
  source: AttendanceRecord["punchInSource"] | AttendanceRecord["punchOutSource"],
  branchId: string | undefined,
  branches: Array<{ id: string; name: string }>,
) {
  const branch = branchNameFromMap(branches, branchId);
  if (source === "Thumb Scanner") return `Biometric - ${branch ?? "Branch"}`;
  if (source === "Mobile GPS" || source === "BRANCH_MOBILE") {
    return branch ? `Branch-Mobile · ${branch}` : "Mobile";
  }
  if (source === "MOBILE" || source === "Mobile") return "Mobile";
  return source ?? "-";
}

export function isMobileAttendanceSource(source?: string | null) {
  if (!source) return false;
  return (
    source === "Mobile GPS" ||
    source === "Mobile" ||
    source === "MOBILE" ||
    source === "BRANCH_MOBILE" ||
    source.startsWith("Branch-Mobile")
  );
}

export function attendanceStatusWithFlags(row: {
  status: string;
  isLate?: boolean;
  hasMissedCheckout?: boolean;
  hasMissingOutEvent?: boolean;
}) {
  const flags: string[] = [];
  if (row.isLate) flags.push("Late");
  if (row.hasMissedCheckout || row.hasMissingOutEvent) flags.push("Missed Checkout");
  return flags.length ? `${row.status} · ${flags.join(" · ")}` : row.status;
}
