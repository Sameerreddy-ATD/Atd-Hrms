import { describe, expect, it } from "vitest";
import { distanceMeters, matchingBranch, nearestBranch } from "../server/src/geofence.js";

describe("branch geofence", () => {
  const madhapur = {
    branchId: "madhapur",
    branchName: "Madhapur",
    latitude: 17.4391592,
    longitude: 78.3947783,
    attendanceRadiusMeters: 250,
  };
  const banjara = {
    branchId: "banjara",
    branchName: "Banjara Hills",
    latitude: 17.4130575,
    longitude: 78.4232275,
    attendanceRadiusMeters: 250,
  };

  it("accepts a point within the configured radius", () => {
    expect(distanceMeters(madhapur, { latitude: 17.4392, longitude: 78.3948 })).toBeLessThan(250);
  });

  it("matches Banjara Hills punches inside the office geofence", () => {
    const punch = { latitude: 17.4131298, longitude: 78.4233148 };
    expect(distanceMeters(banjara, punch)).toBeLessThan(250);
    const result = nearestBranch(punch, [madhapur, banjara]);
    expect(result?.branch.branchId).toBe("banjara");
    expect(result!.distance).toBeLessThanOrEqual(banjara.attendanceRadiusMeters);
  });

  it("returns the nearest configured branch", () => {
    const result = nearestBranch({ latitude: 17.4392, longitude: 78.3948 }, [
      madhapur,
      banjara,
      { ...madhapur, branchId: "far", branchName: "Far", latitude: 18 },
    ]);
    expect(result?.branch.branchId).toBe("madhapur");
  });

  it("matches hubs and rejects locations outside every radius", () => {
    const hub = {
      ...madhapur,
      branchId: "madhapur-hub",
      branchName: "Madhapur Hub",
      latitude: 17.460285,
      longitude: 78.397064,
    };
    expect(matchingBranch({ latitude: hub.latitude, longitude: hub.longitude }, [hub])?.branch).toBe(
      hub,
    );
    expect(matchingBranch({ latitude: 17.5, longitude: 78.45 }, [hub])).toBeUndefined();
  });
});
