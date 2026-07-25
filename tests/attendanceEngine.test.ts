import { describe, expect, it } from "vitest";
import { EventSource, EventType } from "@prisma/client";
import {
  attendanceDateForShift,
  attendanceTransitionIssue,
  openPunchState,
} from "../server/src/attendanceEngine.js";

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
  it("keeps a night-shift checkout after midnight on the shift start date", () => {
    const checkout = new Date("2026-07-20T19:30:00.000Z"); // 01:00 IST on July 21
    expect(
      attendanceDateForShift(checkout, { shiftType: "NIGHT", shiftEndMinutes: 360 })
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-07-20");
    expect(
      attendanceDateForShift(checkout, { shiftType: "DAY", shiftEndMinutes: 1080 })
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-07-21");
  });
  it("expires a second unmatched check-in after nine hours", () => {
    const finalCheckIn = new Date("2026-07-20T11:12:57.000Z");
    const events = [
      { eventType: EventType.OFFICE_IN, eventTime: new Date("2026-07-20T04:39:54.000Z") },
      { eventType: EventType.OFFICE_OUT, eventTime: new Date("2026-07-20T11:12:55.000Z") },
      { eventType: EventType.OFFICE_IN, eventTime: finalCheckIn },
    ];

    expect(openPunchState(events, finalCheckIn.getTime() + 8 * 60 * 60 * 1000)).toEqual({
      hasOpenPunch: true,
      expired: false,
    });
    expect(openPunchState(events, finalCheckIn.getTime() + 9 * 60 * 60 * 1000)).toEqual({
      hasOpenPunch: true,
      expired: true,
    });
  });

  it("blocks a new day while the previous attendance day remains open", () => {
    const previousDate = new Date("2026-07-24T00:00:00.000Z");
    const currentDate = new Date("2026-07-25T00:00:00.000Z");
    const latestEvent = { eventType: EventType.FIELD_CHECK_IN, eventDate: previousDate };

    expect(attendanceTransitionIssue(latestEvent, currentDate, false)).toContain(
      "previous attendance day",
    );
    expect(attendanceTransitionIssue(latestEvent, currentDate, true)).toContain(
      "missed-punch correction",
    );
  });

  it("allows checkout only for an open session on the requested attendance day", () => {
    const date = new Date("2026-07-25T00:00:00.000Z");
    expect(
      attendanceTransitionIssue(
        { eventType: EventType.FIELD_CHECK_IN, eventDate: date },
        date,
        true,
      ),
    ).toBeUndefined();
    expect(
      attendanceTransitionIssue(
        { eventType: EventType.FIELD_CHECK_OUT, eventDate: date },
        date,
        true,
      ),
    ).toContain("No active check-in");
  });

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
