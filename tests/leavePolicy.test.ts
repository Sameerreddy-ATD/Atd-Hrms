import { describe, expect, it } from "vitest";
import { AttendanceResult } from "@prisma/client";
import {
  attendanceResultFromHours,
  medicalDocumentDueAt48h,
  shiftWindowBounds,
} from "../server/src/attendancePolicy.js";
import { calendarYearRange, casualLeaveCreditsEarned } from "../server/src/leavePolicy.js";

describe("attendance duration results", () => {
  it("maps hours to Full Day, Half Day and Absent", () => {
    expect(attendanceResultFromHours(3.9)).toBe(AttendanceResult.ABSENT);
    expect(attendanceResultFromHours(4)).toBe(AttendanceResult.HALF_DAY);
    expect(attendanceResultFromHours(8.9)).toBe(AttendanceResult.HALF_DAY);
    expect(attendanceResultFromHours(9)).toBe(AttendanceResult.FULL_DAY);
  });

  it("applies a 30-minute grace window after shift start", () => {
    const date = new Date("2026-07-27T00:00:00.000Z");
    const bounds = shiftWindowBounds(date, {
      shiftType: "DAY",
      shiftStartMinutes: 540,
      shiftEndMinutes: 1080,
    });
    expect(bounds.graceEnd.getTime() - bounds.start.getTime()).toBe(30 * 60 * 1000);
    expect(bounds.missedCheckOutAt.getTime() - bounds.end.getTime()).toBe(30 * 60 * 1000);
  });

  it("supports night shifts that cross midnight", () => {
    const date = new Date("2026-07-27T00:00:00.000Z");
    const bounds = shiftWindowBounds(date, {
      shiftType: "NIGHT",
      shiftStartMinutes: 1260,
      shiftEndMinutes: 360,
    });
    expect(bounds.end.getTime()).toBeGreaterThan(bounds.start.getTime());
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(9 * 60 * 60 * 1000);
  });
});

describe("casual leave joining rules", () => {
  it("credits a joiner on/before the 5th at joining month-end", () => {
    const joiningDate = new Date("2026-07-05T00:00:00.000Z");
    expect(casualLeaveCreditsEarned(joiningDate, new Date("2026-07-30T18:29:59.000Z"))).toBe(0);
    expect(casualLeaveCreditsEarned(joiningDate, new Date("2026-07-31T18:30:00.000Z"))).toBe(1);
  });

  it("skips joining-month credit when joining after the 5th", () => {
    const joiningDate = new Date("2026-07-16T00:00:00.000Z");
    expect(casualLeaveCreditsEarned(joiningDate, new Date("2026-07-31T18:30:00.000Z"))).toBe(0);
    expect(casualLeaveCreditsEarned(joiningDate, new Date("2026-08-31T18:30:00.000Z"))).toBe(1);
  });

  it("scopes calendar years through December 31", () => {
    const range = calendarYearRange(new Date("2026-07-17T00:00:00.000Z"));
    expect(range.year).toBe(2026);
    expect(range.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });
});

describe("medical certificate deadline", () => {
  it("is 48 hours after return-to-work (day after leave end, IST midnight)", () => {
    const due = medicalDocumentDueAt48h(new Date("2026-07-20T00:00:00.000Z"));
    expect(due.toISOString()).toBe("2026-07-22T18:30:00.000Z");
  });
});
