import { describe, expect, it } from "vitest";
import { monthsCredited } from "../server/src/leavePolicy.js";

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
