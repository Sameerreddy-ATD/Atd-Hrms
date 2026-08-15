import { describe, expect, it } from "vitest";
import { AttendanceLocationSource } from "@prisma/client";
import {
  branchMobileSourceLabel,
  formatLocationPlaceName,
  locationSourceLabel,
} from "../server/src/attendancePolicy.js";
import { formatBranchLocationLabel } from "../src/lib/branch-label.js";

describe("branch mobile attendance labels", () => {
  it("prefers the branch name for geofenced mobile punches", () => {
    expect(branchMobileSourceLabel("Madhapur")).toBe("Madhapur · Mobile");
    expect(branchMobileSourceLabel("")).toBe("Branch-Mobile");
    expect(branchMobileSourceLabel(null)).toBe("Branch-Mobile");
  });

  it("labels parking hubs as Name - Hub without a Mobile suffix", () => {
    expect(formatLocationPlaceName("Kompally Parking", true)).toBe("Kompally Parking - Hub");
    expect(branchMobileSourceLabel("Kompally Parking", true)).toBe("Kompally Parking - Hub");
    expect(
      locationSourceLabel(AttendanceLocationSource.BRANCH_MOBILE, "Kompally Parking", true),
    ).toBe("Kompally Parking - Hub");
    expect(
      locationSourceLabel(AttendanceLocationSource.THUMB_SCANNER, "Kompally Parking", true),
    ).toBe("Kompally Parking - Hub · Biometric");
  });

  it("labels location sources with branch names", () => {
    expect(locationSourceLabel(AttendanceLocationSource.BRANCH_MOBILE, "Madhapur")).toBe(
      "Madhapur · Mobile",
    );
    expect(locationSourceLabel(AttendanceLocationSource.MOBILE)).toBe("Mobile");
    expect(locationSourceLabel(AttendanceLocationSource.THUMB_SCANNER, "Gachibowli")).toBe(
      "Gachibowli · Biometric",
    );
  });

  it("formats frontend branch location labels the same way", () => {
    expect(formatBranchLocationLabel({ name: "Madhapur" })).toBe("Madhapur");
    expect(formatBranchLocationLabel({ name: "Kompally Parking", isHub: true })).toBe(
      "Kompally Parking - Hub",
    );
  });
});
