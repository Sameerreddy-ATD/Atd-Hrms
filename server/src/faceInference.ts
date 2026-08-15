import path from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

/**
 * Server-side face analysis.
 *
 * The browser's liveness, anti-spoof and confidence numbers are advisory only —
 * a crafted POST can claim anything. Everything the verification decision rests
 * on is recomputed here from the submitted frame.
 *
 * Runs Human on the tfjs WASM backend so deployment needs no native toolchain
 * or GPU. Inference is serialized because the backend is CPU-bound and a burst
 * of concurrent punches would otherwise saturate the box.
 */

export type FaceFrameAnalysis = {
  descriptor: number[];
  faceConfidence: number;
  livenessScore: number;
  antiSpoofScore: number;
  faceCount: number;
  faceWidth: number;
  faceHeight: number;
};

const JPEG_PREFIX = "data:image/jpeg;base64,";
const LOAD_TIMEOUT_MS = 120_000;
const DETECT_TIMEOUT_MS = 20_000;

type HumanInstance = {
  load: () => Promise<void>;
  detect: (input: unknown) => Promise<{ face: RawFace[] }>;
  tf: {
    tidy: <T>(fn: () => T) => T;
    tensor3d: (data: Uint8Array, shape: number[], dtype: string) => unknown;
    expandDims: (tensor: unknown, axis: number) => unknown;
    dispose: (tensor: unknown) => void;
    getBackend: () => string;
  };
  models: { loaded: () => string[] };
};

type RawFace = {
  faceScore?: number;
  score?: number;
  embedding?: number[];
  real?: number;
  live?: number;
  box?: number[];
};

let humanPromise: Promise<HumanInstance> | null = null;
/** Serializes detect() calls; the WASM backend is single-threaded per process. */
let inferenceChain: Promise<unknown> = Promise.resolve();

export function isFaceServerInferenceEnabled() {
  return config.faceServerInference;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * tfjs fetches model manifests and weight shards through `fetch`, which refuses
 * file:// URLs in Node. Route those reads to disk and leave everything else alone.
 */
function installFileFetchShim() {
  const globalScope = globalThis as typeof globalThis & { __atdFaceFetchShim?: boolean };
  if (globalScope.__atdFaceFetchShim) return;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    if (typeof url === "string" && url.startsWith("file://")) {
      const body = await readFile(new URL(url));
      return new Response(new Uint8Array(body), { status: 200 });
    }
    return nativeFetch(input as RequestInfo, init);
  }) as typeof globalThis.fetch;
  globalScope.__atdFaceFetchShim = true;
}

async function createHuman(): Promise<HumanInstance> {
  installFileFetchShim();
  const require = createRequire(import.meta.url);

  const wasmDir = path.join(
    path.dirname(require.resolve("@tensorflow/tfjs-backend-wasm/package.json")),
    "dist",
  );
  const wasmPath = `${wasmDir}${path.sep}`;
  const { setWasmPaths } = require("@tensorflow/tfjs-backend-wasm");
  setWasmPaths(wasmPath);

  // The package's exports map uses invalid (non-"./") subpath keys, so the wasm
  // build cannot be imported by specifier. Resolve it beside the main entry.
  const humanDist = path.dirname(require.resolve("@vladmandic/human"));
  const HumanCtor = require(path.join(humanDist, "human.node-wasm.js")).default;

  const modelsDir = path.resolve(config.faceModelsDir);
  const human: HumanInstance = new HumanCtor({
    backend: "wasm",
    wasmPath,
    modelBasePath: `${pathToFileURL(modelsDir).href}/`,
    cacheModels: false,
    warmup: "none",
    debug: false,
    filter: { enabled: false },
    gesture: { enabled: false },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    segmentation: { enabled: false },
    face: {
      enabled: true,
      // maxDetected is 2 so a second person in frame is detectable rather than
      // silently cropped away; the caller rejects multi-face frames.
      detector: { enabled: true, maxDetected: 2, rotation: false },
      mesh: { enabled: true },
      iris: { enabled: false },
      emotion: { enabled: false },
      description: { enabled: true },
      antispoof: { enabled: true },
      liveness: { enabled: true },
    },
  });

  await withTimeout(human.load(), LOAD_TIMEOUT_MS, "Face model load");
  const loaded = human.models.loaded();
  for (const required of ["blazeface", "facemesh", "faceres", "antispoof", "liveness"]) {
    if (!loaded.includes(required)) {
      throw new Error(`Face model "${required}" failed to load from ${modelsDir}`);
    }
  }
  return human;
}

