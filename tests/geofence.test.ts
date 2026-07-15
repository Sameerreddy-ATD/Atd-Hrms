import { describe, expect, it } from "vitest";
import { distanceMeters, nearestBranch } from "../server/src/geofence.js";

describe("branch geofence", () => {
  const madhapur = {
    branchId: "madhapur",
    branchName: "Madhapur",
    latitude: 17.4391592,
    longitude: 78.3947783,
    attendanceRadiusMeters: 250,
  };

  it("accepts a point within the configured radius", () => {
    expect(distanceMeters(madhapur, { latitude: 17.4392, longitude: 78.3948 })).toBeLessThan(250);
  });

  it("returns the nearest configured branch", () => {
    const result = nearestBranch({ latitude: 17.4392, longitude: 78.3948 }, [
      madhapur,
      { ...madhapur, branchId: "far", branchName: "Far", latitude: 18 },
    ]);
    expect(result?.branch.branchId).toBe("madhapur");
  });
});
