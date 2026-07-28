import { describe, expect, it } from "vitest";
import { AttendanceLocationSource } from "@prisma/client";
import {
  branchMobileSourceLabel,
  locationSourceLabel,
} from "../server/src/attendancePolicy.js";

describe("branch mobile attendance labels", () => {
  it("prefers the branch name for geofenced mobile punches", () => {
    expect(branchMobileSourceLabel("Madhapur")).toBe("Madhapur · Mobile");
    expect(branchMobileSourceLabel("")).toBe("Branch-Mobile");
    expect(branchMobileSourceLabel(null)).toBe("Branch-Mobile");
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
});
