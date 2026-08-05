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

/** Geofenced mobile punch — show the branch name, not a bare "Branch-Mobile". */
export function branchMobileSourceLabel(branchName?: string | null) {
  const name = branchName?.trim();
  return name ? `${name} · Mobile` : "Branch-Mobile";
}

function movementPlaceLabel(eventType?: string, eventSource?: string, branchName?: string): string {
  if (eventSource === "THUMB_SCANNER") {
    return branchName ? `${branchName} · Biometric` : "Thumb Scanner";
  }
  if (eventSource === "MOBILE_GPS" && branchName) {
    return branchMobileSourceLabel(branchName);
  }
  if (eventSource === "MOBILE_GPS") {
    return "Mobile";
  }
  if (eventSource === "SYSTEM") return "System";

  const meta = PUNCH_TYPE_META[eventType?.toUpperCase() ?? ""];
  if (meta?.place === "Branch") {
    return branchMobileSourceLabel(branchName);
  }
  return "Mobile";
}

export function punchTypeLabel(eventType?: string, eventSource?: string, branchName?: string) {
  const meta = PUNCH_TYPE_META[eventType?.toUpperCase() ?? ""];
  if (!meta) return eventType?.replaceAll("_", " ") ?? "Attendance event";

  const direction = meta.direction;
  let source = movementPlaceLabel(eventType, eventSource, branchName);
  if (!eventSource && meta.defaultSource === "biometric") {
    source = branchName ? `${branchName} · Biometric` : "Thumb Scanner";
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
  if (source === "THUMB_SCANNER") {
    return row.branchName ? `${row.branchName} · Biometric` : "Thumb Scanner";
  }
  if (source === "MOBILE_GPS") {
    return row.branchName ? branchMobileSourceLabel(row.branchName) : "Mobile";
  }
  if (source === "SYSTEM") return "System";
  return row.source || "-";
}

function alreadyResolvedSourceLabel(source?: string | null) {
  if (!source) return false;
  return (
    source.includes(" · Mobile") ||
    source.includes(" · Biometric") ||
    source.startsWith("Branch-Mobile · ") ||
    source === "Mobile" ||
    source === "Thumb Scanner" ||
    source === "System" ||
    source === "Manual Entry"
  );
}

export function attendanceSourceLabel(
  row: AttendanceRecord,
  branches: Array<{ id: string; name: string }>,
) {
  const branch = branchNameFromMap(branches, row.actualBranchId);
  if (alreadyResolvedSourceLabel(row.source) && row.source !== "Branch-Mobile") {
    return row.source;
  }
  if (row.source === "Branch-Mobile" || row.checkInSource === "BRANCH_MOBILE") {
    return branchMobileSourceLabel(branch);
  }
  if (row.source === "Mobile" || row.source === "Thumb Scanner" || row.source === "System") {
    return row.source === "Thumb Scanner"
      ? branch
        ? `${branch} · Biometric`
        : "Thumb Scanner"
      : row.source;
  }
  if (row.source === "Mobile GPS" && row.actualBranchId) {
    return branchMobileSourceLabel(branch);
  }
  if (row.source === "Mobile GPS") return "Mobile";
  return row.source;
}

export function punchSourceLabel(
  source: AttendanceRecord["punchInSource"] | AttendanceRecord["punchOutSource"],
  branchId: string | undefined,
  branches: Array<{ id: string; name: string }>,
) {
  if (alreadyResolvedSourceLabel(source) && source !== "Branch-Mobile") {
    return source ?? "-";
  }
  const branch = branchNameFromMap(branches, branchId);
  if (source === "Thumb Scanner" || source === "THUMB_SCANNER") {
    return branch ? `${branch} · Biometric` : "Thumb Scanner";
  }
  if (
    source === "Mobile GPS" ||
    source === "BRANCH_MOBILE" ||
    source === "Branch-Mobile" ||
    source === "MOBILE_GPS"
  ) {
    return branch ? branchMobileSourceLabel(branch) : "Mobile";
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
    source === "MOBILE_GPS" ||
    source.startsWith("Branch-Mobile") ||
    source.includes(" · Mobile")
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
  // Only after the day punch-out deadline (hasMissedCheckout). Mid-day open punch is not Missed Checkout yet.
  if (row.hasMissedCheckout) flags.push("Missed Checkout");
  return flags.length ? `${row.status} · ${flags.join(" · ")}` : row.status;
}

/** Legacy helper — provisional System outs are no longer written; punch-out stays empty. */
export function hasProvisionalSystemOut(_row: Pick<
  AttendanceRecord,
  "hasMissedCheckout" | "hasMissingOutEvent" | "punchOut" | "provisionalCheckOutAt" | "checkOutSource"
>) {
  return false;
}

/**
 * Last-out cell: empty while checked in during the day; "Punch-out required" after day end (Missed Checkout).
 */
export function lastOutLabel(row: Pick<
  AttendanceRecord,
  | "punchOut"
  | "hasMissingOutEvent"
  | "hasMissedCheckout"
  | "provisionalCheckOutAt"
  | "checkOutSource"
  | "date"
  | "latestOpenPunchAt"
>) {
  if (row.punchOut) {
    return { text: row.punchOut, provisional: false as const, missing: false as const };
  }
  if (row.hasMissedCheckout) {
    return { text: "Punch-out required", provisional: false as const, missing: true as const };
  }
  if (row.hasMissingOutEvent) {
    return { text: "—", provisional: false as const, missing: false as const };
  }
  return { text: "-", provisional: false as const, missing: false as const };
}
