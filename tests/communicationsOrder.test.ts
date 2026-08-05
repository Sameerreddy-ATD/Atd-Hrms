import { describe, expect, it } from "vitest";
import { sortAnnouncements } from "../src/lib/announcements.js";
import { futureBirthdays } from "../src/lib/birthdays.js";

describe("sortAnnouncements", () => {
  it("orders urgent before important before normal, then newest first", () => {
    const sorted = sortAnnouncements([
      { priority: "NORMAL", publishAt: "2026-07-25T10:00:00.000Z" },
      { priority: "URGENT", publishAt: "2026-07-24T10:00:00.000Z" },
      { priority: "IMPORTANT", publishAt: "2026-07-25T12:00:00.000Z" },
      { priority: "URGENT", publishAt: "2026-07-25T09:00:00.000Z" },
    ]);
    expect(sorted.map((item) => `${item.priority}:${item.publishAt}`)).toEqual([
      "URGENT:2026-07-25T09:00:00.000Z",
      "URGENT:2026-07-24T10:00:00.000Z",
      "IMPORTANT:2026-07-25T12:00:00.000Z",
      "NORMAL:2026-07-25T10:00:00.000Z",
    ]);
  });
});

describe("futureBirthdays", () => {
  it("keeps soonest upcoming birthdays first and skips today", () => {
    const sorted = futureBirthdays([
      { daysUntil: 12 },
      { daysUntil: 0 },
      { daysUntil: 3 },
      { daysUntil: 90 },
      { daysUntil: 91 },
    ]);
    expect(sorted.map((item) => item.daysUntil)).toEqual([3, 12, 90]);
  });
});
