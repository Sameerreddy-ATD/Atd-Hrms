import { describe, expect, it } from "vitest";
import { EventType } from "@prisma/client";
import {
  attendanceDateForShift,
  attendanceTransitionIssue,
  openPunchState,
} from "../server/src/attendanceEngine.js";
import { attendanceResultFromHours } from "../server/src/attendancePolicy.js";
import { AttendanceResult } from "@prisma/client";

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

  it("reports an open punch without the legacy nine-hour expiry flag", () => {
    const finalCheckIn = new Date("2026-07-20T11:12:57.000Z");
    const events = [
      { eventType: EventType.OFFICE_IN, eventTime: new Date("2026-07-20T04:39:54.000Z") },
      { eventType: EventType.OFFICE_OUT, eventTime: new Date("2026-07-20T11:12:55.000Z") },
      { eventType: EventType.OFFICE_IN, eventTime: finalCheckIn },
    ];

    expect(openPunchState(events, finalCheckIn.getTime() + 9 * 60 * 60 * 1000)).toMatchObject({
      hasOpenPunch: true,
      expired: false,
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

  it("classifies worked duration into Full Day / Half Day / Absent", () => {
    expect(attendanceResultFromHours(9)).toBe(AttendanceResult.FULL_DAY);
    expect(attendanceResultFromHours(4)).toBe(AttendanceResult.HALF_DAY);
    expect(attendanceResultFromHours(3.5)).toBe(AttendanceResult.ABSENT);
  });
});
