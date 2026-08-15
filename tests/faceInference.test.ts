import path from "node:path";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { analyzeFaceFrame } from "../server/src/faceInference.js";

/**
 * These exercise the real Human/WASM pipeline rather than a mock — the whole
 * point of server-side inference is that the numbers come from our own model
 * run, so a mocked test would prove nothing.
 */
const require = createRequire(import.meta.url);
const humanAssets = path.join(path.dirname(require.resolve("@vladmandic/human")), "..", "assets");

async function jpegDataUrl(file: string) {
  const buffer = await readFile(file);
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

function syntheticJpeg(width: number, height: number) {
  const jpeg = require("jpeg-js");
  const raw = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    raw[index * 4] = 130;
    raw[index * 4 + 1] = 130;
    raw[index * 4 + 2] = 130;
    raw[index * 4 + 3] = 255;
  }
  const encoded = jpeg.encode({ data: raw, width, height }, 88);
  return `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`;
}

describe("server-side face inference", () => {
  it("rejects a frame with no face rather than trusting the caller", async () => {
    await expect(analyzeFaceFrame(syntheticJpeg(480, 480))).rejects.toThrow(
      /No face was detected/i,
    );
  }, 180_000);

  it("rejects a frame containing more than one face", async () => {
    const twoFaces = await jpegDataUrl(path.join(humanAssets, "screenshot-facedetect.jpg"));
    await expect(analyzeFaceFrame(twoFaces)).rejects.toThrow(/more than one face/i);
  }, 180_000);

  it("derives a descriptor and quality scores from the pixels", async () => {
    const oneFace = await jpegDataUrl(path.join(humanAssets, "screenshot-faceid.jpg"));
    const analysis = await analyzeFaceFrame(oneFace);
    // faceres emits 1024 floats; the stored templates and the similarity
    // function both assume that width.
    expect(analysis.descriptor.length).toBe(1024);
    expect(analysis.descriptor.every((value) => Number.isFinite(value))).toBe(true);
    for (const score of [
      analysis.faceConfidence,
      analysis.livenessScore,
      analysis.antiSpoofScore,
    ]) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
    expect(analysis.faceConfidence).toBeGreaterThan(0.5);
  }, 180_000);

  it("rejects a payload that is not a JPEG data URL", async () => {
    await expect(analyzeFaceFrame("data:image/png;base64,AAAA")).rejects.toThrow(/JPEG/i);
  });
});
