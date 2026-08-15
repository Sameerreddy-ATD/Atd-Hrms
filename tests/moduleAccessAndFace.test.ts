import { describe, expect, it } from "vitest";
import { moduleForApiPath } from "../server/src/module-access.js";
import { descriptorsHaveTemporalVariance } from "../server/src/faceAttendance.js";

describe("moduleForApiPath casing", () => {
  it("maps mixed-case asset paths to COMPANY so the gate cannot be skipped", () => {
    expect(moduleForApiPath("/assets")).toBe("COMPANY");
    expect(moduleForApiPath("/ASSETS")).toBe("COMPANY");
    expect(moduleForApiPath("/Assets/mine")).toBe("PROFILE");
    expect(moduleForApiPath("/ATTENDANCE/my/today")).toBe("ATTENDANCE");
  });
});

describe("face descriptor temporal variance", () => {
  const base = Array.from({ length: 128 }, (_, i) => Math.sin(i));

  it("rejects a set of identical descriptors", () => {
    expect(descriptorsHaveTemporalVariance([base, [...base], [...base]])).toBe(false);
  });

  it("accepts descriptors with real inter-frame jitter", () => {
    const jittered = base.map((value, index) => value + (index % 2 === 0 ? 0.01 : -0.01));
    expect(descriptorsHaveTemporalVariance([base, jittered])).toBe(true);
  });
});
