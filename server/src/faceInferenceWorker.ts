import path from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

/**
 * The Human/WASM half of server-side face analysis, isolated in a worker thread.
 *
 * `human.detect()` is a synchronous WASM call that pins whichever thread it runs
 * on. Measured on the production box, ten back-to-back verifications held the
 * loop for 5.3s and it ticked 0 times out of an expected 531 — on the main
 * thread that meant every other request (attendance, dashboards, health checks)
 * stalled behind whoever was punching in. Running it here keeps the API
 * responsive; see faceInference.ts for the pool and queue in front of it.
 *
 * Nothing in this file may import Express, Prisma or config — it is loaded into
 * a bare worker, and the parent passes in everything it needs.
 */

type WorkerBootstrap = { modelsDir: string };

export type FaceFrameAnalysis = {
  descriptor: number[];
  faceConfidence: number;
  livenessScore: number;
  antiSpoofScore: number;
  faceCount: number;
  faceWidth: number;
  faceHeight: number;
};

/** Mirrors HttpError so the parent can rebuild the same status on the far side. */
type WorkerFailure = { status: number; message: string };

type RequestMessage = { id: number; jpeg: ArrayBuffer };
type ResponseMessage =
  | { id: number; ok: true; analysis: FaceFrameAnalysis }
  | { id: number; ok: false; failure: WorkerFailure };

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

function fail(status: number, message: string): never {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  throw error;
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

async function createHuman(modelsDir: string): Promise<HumanInstance> {
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

  const resolvedModels = path.resolve(modelsDir);
  const human: HumanInstance = new HumanCtor({
    backend: "wasm",
    wasmPath,
    modelBasePath: `${pathToFileURL(resolvedModels).href}/`,
    cacheModels: false,
    warmup: "none",
    debug: false,
    // Human's defaults reuse the previous result when a frame looks similar or
    // was seen recently (skipFrames 99, skipTime 2.5-3s). That is right for a
    // webcam loop and catastrophic here: consecutive requests are different
    // people, so a cached hit could return one employee's descriptor for
    // another's frame. Every submodel is forced to run on every call.
    cacheSensitivity: 0,
    skipAllowed: false,
    // Image filters are a browser/WebGL feature and a no-op under Node, so
    // leaving them off costs nothing and keeps the pipeline explicit.
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
      detector: {
        enabled: true,
        maxDetected: 2,
        rotation: true,
        skipFrames: 0,
        skipTime: 0,
      },
      mesh: { enabled: true },
      iris: { enabled: false },
      emotion: { enabled: false },
      description: { enabled: true, skipFrames: 0, skipTime: 0 },
      antispoof: { enabled: true, skipFrames: 0, skipTime: 0 },
      liveness: { enabled: true, skipFrames: 0, skipTime: 0 },
    },
  });

  await withTimeout(human.load(), LOAD_TIMEOUT_MS, "Face model load");
  const loaded = human.models.loaded();
  for (const required of ["blazeface", "facemesh", "faceres", "antispoof", "liveness"]) {
    if (!loaded.includes(required)) {
      throw new Error(`Face model "${required}" failed to load from ${resolvedModels}`);
    }
  }
  return human;
}

/** Decodes JPEG bytes to tightly packed RGB. */
function decodeJpegToRgb(buffer: Buffer) {
  const require = createRequire(import.meta.url);
  const jpeg = require("jpeg-js");
  let decoded: { width: number; height: number; data: Uint8Array };
  try {
    decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 128 });
  } catch {
    fail(422, "The camera image could not be read");
  }
  if (
    decoded.width < 160 ||
    decoded.height < 160 ||
    decoded.width > 4096 ||
    decoded.height > 4096
  ) {
    fail(422, "Camera image dimensions are invalid");
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

async function analyze(human: HumanInstance, jpeg: Buffer): Promise<FaceFrameAnalysis> {
  const { rgb, width, height } = decodeJpegToRgb(jpeg);
  const tf = human.tf;
  const tensor = tf.tidy(() => tf.expandDims(tf.tensor3d(rgb, [height, width, 3], "float32"), 0));
  let result: { face: RawFace[] };
  try {
    result = await withTimeout(human.detect(tensor), DETECT_TIMEOUT_MS, "Face detection");
  } finally {
    tf.dispose(tensor);
  }

  const faces = result.face ?? [];
  if (faces.length === 0) {
    fail(422, "No face was detected in the photo. Face the camera and try again.");
  }
  if (faces.length > 1) {
    fail(422, "More than one face is visible. Make sure you are alone in frame.");
  }
  const face = faces[0];
  const embedding = face.embedding ?? [];
  if (embedding.length < 64) {
    fail(422, "The face could not be read clearly. Try again in better lighting.");
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

const port = parentPort;
if (port) {
  const { modelsDir } = workerData as WorkerBootstrap;
  let human: HumanInstance;
  try {
    human = await createHuman(modelsDir);
  } catch (error) {
    port.postMessage({ type: "load-error", message: (error as Error).message });
    throw error;
  }
  port.postMessage({ type: "ready" });

  port.on("message", (message: RequestMessage) => {
    // Awaited sequentially by the parent's queue; the worker only ever holds one.
    void analyze(human, Buffer.from(message.jpeg)).then(
      (analysis) => port.postMessage({ id: message.id, ok: true, analysis } as ResponseMessage),
      (error: Error & { status?: number }) =>
        port.postMessage({
          id: message.id,
          ok: false,
          failure: { status: error.status ?? 500, message: error.message },
        } as ResponseMessage),
    );
  });
}
