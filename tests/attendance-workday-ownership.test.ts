/**
 * Punch ownership unit matrix (no DB).
 */
import { describe, expect, it } from "vitest";
import {
  WORKDAY_OWNERSHIP_LEAD_MINUTES,
  WORKDAY_OWNERSHIP_TRAIL_MINUTES,
  buildScheduleSnapshot,
  indiaCalendarDate,
  istWallTimeToUtc,
  ownershipWindowContains,
  workDateIso,
} from "../server/src/attendanceWorkday";
import type { ResolvedEmployeeShift } from "../server/src/shiftRoster";
import { isCheckInEvent, isCheckOutEvent, isBreakEvent } from "../server/src/attendanceEventTypes";
import { EventType } from "@prisma/client";

function resolved(
  workDate: string,
  segments: Array<{ sequence: number; startMinute: number; endMinute: number; endDayOffset: number }>,
  source: ResolvedEmployeeShift["source"] = "DEFAULT",
  explicitNoShift = false,
): ResolvedEmployeeShift {
  const mapped = segments.map((s) => ({
    ...s,
    absoluteStartMinute: s.startMinute,
    absoluteEndMinute: s.endDayOffset * 1440 + s.endMinute,
    crossesMidnight: s.endDayOffset === 1,
  }));
  return {
    employeeId: "e1",
    workDate,
    source,
    explicitNoShift,
    timezone: "Asia/Kolkata",
    shiftTemplate: explicitNoShift
      ? null
      : {
          id: "s1",
          code: "GEN",
          name: "General",
          active: true,
          shiftType: "DAY",
          graceInMinutes: 30,
          graceOutMinutes: 30,
          expectedWorkMinutes: 0,
        },
    segments: mapped,
    expectedWorkMinutes: 0,
    firstSegmentStartMinute: mapped[0]?.absoluteStartMinute ?? null,
    finalSegmentEndMinute: mapped.at(-1)?.absoluteEndMinute ?? null,
    finalSegmentEndDayOffset: mapped.at(-1)?.endDayOffset ?? null,
    crossesMidnight: mapped.some((s) => s.crossesMidnight),
  };
}

describe("attendance event type helpers", () => {
  it("classifies in/out/break", () => {
    expect(isCheckInEvent(EventType.OFFICE_IN)).toBe(true);
    expect(isCheckOutEvent(EventType.FIELD_CHECK_OUT)).toBe(true);
    expect(isBreakEvent(EventType.BREAK_IN)).toBe(true);
    expect(isCheckInEvent(EventType.MANUAL_ADJUSTMENT)).toBe(false);
  });
});

