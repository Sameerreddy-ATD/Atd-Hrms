import { describe, expect, it } from "vitest";
import { EventType } from "@prisma/client";
import {
  attendanceDateForShift,
  attendanceTransitionIssue,
  openPunchState,
} from "../server/src/attendanceEngine.js";
import {
  attendanceResultFromHours,
  attendancePunchOutDeadline,
} from "../server/src/attendancePolicy.js";
import { endOfAttendanceDayIst } from "../server/src/attendanceDayRules.js";
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

  it("does not block a new day check-in when the previous day is still open", () => {
    const previousDate = new Date("2026-07-24T00:00:00.000Z");
    const currentDate = new Date("2026-07-25T00:00:00.000Z");
    const latestEvent = { eventType: EventType.FIELD_CHECK_IN, eventDate: previousDate };

    // Prior-day open punches stay empty (Missed Checkout); transition itself allows the new day.
    expect(attendanceTransitionIssue(latestEvent, currentDate, false)).toBeUndefined();
    expect(attendanceTransitionIssue(latestEvent, currentDate, true)).toBeUndefined();
  });

  it("still blocks a second check-in on the same open attendance day", () => {
    const day = new Date("2026-07-25T00:00:00.000Z");
    const latestEvent = { eventType: EventType.FIELD_CHECK_IN, eventDate: day };
    expect(attendanceTransitionIssue(latestEvent, day, false)).toContain("already checked in");
  });

  it("classifies worked duration into Full Day or Present (no Half Day)", () => {
    expect(attendanceResultFromHours(9)).toBe(AttendanceResult.FULL_DAY);
    expect(attendanceResultFromHours(4)).toBe(AttendanceResult.PENDING);
    expect(attendanceResultFromHours(3.5)).toBe(AttendanceResult.PENDING);
    expect(attendanceResultFromHours(8.9)).toBe(AttendanceResult.PENDING);
    expect(attendanceResultFromHours(0)).toBe(AttendanceResult.ABSENT);
  });

  it("sets day-shift punch-out deadline at IST midnight after the attendance date", () => {
    const date = new Date("2026-08-05T00:00:00.000Z");
    const dayEnd = endOfAttendanceDayIst(date);
    const deadline = attendancePunchOutDeadline(date, {
      shiftType: "DAY",
      shiftStartMinutes: 540,
      shiftEndMinutes: 1080,
    });
    expect(deadline.getTime()).toBe(dayEnd.getTime());
    // 2026-08-06 00:00 IST = 2026-08-05T18:30:00.000Z
    expect(dayEnd.toISOString()).toBe("2026-08-05T18:30:00.000Z");
  });

  it("keeps night-shift punch-out deadline at shift end when that is after midnight", () => {
    const date = new Date("2026-08-05T00:00:00.000Z");
    const deadline = attendancePunchOutDeadline(date, {
      shiftType: "NIGHT",
      shiftStartMinutes: 22 * 60,
      shiftEndMinutes: 6 * 60,
    });
    const dayEnd = endOfAttendanceDayIst(date);
    expect(deadline.getTime()).toBeGreaterThan(dayEnd.getTime());
  });

  it("does not close an 11pm day-shift check-in at midnight", () => {
    const date = new Date("2026-08-05T00:00:00.000Z");
    const checkInAt = new Date("2026-08-05T17:30:00.000Z"); // 23:00 IST 5 Aug
    const midnight = endOfAttendanceDayIst(date);
    const deadline = attendancePunchOutDeadline(
      date,
      { shiftType: "DAY", shiftStartMinutes: 540, shiftEndMinutes: 1080 },
      checkInAt,
    );
    expect(deadline.getTime()).toBeGreaterThan(midnight.getTime());
    // 10:00 IST on 6 Aug
    expect(deadline.toISOString()).toBe("2026-08-06T04:30:00.000Z");
  });

  it("still closes a normal daytime punch at IST midnight", () => {
    const date = new Date("2026-08-05T00:00:00.000Z");
    const checkInAt = new Date("2026-08-05T03:30:00.000Z"); // 09:00 IST
    const midnight = endOfAttendanceDayIst(date);
    const deadline = attendancePunchOutDeadline(
      date,
      { shiftType: "DAY", shiftStartMinutes: 540, shiftEndMinutes: 1080 },
      checkInAt,
    );
    expect(deadline.getTime()).toBe(midnight.getTime());
  });
});
