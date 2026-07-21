import { describe, expect, it } from "vitest";
import { averageWorkedSeconds, isPresentAttendanceDay } from "../src/lib/csv.js";

describe("attendance export", () => {
  it("calculates average worked time from present days", () => {
    expect(averageWorkedSeconds(27 * 60 * 60, 3)).toBe(9 * 60 * 60);
  });

  it("returns zero when there are no present days", () => {
    expect(averageWorkedSeconds(0, 0)).toBe(0);
  });

  it("does not count non-working calendar statuses as present", () => {
    expect(isPresentAttendanceDay("Present - Mobile", 0)).toBe(true);
    expect(isPresentAttendanceDay("Holiday", 0)).toBe(false);
    expect(isPresentAttendanceDay("Week Off", 0)).toBe(false);
    expect(isPresentAttendanceDay("Pending attendance", 0)).toBe(false);
  });

  it("counts a day with recorded work even when its status has not settled yet", () => {
    expect(isPresentAttendanceDay("Pending attendance", 3600)).toBe(true);
  });
});
