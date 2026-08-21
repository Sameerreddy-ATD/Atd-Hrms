/**
 * Canonical attendance location resolution (backend authoritative).
 * Base Office is NOT used as a filter — punch may match any active geofence.
 */
import { distanceMeters, matchingBranch, type GeofenceBranch } from "./geofence.js";

export type AttendanceLocationMode = "REGISTERED_LOCATION" | "MOBILE_FIELD";

export type AttendanceLocationResolution = {
  mode: AttendanceLocationMode;
  matchedLocation: GeofenceBranch | null;
  distanceMeters: number | null;
  radiusMeters: number | null;
};

/**
 * Resolve punch coordinates against ACTIVE registered locations with lat/long.
 * If inside multiple radii → nearest by Haversine distance.
 * If outside all → MOBILE_FIELD (no invented Branch).
 */
export function resolveAttendanceLocation(
  location: { latitude: number; longitude: number },
  activeLocations: GeofenceBranch[],
): AttendanceLocationResolution {
  const match = matchingBranch(location, activeLocations);
  if (!match) {
    const nearest = activeLocations
      .map((branch) => ({ branch, distance: distanceMeters(location, branch) }))
      .sort((a, b) => a.distance - b.distance)[0];
    return {
      mode: "MOBILE_FIELD",
      matchedLocation: null,
      distanceMeters: nearest?.distance ?? null,
      radiusMeters: null,
    };
  }
  return {
    mode: "REGISTERED_LOCATION",
    matchedLocation: match.branch,
    distanceMeters: match.distance,
    radiusMeters: match.branch.attendanceRadiusMeters,
  };
}
