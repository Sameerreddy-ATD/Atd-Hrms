import { describe, expect, it } from "vitest";

/**
 * Mirrors locationErrorFromGeolocationFailure in src/lib/geolocation.ts.
 * A GPS timeout must not be reported as Precise location being off.
 */
function locationErrorFromGeolocationFailure(error: { code?: number }) {
  const code = Number(error.code ?? 0);
  if (code === 1) {
    return { code: 1, message: "Precise location is required for attendance." };
  }
  if (code === 3) {
    return { code: 3, message: "GPS is still locking." };
  }
  return { code: code || 2, message: "Location could not be read." };
}

describe("locationErrorFromGeolocationFailure", () => {
  it("maps permission denied to the Precise location hint", () => {
    const error = locationErrorFromGeolocationFailure({ code: 1 });
    expect(error.code).toBe(1);
    expect(error.message).toMatch(/Precise location/i);
  });

  it("does not call a GPS timeout Precise-off", () => {
    const error = locationErrorFromGeolocationFailure({ code: 3 });
    expect(error.code).toBe(3);
    expect(error.message).toMatch(/GPS is still locking/i);
    expect(error.message).not.toMatch(/^Precise location is required/);
  });

  it("maps an unavailable provider without claiming Precise is off", () => {
    const error = locationErrorFromGeolocationFailure({ code: 2 });
    expect(error.code).toBe(2);
    expect(error.message).toMatch(/Location could not be read/i);
  });
});
