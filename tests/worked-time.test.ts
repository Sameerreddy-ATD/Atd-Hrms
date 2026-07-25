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

  it("formats stored decimal hours as hours, minutes, and seconds", () => {
    expect(formatStoredWorkedTime(1.5014)).toBe("01:30:05");
    expect(formatStoredWorkedTime(0.841944)).toBe("00:50:31");
  });
});
