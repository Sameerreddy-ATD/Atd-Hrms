import { describe, expect, it } from "vitest";
import {
  BIRTHDAY_LOOKAHEAD_DAYS,
  isUpcomingBirthday,
  nextBirthdayDetails,
} from "../server/src/birthdays.js";

describe("birthday lookahead", () => {
  it("includes today through the next 90 days", () => {
    expect(BIRTHDAY_LOOKAHEAD_DAYS).toBe(90);
    expect(isUpcomingBirthday(0)).toBe(true);
    expect(isUpcomingBirthday(90)).toBe(true);
    expect(isUpcomingBirthday(91)).toBe(false);
    expect(isUpcomingBirthday(-1)).toBe(false);
  });
});

describe("nextBirthdayDetails", () => {
  it("uses the current calendar date in India, not UTC", () => {
    const dob = new Date("1995-08-06T00:00:00.000Z");
    const now = new Date("2026-08-05T20:00:00.000Z"); // 06 Aug, 01:30 IST
    expect(nextBirthdayDetails(dob, now)).toEqual({
      daysUntil: 0,
      isToday: true,
      age: 31,
    });
  });

  it("rolls birthdays across the end of the year", () => {
    const dob = new Date("1990-01-01T00:00:00.000Z");
    const now = new Date("2026-12-31T06:30:00.000Z"); // 31 Dec, 12:00 IST
    expect(nextBirthdayDetails(dob, now)).toEqual({
      daysUntil: 1,
      isToday: false,
      age: 37,
    });
  });

  it("uses 28 February for leap-day birthdays in non-leap years", () => {
    const dob = new Date("2000-02-29T00:00:00.000Z");
    const now = new Date("2026-02-27T06:30:00.000Z"); // 27 Feb, 12:00 IST
    expect(nextBirthdayDetails(dob, now)).toEqual({
      daysUntil: 1,
      isToday: false,
      age: 26,
    });
  });

  it("keeps 29 February in leap years", () => {
    const dob = new Date("2000-02-29T00:00:00.000Z");
    const now = new Date("2028-02-28T06:30:00.000Z");
    expect(nextBirthdayDetails(dob, now)).toEqual({
      daysUntil: 1,
      isToday: false,
      age: 28,
    });
  });
});
