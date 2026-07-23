import { describe, expect, it } from "vitest";
import {
  descriptorSimilarity,
  faceCaptureSchema,
  faceSettingsSchema,
} from "../server/src/faceAttendance.js";
import { mobileEventSchema } from "../server/src/schemas.js";

describe("face attendance security primitives", () => {
  it("returns a perfect match for identical face descriptors", () => {
    const descriptor = Array.from({ length: 1024 }, (_, index) => Math.sin(index) / 10);
    expect(descriptorSimilarity(descriptor, descriptor)).toBe(1);
  });

  it("rejects descriptors with incompatible dimensions", () => {
    expect(descriptorSimilarity(new Array(1024).fill(0), new Array(512).fill(0))).toBe(0);
  });

  it("keeps the privacy and verification defaults inside safe operating ranges", () => {
    const settings = faceSettingsSchema.parse({});
    expect(settings.retentionDays).toBe(5);
    expect(settings.matchThreshold).toBeGreaterThanOrEqual(0.6);
    expect(settings.maxGpsAccuracyMeters).toBeLessThanOrEqual(200);
  });

  it("rejects camera submissions without a complete descriptor and JPEG capture", () => {
    const result = faceCaptureSchema.safeParse({
      sessionId: "session-with-enough-characters",
      nonce: "n".repeat(40),
      descriptor: [0.1, 0.2],
      imageData: "data:image/png;base64,AAAA",
      faceConfidence: 1,
      livenessScore: 1,
      antiSpoofScore: 1,
      challengeCompleted: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a precise location-only payload for camera-free check-out", () => {
    const result = mobileEventSchema.safeParse({
      latitude: 17.385,
      longitude: 78.4867,
      locationAccuracy: 18,
      mobileDeviceId: "mobile-browser",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.faceVerification).toBeUndefined();
  });
});
