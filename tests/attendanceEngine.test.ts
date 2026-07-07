import { describe, expect, it } from "vitest";
import { EventSource, EventType } from "@prisma/client";

const outTypes = new Set<EventType>([
  EventType.OFFICE_OUT,
  EventType.BRANCH_OUT,
  EventType.CLIENT_CHECK_OUT,
]);

function summarize(
  events: Array<{ source: EventSource; type: EventType; branchId?: string }>,
  scheduledBranchId?: string,
) {
  const branches = [...new Set(events.map((event) => event.branchId).filter(Boolean))];
  const hasThumb = events.some((event) => event.source === EventSource.THUMB_SCANNER);
  const hasGps = events.some((event) => event.source === EventSource.MOBILE_GPS);
  const hasClientIn = events.some((event) => event.type === EventType.CLIENT_CHECK_IN);
  const hasClientOut = events.some((event) => event.type === EventType.CLIENT_CHECK_OUT);
  const hasOut = events.some((event) => outTypes.has(event.type));
  return {
    sourceSummary:
      hasThumb && hasGps ? "OFFICE_PLUS_FIELD" : hasThumb ? "THUMB_SCANNER" : "MOBILE_GPS",
    branches,
    branchMovementCount: Math.max(0, branches.length - 1),
    isBranchMismatch: Boolean(
      scheduledBranchId && branches.length && !branches.includes(scheduledBranchId),
    ),
    hasMissedCheckout: hasClientIn && !hasClientOut,
    hasMissingOutEvent: events.length > 0 && !hasOut,
  };
}

describe("attendance movement summary rules", () => {
  it("supports branch one to branch two plus client GPS in one day", () => {
    const result = summarize(
      [
        { source: EventSource.THUMB_SCANNER, type: EventType.OFFICE_IN, branchId: "b1" },
        { source: EventSource.THUMB_SCANNER, type: EventType.OFFICE_OUT, branchId: "b1" },
        { source: EventSource.THUMB_SCANNER, type: EventType.BRANCH_IN, branchId: "b2" },
        { source: EventSource.THUMB_SCANNER, type: EventType.BRANCH_OUT, branchId: "b2" },
        { source: EventSource.MOBILE_GPS, type: EventType.CLIENT_CHECK_IN },
        { source: EventSource.MOBILE_GPS, type: EventType.CLIENT_CHECK_OUT },
      ],
      "b1",
    );

    expect(result.sourceSummary).toBe("OFFICE_PLUS_FIELD");
    expect(result.branches).toEqual(["b1", "b2"]);
    expect(result.branchMovementCount).toBe(1);
    expect(result.hasMissedCheckout).toBe(false);
  });

  it("flags scheduled branch mismatch and missed checkout", () => {
    const result = summarize(
      [
        { source: EventSource.THUMB_SCANNER, type: EventType.BRANCH_IN, branchId: "b2" },
        { source: EventSource.MOBILE_GPS, type: EventType.CLIENT_CHECK_IN },
      ],
      "b1",
    );

    expect(result.isBranchMismatch).toBe(true);
    expect(result.hasMissedCheckout).toBe(true);
    expect(result.hasMissingOutEvent).toBe(true);
  });
});
