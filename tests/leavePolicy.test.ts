import { describe, expect, it } from "vitest";
import { AttendanceResult, LeaveSession } from "@prisma/client";
import {
  attendanceResultFromHours,
  medicalDocumentDueAt48h,
  shiftWindowBounds,
} from "../server/src/attendancePolicy.js";
import {
  calendarYearRange,
  casualLeaveCreditsEarned,
  expectedLeaveDays,
  leaveSessionsOverlap,
} from "../server/src/leavePolicy.js";

describe("attendance duration results", () => {
  it("maps hours to Full / Half / Absent bands (policy doc)", () => {
    expect(attendanceResultFromHours(3.9)).toBe(AttendanceResult.ABSENT);
    expect(attendanceResultFromHours(4)).toBe(AttendanceResult.HALF_DAY);
    expect(attendanceResultFromHours(8.9)).toBe(AttendanceResult.HALF_DAY);
    expect(attendanceResultFromHours(9)).toBe(AttendanceResult.FULL_DAY);
    expect(attendanceResultFromHours(0)).toBe(AttendanceResult.ABSENT);
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

  it("keeps prior-year casual credits in the lifetime total so unused days carry forward", () => {
    const joiningDate = new Date("2025-01-05T00:00:00.000Z");
    expect(casualLeaveCreditsEarned(joiningDate, new Date("2025-12-31T18:30:00.000Z"))).toBe(12);
    expect(casualLeaveCreditsEarned(joiningDate, new Date("2026-01-31T18:30:00.000Z"))).toBe(13);
  });

  it("scopes calendar years through December 31", () => {
    const range = calendarYearRange(new Date("2026-07-17T00:00:00.000Z"));
    expect(range.year).toBe(2026);
    expect(range.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });
});

describe("leave auto-allocate and week-off skip", () => {
  const types = [
    { id: "sick", name: "Sick", paid: true, code: "SICK", active: true, carryForward: false, requiresMedicalDocument: true, approvalRequired: true, description: "" },
    { id: "casual", name: "Casual", paid: true, code: "CASUAL", active: true, carryForward: true, requiresMedicalDocument: false, approvalRequired: true, description: "" },
    { id: "comp", name: "Comp Off", paid: true, code: "COMP_OFF", active: true, carryForward: false, requiresMedicalDocument: false, approvalRequired: true, description: "" },
    { id: "lop", name: "Unpaid", paid: false, code: "LOP", active: true, carryForward: false, requiresMedicalDocument: false, approvalRequired: true, description: "" },
  ];

  it("fills casual, then comp off, then unpaid, and never sick", async () => {
    const { autoAllocateLeaveTypes } = await import("../src/lib/leave-allocation.ts");
    const alloc = autoAllocateLeaveTypes(5, types, [
      { type: "Casual Leave", code: "CASUAL", entitled: 12, used: 10, balance: 2 },
      { type: "Sick Leave", code: "SICK", entitled: 6, used: 0, balance: 6 },
      { type: "Comp Off", code: "COMP_OFF", entitled: 2, used: 0, balance: 1 },
      { type: "Unpaid", code: "LOP", entitled: 0, used: 0, balance: 0 },
    ]);
    expect(alloc).toEqual({ casual: 2, comp: 1, lop: 2 });
    expect(alloc.sick).toBeUndefined();
  });

  it("skips Sundays for fixed week off and approved week offs for selectable staff", async () => {
    const { eachDateKeys, weekOffSkipKeys } = await import("../src/lib/leave-allocation.ts");
    const keys = eachDateKeys("2026-08-21", "2026-08-24");
    expect(keys).toEqual(["2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24"]);
    expect(weekOffSkipKeys({ policy: "SUNDAY_FIXED", dateKeys: keys, approvedWeeklyOffKeys: [] })).toEqual([
      "2026-08-23",
    ]);
    expect(
      weekOffSkipKeys({
        policy: "SELECTABLE",
        dateKeys: keys,
        approvedWeeklyOffKeys: ["2026-08-22"],
      }),
    ).toEqual(["2026-08-22"]);
  });

  it("caps sick leave at two days minus what was already used this month", async () => {
    const { sickDaysUsedInMonth, sickLeaveMonthCap } = await import("../src/lib/leave-allocation.ts");
    const used = sickDaysUsedInMonth(
      [
        { type: "Sick Leave", from: "2026-08-04", status: "Approved", days: 1, cancelledDays: 0 },
        { type: "Sick Leave", from: "2026-07-20", status: "Approved", days: 2 },
        { type: "Casual Leave", from: "2026-08-10", status: "Pending", days: 1 },
      ],
      "Sick Leave",
      "2026-08",
    );
    expect(used).toBe(1);
    expect(sickLeaveMonthCap(6, 2, used)).toBe(1);
    expect(sickLeaveMonthCap(6, 2, 2)).toBe(0);
  });
});

describe("half-day leave sessions", () => {
  it("counts a half-day slot as 0.5 and a full range as calendar days", () => {
    expect(expectedLeaveDays(1, LeaveSession.FIRST_HALF)).toBe(0.5);
    expect(expectedLeaveDays(1, LeaveSession.SECOND_HALF)).toBe(0.5);
    expect(expectedLeaveDays(3, LeaveSession.FULL)).toBe(3);
  });

  it("lets complementary halves share a date and blocks the same slot or a full day", () => {
    expect(leaveSessionsOverlap(LeaveSession.FIRST_HALF, LeaveSession.SECOND_HALF)).toBe(false);
    expect(leaveSessionsOverlap(LeaveSession.FIRST_HALF, LeaveSession.FIRST_HALF)).toBe(true);
    expect(leaveSessionsOverlap(LeaveSession.FULL, LeaveSession.SECOND_HALF)).toBe(true);
  });
});

describe("medical certificate deadline", () => {
  it("is 48 hours after return-to-work (day after leave end, IST midnight)", () => {
    const due = medicalDocumentDueAt48h(new Date("2026-07-20T00:00:00.000Z"));
    expect(due.toISOString()).toBe("2026-07-22T18:30:00.000Z");
  });
});
