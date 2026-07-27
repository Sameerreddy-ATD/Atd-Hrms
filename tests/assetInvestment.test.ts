import { describe, expect, it } from "vitest";
import {
  annualEquivalent,
  equalCostShare,
  lifetimeCostForAssignment,
  monthlyEquivalent,
  monthsBetween,
} from "../server/src/assetInvestment.js";

describe("asset cost sharing", () => {
  it("divides a shared Canva-style subscription across seats", () => {
    expect(equalCostShare(50_000, 20)).toBe(2500);
    expect(equalCostShare(50_000, 19)).toBeCloseTo(2631.58, 2);
  });

  it("maps monthly and yearly pool costs", () => {
    expect(monthlyEquivalent(2500, "MONTHLY")).toBe(2500);
    expect(annualEquivalent(2500, "MONTHLY")).toBe(30_000);
    expect(monthlyEquivalent(12_000, "YEARLY")).toBe(1000);
    expect(annualEquivalent(12_000, "YEARLY")).toBe(12_000);
  });

  it("accumulates lifetime recurring cost across an assignment window", () => {
    const assignedAt = new Date("2026-01-01T00:00:00.000Z");
    const returnedAt = new Date("2026-04-01T00:00:00.000Z");
    const months = monthsBetween(assignedAt, returnedAt);
    expect(months).toBeCloseTo(2.96, 1);
    expect(
      lifetimeCostForAssignment({
        costShareAmount: 2500,
        costShareFrequency: "MONTHLY",
        assignedAt,
        returnedAt,
      }),
    ).toBeCloseTo(2500 * months, 2);
  });

  it("counts one-time equipment at full share for lifetime", () => {
    expect(
      lifetimeCostForAssignment({
        costShareAmount: 40_000,
        costShareFrequency: "ONE_TIME",
        assignedAt: new Date("2025-01-01T00:00:00.000Z"),
        returnedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toBe(40_000);
  });
});
