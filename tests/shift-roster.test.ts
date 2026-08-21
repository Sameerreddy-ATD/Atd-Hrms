import { describe, expect, it } from "vitest";
import {
  expectedWorkMinutesFromSegments,
  formatDuration,
  segmentDurationMinutes,
  validateSegments,
} from "../server/src/shiftRoster";
import { HttpError } from "../server/src/errors";

describe("shift segment validation", () => {
  it("calculates same-day and cross-midnight durations", () => {
    expect(segmentDurationMinutes({ startMinute: 540, endMinute: 1080, endDayOffset: 0 })).toBe(540);
    expect(segmentDurationMinutes({ startMinute: 1320, endMinute: 180, endDayOffset: 1 })).toBe(300);
  });

  it("sums split segments without counting gaps", () => {
    const minutes = expectedWorkMinutesFromSegments([
      { startMinute: 540, endMinute: 780, endDayOffset: 0 },
      { startMinute: 1020, endMinute: 1260, endDayOffset: 0 },
    ]);
    expect(minutes).toBe(480);
    expect(formatDuration(minutes)).toBe("8h 00m");
  });

  it("supports hybrid split + cross-midnight", () => {
    expect(
      expectedWorkMinutesFromSegments([
        { startMinute: 540, endMinute: 600, endDayOffset: 0 },
        { startMinute: 1320, endMinute: 180, endDayOffset: 1 },
      ]),
    ).toBe(360);
  });

  it("rejects empty, zero-duration, overlap, duplicate, and >24h overnight", () => {
    expect(() => validateSegments([])).toThrow(HttpError);
    expect(() =>
      validateSegments([{ startMinute: 540, endMinute: 540, endDayOffset: 0 }]),
    ).toThrow(/after start/i);
    expect(() =>
      validateSegments([
        { startMinute: 540, endMinute: 780, endDayOffset: 0 },
        { startMinute: 720, endMinute: 900, endDayOffset: 0 },
      ]),
    ).toThrow(/overlap/i);
    expect(() =>
      validateSegments([{ startMinute: 540, endMinute: 600, endDayOffset: 2 as 0 }]),
    ).toThrow(/Same Day/i);
    expect(() =>
      validateSegments([{ startMinute: 1320, endMinute: 1380, endDayOffset: 1 }]),
    ).toThrow(/24 hours/i);
    expect(() =>
      validateSegments([
        { startMinute: 540, endMinute: 780, endDayOffset: 0 },
        { startMinute: 540, endMinute: 780, endDayOffset: 0 },
      ]),
    ).toThrow(/duplicate/i);
  });
});
