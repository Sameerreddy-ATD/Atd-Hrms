import { describe, expect, it } from "vitest";
import {
  expectedWorkMinutesFromSegments,
  formatDuration,
  formatSegmentLabel,
  hmToMinutes,
  minutesToHm,
  mondayOfWeek,
  segmentDurationMinutes,
} from "../src/lib/shiftDisplay";

describe("shiftDisplay helpers", () => {
  it("converts minutes and HH:MM", () => {
    expect(minutesToHm(540)).toBe("09:00");
    expect(hmToMinutes("09:00")).toBe(540);
    expect(hmToMinutes("22:00")).toBe(1320);
    expect(hmToMinutes("bad")).toBeNull();
  });

  it("formats segment labels and durations", () => {
    expect(formatSegmentLabel({ startMinute: 540, endMinute: 1080, endDayOffset: 0 })).toBe(
      "09:00–18:00",
    );
    expect(formatSegmentLabel({ startMinute: 1320, endMinute: 180, endDayOffset: 1 })).toBe(
      "22:00–03:00 (+1)",
    );
    expect(segmentDurationMinutes({ startMinute: 1320, endMinute: 180, endDayOffset: 1 })).toBe(300);
    expect(
      expectedWorkMinutesFromSegments([
        { startMinute: 540, endMinute: 780, endDayOffset: 0 },
        { startMinute: 1020, endMinute: 1260, endDayOffset: 0 },
      ]),
    ).toBe(480);
    expect(formatDuration(480)).toBe("8h 00m");
  });

  it("snaps dates to Monday week start", () => {
    expect(mondayOfWeek("2026-08-21")).toBe("2026-08-17"); // Friday → Monday
    expect(mondayOfWeek("2026-08-17")).toBe("2026-08-17");
    expect(mondayOfWeek("2026-08-16")).toBe("2026-08-10"); // Sunday → prior Monday
  });
});
