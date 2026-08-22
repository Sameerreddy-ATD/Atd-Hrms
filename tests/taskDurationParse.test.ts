import { describe, expect, it } from "vitest";
import { HttpError } from "../server/src/errors.js";
import { formatMinutesAsDuration, parseDurationToMinutes } from "../server/src/taskDurationParse.js";

describe("parseDurationToMinutes", () => {
  it("parses hours and minutes", () => {
    expect(parseDurationToMinutes("1h 30m")).toBe(90);
    expect(parseDurationToMinutes("90m")).toBe(90);
    expect(parseDurationToMinutes("2h")).toBe(120);
  });

  it("rejects invalid input", () => {
    expect(() => parseDurationToMinutes("0")).toThrow(HttpError);
    expect(() => parseDurationToMinutes("-1h")).toThrow(HttpError);
    expect(() => parseDurationToMinutes("abc")).toThrow(HttpError);
  });

  it("formats minutes", () => {
    expect(formatMinutesAsDuration(90)).toBe("1h 30m");
    expect(formatMinutesAsDuration(60)).toBe("1h");
    expect(formatMinutesAsDuration(15)).toBe("15m");
  });
});
