import { describe, expect, it } from "vitest";
import { calendarYearRange, monthsCredited } from "../server/src/leavePolicy.js";

describe("casual leave monthly credit", () => {
  it("credits a July joiner for the first time on August 1", () => {
    const joiningDate = new Date("2026-07-16T00:00:00.000Z");
    expect(monthsCredited(joiningDate, new Date("2026-07-31T18:29:59.000Z"))).toBe(0);
    expect(monthsCredited(joiningDate, new Date("2026-07-31T18:30:00.000Z"))).toBe(1);
  });

  it("continues monthly credits across calendar years", () => {
    expect(
      monthsCredited(new Date("2025-07-16T00:00:00.000Z"), new Date("2026-08-01T00:00:00.000Z")),
    ).toBe(13);
  });
});

describe("calendar-year leave balances", () => {
  it("scopes credits through the final millisecond of December 31", () => {
    const range = calendarYearRange(new Date("2026-07-17T00:00:00.000Z"));
    expect(range.year).toBe(2026);
    expect(range.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  it("starts a new credit window on January 1", () => {
    const range = calendarYearRange(new Date("2027-01-01T00:00:00.000Z"));
    expect(range.year).toBe(2027);
    expect(range.start.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