describe("workDate ownership window (unit)", () => {
  it("A/B General 09–18 early and on-time belong to same workDate", () => {
    const workDate = new Date("2026-08-21T00:00:00.000Z");
    const snap = buildScheduleSnapshot(
      resolved("2026-08-21", [{ sequence: 1, startMinute: 540, endMinute: 1080, endDayOffset: 0 }]),
      workDate,
    );
    const early = istWallTimeToUtc(workDate, 530); // 08:50
    const onTime = istWallTimeToUtc(workDate, 550); // 09:10
    expect(ownershipWindowContains(snap, early)).toBe(true);
    expect(ownershipWindowContains(snap, onTime)).toBe(true);
    expect(workDateIso(indiaCalendarDate(early))).toBe("2026-08-21");
  });

  it("LEAD boundary inclusive: -120 in, -121 out", () => {
    const workDate = new Date("2026-08-21T00:00:00.000Z");
    const snap = buildScheduleSnapshot(
      resolved("2026-08-21", [{ sequence: 1, startMinute: 540, endMinute: 1080, endDayOffset: 0 }]),
      workDate,
    );
    expect(ownershipWindowContains(snap, istWallTimeToUtc(workDate, 540 - 120))).toBe(true);
    expect(ownershipWindowContains(snap, istWallTimeToUtc(workDate, 540 - 121))).toBe(false);
    expect(ownershipWindowContains(snap, istWallTimeToUtc(workDate, 540 - 119))).toBe(true);
  });

  it("TRAIL boundary inclusive: +180 in, +181 out", () => {
    const workDate = new Date("2026-08-21T00:00:00.000Z");
    const snap = buildScheduleSnapshot(
      resolved("2026-08-21", [{ sequence: 1, startMinute: 540, endMinute: 1080, endDayOffset: 0 }]),
      workDate,
    );
    expect(ownershipWindowContains(snap, istWallTimeToUtc(workDate, 1080 + 179))).toBe(true);
    expect(ownershipWindowContains(snap, istWallTimeToUtc(workDate, 1080 + 180))).toBe(true);
    expect(ownershipWindowContains(snap, istWallTimeToUtc(workDate, 1080 + 181))).toBe(false);
  });

  it("C Night 22–03 early punch Aug21 belongs to Aug21 window", () => {
    const workDate = new Date("2026-08-21T00:00:00.000Z");
    const snap = buildScheduleSnapshot(
      resolved("2026-08-21", [{ sequence: 1, startMinute: 1320, endMinute: 180, endDayOffset: 1 }], "DEFAULT"),
      workDate,
    );
    const punch = istWallTimeToUtc(workDate, 1315); // 21:55
    expect(ownershipWindowContains(snap, punch)).toBe(true);
  });

  it("D Night 22–03 punch Aug22 01:30 still in Aug21 window", () => {
    const workDate = new Date("2026-08-21T00:00:00.000Z");
    const snap = buildScheduleSnapshot(
      resolved("2026-08-21", [{ sequence: 1, startMinute: 1320, endMinute: 180, endDayOffset: 1 }]),
      workDate,
    );
    const punch = istWallTimeToUtc(workDate, 1440 + 90); // next day 01:30
    expect(ownershipWindowContains(snap, punch)).toBe(true);
    expect(indiaCalendarDate(punch).toISOString().slice(0, 10)).toBe("2026-08-22");
  });

  it("F Split second check-in in gap still in ownership window", () => {
    const workDate = new Date("2026-08-21T00:00:00.000Z");
    const snap = buildScheduleSnapshot(
      resolved("2026-08-21", [
        { sequence: 1, startMinute: 540, endMinute: 780, endDayOffset: 0 },
        { sequence: 2, startMinute: 1020, endMinute: 1260, endDayOffset: 0 },
      ]),
      workDate,
    );
    const punch = istWallTimeToUtc(workDate, 1015); // 16:55
    expect(ownershipWindowContains(snap, punch)).toBe(true);
  });

  it("G Hybrid 09–10 + 22–03 evening punch in window", () => {
    const workDate = new Date("2026-08-21T00:00:00.000Z");
    const snap = buildScheduleSnapshot(
      resolved("2026-08-21", [
        { sequence: 1, startMinute: 540, endMinute: 600, endDayOffset: 0 },
        { sequence: 2, startMinute: 1320, endMinute: 180, endDayOffset: 1 },
      ]),
      workDate,
    );
    const punch = istWallTimeToUtc(workDate, 1325); // 22:05
    expect(ownershipWindowContains(snap, punch)).toBe(true);
  });

  it("hybrid split ownership samples", () => {
    const workDate = new Date("2026-08-21T00:00:00.000Z");
    const snap = buildScheduleSnapshot(
      resolved("2026-08-21", [
        { sequence: 1, startMinute: 540, endMinute: 600, endDayOffset: 0 },
        { sequence: 2, startMinute: 1320, endMinute: 180, endDayOffset: 1 },
      ]),
      workDate,
    );
    expect(ownershipWindowContains(snap, istWallTimeToUtc(workDate, 530))).toBe(true); // 08:50
    expect(ownershipWindowContains(snap, istWallTimeToUtc(workDate, 570))).toBe(true); // 09:30
    expect(ownershipWindowContains(snap, istWallTimeToUtc(workDate, 840))).toBe(true); // 14:00 gap still in window
    expect(ownershipWindowContains(snap, istWallTimeToUtc(workDate, 1310))).toBe(true); // 21:50
    expect(ownershipWindowContains(snap, istWallTimeToUtc(workDate, 1440 + 60))).toBe(true); // 01:00
    expect(ownershipWindowContains(snap, istWallTimeToUtc(workDate, 1440 + 210))).toBe(true); // 03:30 within TRAIL of 03:00
    expect(ownershipWindowContains(snap, istWallTimeToUtc(workDate, 1440 + 180 + 181))).toBe(false);
  });

  it("documents ownership constants", () => {
    expect(WORKDAY_OWNERSHIP_LEAD_MINUTES).toBe(120);
    expect(WORKDAY_OWNERSHIP_TRAIL_MINUTES).toBe(180);
  });
});