export async function loadFaceInference() {
  if (!humanPromise) {
    humanPromise = createHuman().catch((error) => {
      // Let the next request retry instead of caching a permanent failure.
      humanPromise = null;
      throw error;
    });
  }
  return humanPromise;
}

/** Decodes a JPEG data URL to tightly packed RGB bytes. */
async function decodeJpegToRgb(dataUrl: string) {
  if (!dataUrl.startsWith(JPEG_PREFIX)) {
    throw new HttpError(422, "A JPEG camera image is required");
  }
  const buffer = Buffer.from(dataUrl.slice(JPEG_PREFIX.length), "base64");
  if (buffer.length < 1_000 || buffer.length > 900_000) {
    throw new HttpError(422, "Camera image size is invalid");
  }
  const require = createRequire(import.meta.url);
  const jpeg = require("jpeg-js");
  let decoded: { width: number; height: number; data: Uint8Array };
  try {
    decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 128 });
  } catch {
    throw new HttpError(422, "The camera image could not be read");
  }
  if (
    decoded.width < 160 ||
    decoded.height < 160 ||
    decoded.width > 4096 ||
    decoded.height > 4096
  ) {
    throw new HttpError(422, "Camera image dimensions are invalid");
  }
  const pixels = decoded.width * decoded.height;
  const rgb = new Uint8Array(pixels * 3);
  for (let index = 0; index < pixels; index += 1) {
    rgb[index * 3] = decoded.data[index * 4];
    rgb[index * 3 + 1] = decoded.data[index * 4 + 1];
    rgb[index * 3 + 2] = decoded.data[index * 4 + 2];
  }
  return { rgb, width: decoded.width, height: decoded.height };
}

function clampScore(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value)));
}

/**
 * Detects exactly one face in the frame and returns the descriptor and quality
 * scores computed here, not the ones the client claimed.
 */
export async function analyzeFaceFrame(dataUrl: string): Promise<FaceFrameAnalysis> {
  const human = await loadFaceInference();
  const { rgb, width, height } = await decodeJpegToRgb(dataUrl);

  const run = async () => {
    const tf = human.tf;
    const tensor = tf.tidy(() => tf.expandDims(tf.tensor3d(rgb, [height, width, 3], "float32"), 0));
    try {
      return await withTimeout(human.detect(tensor), DETECT_TIMEOUT_MS, "Face detection");
    } finally {
      tf.dispose(tensor);
    }
  };

  const queued = inferenceChain.then(run, run);
  // Keep the chain alive regardless of this request's outcome.
  inferenceChain = queued.then(
    () => undefined,
    () => undefined,
  );
  const result = await queued;

  const faces = result.face ?? [];
  if (faces.length === 0) {
    throw new HttpError(422, "No face was detected in the photo. Face the camera and try again.");
  }
  if (faces.length > 1) {
    throw new HttpError(422, "More than one face is visible. Make sure you are alone in frame.");
  }
  const face = faces[0];
  const embedding = face.embedding ?? [];
  if (embedding.length < 64) {
    throw new HttpError(422, "The face could not be read clearly. Try again in better lighting.");
  }
  const box = face.box ?? [0, 0, 0, 0];
  return {
    descriptor: embedding,
    faceConfidence: clampScore(face.faceScore ?? face.score),
    livenessScore: clampScore(face.live),
    antiSpoofScore: clampScore(face.real),
    faceCount: faces.length,
    faceWidth: Number(box[2] ?? 0),
    faceHeight: Number(box[3] ?? 0),
  };
}
