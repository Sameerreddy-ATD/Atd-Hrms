import { describe, expect, it } from "vitest";
import {
  descriptorSimilarity,
  descriptorSetSimilarity,
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
    expect(settings.verificationEnabled).toBe(true);
    expect(settings.matchThreshold).toBe(0.5);
    expect(settings.maxGpsAccuracyMeters).toBeLessThanOrEqual(200);
  });

  it("uses several strong samples instead of rejecting a person because of one weak frame", () => {
    const base = Array.from({ length: 1024 }, (_, index) => Math.sin(index) / 10);
    const close = base.map((value, index) => value + Math.cos(index) / 1_000);
    const secondClose = base.map((value, index) => value - Math.sin(index) / 1_000);
    const outlier = base.map((value, index) => value + (index % 2 ? 0.4 : -0.4));

    expect(descriptorSetSimilarity([base, close], [secondClose, close, outlier])).toBeGreaterThan(
      0.5,
    );
  });

  it("accepts a five-sample face capture for robust matching", () => {
    const descriptor = new Array(1024).fill(0.01);
    const result = faceCaptureSchema.safeParse({
      sessionId: "session-with-enough-characters",
      nonce: "n".repeat(40),
      descriptor,
      descriptorSamples: new Array(5).fill(null).map(() => [...descriptor]),
      imageData: `data:image/jpeg;base64,${"A".repeat(1_500)}`,
      faceConfidence: 1,
      livenessScore: 1,
      antiSpoofScore: 1,
      challengeCompleted: true,
    });
    expect(result.success).toBe(true);
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
