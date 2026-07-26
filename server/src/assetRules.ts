export type AssetOperationalStatus = "AVAILABLE" | "ASSIGNED" | "UNDER_REPAIR" | "RETIRED";

/**
 * Assignment wins: if an employee is linked, status is always ASSIGNED.
 * Clearing the assignee with previous ASSIGNED falls back to AVAILABLE.
 */
export function resolveAssetStatus(input: {
  assignedEmployeeId: string | null;
  requestedStatus?: AssetOperationalStatus;
  previousStatus?: string;
}) {
  if (input.assignedEmployeeId) return "ASSIGNED";
  if (input.requestedStatus === "ASSIGNED") {
    throw new Error("An asset cannot be marked assigned without an employee");
  }
  if (input.requestedStatus) return input.requestedStatus;
  return input.previousStatus === "ASSIGNED" ? "AVAILABLE" : (input.previousStatus ?? "AVAILABLE");
}
