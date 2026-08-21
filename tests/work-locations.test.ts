import { describe, expect, it } from "vitest";
import { resolveAttendanceLocation } from "../server/src/attendanceLocationResolve.js";
import {
  isWorkLocationType,
  parseIndiaStateInput,
  suggestLocationCode,
  WORK_LOCATION_TYPES,
} from "../server/src/workLocationCatalog.js";

describe("work location catalog", () => {
  it("accepts only canonical location types", () => {
    for (const value of WORK_LOCATION_TYPES) {
      expect(isWorkLocationType(value)).toBe(true);
    }
    expect(isWorkLocationType("hub")).toBe(false);
    expect(isWorkLocationType("officee")).toBe(false);
    expect(isWorkLocationType("PARK")).toBe(false);
  });

  it("normalizes India state labels to canonical codes", () => {
    expect(parseIndiaStateInput("Telangana")).toBe("TELANGANA");
    expect(parseIndiaStateInput("TELANGANA")).toBe("TELANGANA");
    expect(parseIndiaStateInput("TS")).toBeNull();
  });

  it("suggests uppercase snake codes from names", () => {
    expect(suggestLocationCode("Madhapur Hub 1")).toBe("MADHAPUR_HUB_1");
    expect(suggestLocationCode("Banjara Hills")).toBe("BANJARA_HILLS");
  });
});

describe("attendance location resolve", () => {
  const madhapur = {
    branchId: "madhapur",
    branchName: "Madhapur Office",
    latitude: 17.4391592,
    longitude: 78.3947783,
    attendanceRadiusMeters: 250,
  };
  const hub = {
    branchId: "hub1",
    branchName: "Madhapur Hub-1",
    latitude: 17.4393,
    longitude: 78.3949,
    attendanceRadiusMeters: 120,
  };
  const banjara = {
    branchId: "banjara",
    branchName: "Banjara Hills",
    latitude: 17.4130575,
    longitude: 78.4232275,
    attendanceRadiusMeters: 250,
  };

  it("chooses nearest location when point is inside multiple radii", () => {
    const punch = { latitude: hub.latitude, longitude: hub.longitude };
    const resolved = resolveAttendanceLocation(punch, [madhapur, hub, banjara]);
    expect(resolved.mode).toBe("REGISTERED_LOCATION");
    expect(resolved.matchedLocation?.branchId).toBe("hub1");
  });

  it("accepts location B while Base Office is A (Base Office not a filter)", () => {
    const punch = { latitude: banjara.latitude, longitude: banjara.longitude };
    const resolved = resolveAttendanceLocation(punch, [madhapur, banjara]);
    expect(resolved.matchedLocation?.branchId).toBe("banjara");
  });

  it("returns MOBILE_FIELD when outside every active geofence", () => {
    const resolved = resolveAttendanceLocation(
      { latitude: 17.5, longitude: 78.5 },
      [madhapur, banjara],
    );
    expect(resolved.mode).toBe("MOBILE_FIELD");
    expect(resolved.matchedLocation).toBeNull();
  });

  it("scenario A: Base Office A + coords inside A → A", () => {
    const resolved = resolveAttendanceLocation(
      { latitude: madhapur.latitude, longitude: madhapur.longitude },
      [madhapur, banjara],
    );
    expect(resolved.matchedLocation?.branchId).toBe("madhapur");
  });

  it("scenario B: Base Office A + coords inside B → B", () => {
    const resolved = resolveAttendanceLocation(
      { latitude: banjara.latitude, longitude: banjara.longitude },
      [madhapur, banjara],
    );
    expect(resolved.matchedLocation?.branchId).toBe("banjara");
  });

  it("scenario C: outside all → MOBILE_FIELD", () => {
    expect(
      resolveAttendanceLocation({ latitude: 18, longitude: 79 }, [madhapur, banjara]).mode,
    ).toBe("MOBILE_FIELD");
  });

  it("scenario D: overlapping — nearer B (70m) wins over A (160m)", () => {
    const a = {
      branchId: "a",
      branchName: "A",
      latitude: 17.44,
      longitude: 78.39,
      attendanceRadiusMeters: 300,
    };
    const b = {
      branchId: "b",
      branchName: "B",
      latitude: 17.4406,
      longitude: 78.3906,
      attendanceRadiusMeters: 300,
    };
    // Point closer to B
    const punch = { latitude: 17.44055, longitude: 78.39055 };
    const resolved = resolveAttendanceLocation(punch, [a, b]);
    expect(resolved.matchedLocation?.branchId).toBe("b");
  });

  it("scenario E: inactive B ignored even when coordinates inside B", () => {
    // Caller must filter inactive — resolver only receives active list
    const resolved = resolveAttendanceLocation(
      { latitude: banjara.latitude, longitude: banjara.longitude },
      [madhapur],
    );
    expect(resolved.mode).toBe("MOBILE_FIELD");
  });
});
