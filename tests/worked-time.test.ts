import { describe, expect, it } from "vitest";
import { formatStoredWorkedTime, formatWorkedTime, workedTime } from "../src/lib/worked-time.js";

describe("worked time", () => {
  it("adds completed mixed-source sessions without checked-out gaps", () => {
    const result = workedTime(
      [
        { type: "OFFICE_IN", time: "2026-07-15T03:30:00.000Z" },
        { type: "OFFICE_OUT", time: "2026-07-15T05:30:00.000Z" },
        { type: "BRANCH_IN", time: "2026-07-15T06:00:00.000Z" },
        { type: "FIELD_CHECK_OUT", time: "2026-07-15T07:00:00.000Z" },
      ],
      Date.parse("2026-07-15T08:00:00.000Z"),
    );
    expect(result.milliseconds).toBe(3 * 60 * 60 * 1000);
    expect(result.isCheckedIn).toBe(false);
  });

  it("includes the current open session", () => {
    const result = workedTime(
      [{ type: "OFFICE_IN", time: "2026-07-15T03:30:00.000Z" }],
      Date.parse("2026-07-15T05:00:05.000Z"),
    );
    expect(formatWorkedTime(result.milliseconds)).toBe("01:30:05");
    expect(result.isCheckedIn).toBe(true);
  });

  it("reports closed intervals separately so a live counter can tick on its own", () => {
    const punches = [
      { type: "OFFICE_IN", time: "2026-07-15T03:30:00.000Z" },
      { type: "OFFICE_OUT", time: "2026-07-15T05:30:00.000Z" },
      { type: "BRANCH_IN", time: "2026-07-15T06:00:00.000Z" },
    ];
    const result = workedTime(punches, Date.parse("2026-07-15T07:00:00.000Z"));

    expect(result.completedMilliseconds).toBe(2 * 60 * 60 * 1000);
    expect(result.activeStart).toBe(Date.parse("2026-07-15T06:00:00.000Z"));

    // The dashboard renders completedMilliseconds + (now - activeStart) from a
    // leaf component, which has to match what the whole-session call returns.
    for (const now of ["2026-07-15T07:00:00.000Z", "2026-07-15T09:15:30.000Z"]) {
      const at = Date.parse(now);
      expect(result.completedMilliseconds + (at - result.activeStart!)).toBe(
        workedTime(punches, at).milliseconds,
      );
    }
  });

  it("leaves completed time untouched once the day is closed", () => {
    const result = workedTime(
      [
        { type: "OFFICE_IN", time: "2026-07-15T03:30:00.000Z" },
        { type: "OFFICE_OUT", time: "2026-07-15T05:30:00.000Z" },
      ],
      Date.parse("2026-07-15T08:00:00.000Z"),
    );
    expect(result.activeStart).toBeNull();
    expect(result.completedMilliseconds).toBe(result.milliseconds);
  });

  it("formats stored decimal hours as hours, minutes, and seconds", () => {
    expect(formatStoredWorkedTime(1.5014)).toBe("01:30:05");
    expect(formatStoredWorkedTime(0.841944)).toBe("00:50:31");
  });
});
