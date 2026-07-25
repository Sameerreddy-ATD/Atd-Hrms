import { describe, expect, it } from "vitest";
import {
  calendarYearRange,
  monthsCredited,
  projectedLeaveBalance,
} from "../server/src/leavePolicy.js";

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

describe("leave approval balance projection", () => {
  it("deducts a pending approval exactly once", () => {
    expect(
      projectedLeaveBalance({
        currentBalance: 6,
        leaveCode: "CASUAL",
        status: "PENDING",
        requestedDays: 2,
      }),
    ).toBe(4);
  });

  it("does not double-deduct approved or reserved Comp Off leave", () => {
    expect(
      projectedLeaveBalance({
        currentBalance: 4,
        leaveCode: "CASUAL",
        status: "APPROVED",
        requestedDays: 2,
      }),
    ).toBe(4);
    expect(
      projectedLeaveBalance({
        currentBalance: 1,
        leaveCode: "COMP_OFF",
        status: "PENDING",
        requestedDays: 1,
      }),
    ).toBe(1);
  });

  it("does not present a paid-credit projection for LOP", () => {
    expect(
      projectedLeaveBalance({
        currentBalance: 0,
        leaveCode: "LOP",
        status: "PENDING",
        requestedDays: 3,
      }),
    ).toBeNull();
  });
});
