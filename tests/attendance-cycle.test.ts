import { describe, expect, it } from "vitest";
import {
  attendanceCycleFileSlug,
  attendanceCycleForDate,
  attendanceCycleLabel,
  attendanceCycleRange,
  currentAttendanceCycle,
  listRecentAttendanceCycles,
} from "../src/lib/attendance-cycle.js";
import {
  attendanceCycleForDate as serverCycleForDate,
  attendanceCycleRange as serverCycleRange,
  currentAttendanceCycle as serverCurrentCycle,
} from "../server/src/attendanceCycle.js";

describe("attendanceCycleRange", () => {
  it("maps closing month April to 21 Mar – 20 Apr", () => {
    expect(attendanceCycleRange("2026-04", { clampToToday: false })).toEqual({
      periodKey: "2026-04",
      from: "2026-03-21",
      to: "2026-04-20",
    });
  });

  it("wraps across year end", () => {
    expect(attendanceCycleRange("2026-01", { clampToToday: false })).toEqual({
      periodKey: "2026-01",
      from: "2025-12-21",
      to: "2026-01-20",
    });
  });

  it("clamps open periods to today", () => {
    expect(
      attendanceCycleRange("2026-08", { clampToToday: true, todayKey: "2026-08-17" }),
    ).toEqual({
      periodKey: "2026-08",
      from: "2026-07-21",
      to: "2026-08-17",
    });
  });
});

describe("attendanceCycleForDate", () => {
  it("uses prior cycle on the 20th", () => {
    expect(
      attendanceCycleForDate("2026-08-20", { clampToToday: false }),
    ).toMatchObject({
      periodKey: "2026-08",
      from: "2026-07-21",
      to: "2026-08-20",
    });
  });

  it("opens the next cycle on the 21st", () => {
    expect(
      attendanceCycleForDate("2026-08-21", { clampToToday: false }),
    ).toMatchObject({
      periodKey: "2026-09",
      from: "2026-08-21",
      to: "2026-09-20",
    });
  });

  it("matches 17 Aug 2026 example from the plan", () => {
    expect(
      attendanceCycleForDate("2026-08-17", { clampToToday: true, todayKey: "2026-08-17" }),
    ).toMatchObject({
      periodKey: "2026-08",
      from: "2026-07-21",
      to: "2026-08-17",
    });
  });
});

describe("labels and listing", () => {
  it("formats a readable cycle label", () => {
    expect(attendanceCycleLabel("2026-04")).toBe("Apr 2026 · 21 Mar – 20 Apr");
  });

  it("builds a filename slug", () => {
    expect(attendanceCycleFileSlug("2026-04")).toBe("2026-04_21Mar-20Apr");
  });

  it("lists recent cycles newest first", () => {
    const cycles = listRecentAttendanceCycles(3, { todayKey: "2026-08-17" });
    expect(cycles.map((c) => c.periodKey)).toEqual(["2026-08", "2026-07", "2026-06"]);
    expect(cycles[0].to).toBe("2026-08-17");
    expect(cycles[1].to).toBe("2026-07-20");
  });
});

describe("server cycle helpers stay aligned", () => {
  it("matches client bounds for closing months", () => {
    const client = attendanceCycleRange("2026-04", { clampToToday: false });
    const server = serverCycleRange("2026-04", { clampToToday: false });
    expect(server.from).toBe(client.from);
    expect(server.to).toBe(client.to);
    expect(server.periodKey).toBe(client.periodKey);
  });

  it("matches current cycle for a fixed IST day", () => {
    const now = new Date("2026-08-17T06:30:00.000Z"); // 17 Aug IST noon-ish
    const client = currentAttendanceCycle("2026-08-17");
    const server = serverCurrentCycle(now);
    expect(server.periodKey).toBe(client.periodKey);
    expect(server.from).toBe(client.from);
    expect(server.to).toBe(client.to);
    expect(serverCycleForDate("2026-08-21", { clampToToday: false }).periodKey).toBe("2026-09");
  });
});
