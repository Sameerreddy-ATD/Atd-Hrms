import { describe, expect, it } from "vitest";
import { indiaDateKey, indiaMonthKey, indiaMonthRange } from "../src/lib/india-date";
import {
  clampAttendanceRangeToToday,
  istMonthKey,
  istMonthRangeThroughToday,
  todayIstDate,
} from "../server/src/attendanceDayRules.js";

describe("indiaMonthRange (frontend)", () => {
  it("stops the current month at today", () => {
    const month = indiaMonthKey();
    const today = indiaDateKey();
    const range = indiaMonthRange(month);
    expect(range.from).toBe(`${month}-01`);
    expect(range.to).toBe(today);
    expect(range.to <= today).toBe(true);
  });

  it("keeps a past month through its last calendar day", () => {
    const range = indiaMonthRange("2026-01");
    expect(range.from).toBe("2026-01-01");
    expect(range.to).toBe("2026-01-31");
  });

  it("never returns a to date after today", () => {
    const today = indiaDateKey();
    const range = indiaMonthRange(indiaMonthKey());
    expect(range.to > today).toBe(false);
  });
});

describe("istMonthRangeThroughToday / clampAttendanceRangeToToday (backend)", () => {
  it("matches month-start through today for the current month", () => {
    const now = new Date("2026-08-05T08:00:00.000Z"); // 13:30 IST
    const range = istMonthRangeThroughToday(undefined, now);
    expect(range.fromKey).toBe("2026-08-01");
    expect(range.toKey).toBe("2026-08-05");
    expect(istMonthKey(now)).toBe("2026-08");
  });

  it("keeps a past month through month end", () => {
    const now = new Date("2026-08-05T08:00:00.000Z");
    const range = istMonthRangeThroughToday("2026-01", now);
    expect(range.fromKey).toBe("2026-01-01");
    expect(range.toKey).toBe("2026-01-31");
  });

  it("clamps a future to date back to today", () => {
    const now = new Date("2026-08-05T08:00:00.000Z");
    const clamped = clampAttendanceRangeToToday({
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-31T00:00:00.000Z"),
      now,
    });
    expect(clamped.from?.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(clamped.to?.toISOString().slice(0, 10)).toBe(
      todayIstDate(now).toISOString().slice(0, 10),
    );
  });
});
