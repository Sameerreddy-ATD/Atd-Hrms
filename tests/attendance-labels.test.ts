import { describe, expect, it } from "vitest";
import {
  attendanceSourceLabel,
  branchMobileSourceLabel,
  isMobileAttendanceSource,
  punchSourceLabel,
} from "../src/lib/attendance-labels";
import type { AttendanceRecord } from "../src/types/domain";

const branches = [
  { id: "b1", name: "Madhapur" },
  { id: "b2", name: "Gachibowli" },
];

describe("branch mobile attendance labels", () => {
  it("prefers the branch name for geofenced mobile punches", () => {
    expect(branchMobileSourceLabel("Madhapur")).toBe("Madhapur · Mobile");
    expect(branchMobileSourceLabel("")).toBe("Branch-Mobile");
    expect(branchMobileSourceLabel(null)).toBe("Branch-Mobile");
  });

  it("resolves BRANCH_MOBILE / Mobile GPS using branch id", () => {
    expect(punchSourceLabel("BRANCH_MOBILE", "b1", branches)).toBe("Madhapur · Mobile");
    expect(punchSourceLabel("Mobile GPS", "b2", branches)).toBe("Gachibowli · Mobile");
    expect(punchSourceLabel("Mobile GPS", undefined, branches)).toBe("Mobile");
    expect(punchSourceLabel("Madhapur · Mobile", "b1", branches)).toBe("Madhapur · Mobile");
  });

  it("fills bare Branch-Mobile from actualBranchId on the record", () => {
    const row = {
      source: "Branch-Mobile",
      checkInSource: "BRANCH_MOBILE",
      actualBranchId: "b1",
    } as AttendanceRecord;
    expect(attendanceSourceLabel(row, branches)).toBe("Madhapur · Mobile");
    expect(isMobileAttendanceSource("Madhapur · Mobile")).toBe(true);
  });
});
