import { describe, expect, it } from "vitest";
import {
  branchLookupKey,
  formatBranchLocationLabel,
  formatBranchLocationLabelById,
} from "../src/lib/branch-label.js";

describe("formatBranchLocationLabel", () => {
  it("leaves ordinary branches unchanged", () => {
    expect(formatBranchLocationLabel({ name: "Madhapur" })).toBe("Madhapur");
    expect(formatBranchLocationLabel({ name: "Madhapur", isHub: false })).toBe("Madhapur");
  });

  it("always appends - Hub for hubs", () => {
    expect(formatBranchLocationLabel({ name: "Kompally Parking", isHub: true })).toBe(
      "Kompally Parking - Hub",
    );
  });

  it("does not double-append when the name already ends with Hub", () => {
    expect(formatBranchLocationLabel({ name: "Kompally Parking - Hub", isHub: true })).toBe(
      "Kompally Parking - Hub",
    );
    expect(formatBranchLocationLabel({ name: "Kompally Parking Hub", isHub: true })).toBe(
      "Kompally Parking - Hub",
    );
  });

  it("resolves by id", () => {
    const branches = [
      { id: "b1", name: "Madhapur", isHub: false },
      { id: "h1", name: "Kompally Parking", isHub: true },
    ];
    expect(formatBranchLocationLabelById(branches, "h1")).toBe("Kompally Parking - Hub");
    expect(formatBranchLocationLabelById(branches, "missing", "—")).toBe("—");
  });

  it("matches import names with or without the hub suffix", () => {
    expect(branchLookupKey("Kompally Parking - Hub")).toBe("kompally parking");
    expect(branchLookupKey("Kompally Parking")).toBe("kompally parking");
  });
});
