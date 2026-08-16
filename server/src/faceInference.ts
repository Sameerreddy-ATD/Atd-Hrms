import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import type { FaceFrameAnalysis } from "./faceInferenceWorker.js";

/**
 * Server-side face analysis.
 *
 * The browser's liveness, anti-spoof and confidence numbers are advisory only —
 * a crafted POST can claim anything. Everything the verification decision rests
 * on is recomputed from the submitted frame by faceInferenceWorker.ts.
 *
 * This module is only the front door: it validates the payload cheaply, then
 * hands the bytes to a small pool of worker threads and queues the overflow.
 * The work itself cannot run here — Human on the tfjs WASM backend blocks
 * whichever thread it occupies for the duration of a detect (~490ms on the
 * production box), which on the main thread froze the entire API for as long as
 * people kept punching in.
 */

export type { FaceFrameAnalysis };

const JPEG_PREFIX = "data:image/jpeg;base64,";
const READY_TIMEOUT_MS = 150_000;
/** Generous next to the ~490ms service time; guards against a wedged worker. */
const REQUEST_TIMEOUT_MS = 60_000;

export function isFaceServerInferenceEnabled() {
  return config.faceServerInference;
}

type Pending = {
  resolve: (analysis: FaceFrameAnalysis) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type PoolWorker = {
  worker: Worker;
  ready: Promise<void>;
  /** The request this worker is currently running, if any. */
  busy: Pending | null;
  busyId: number | null;
};

type QueueEntry = {
  /** Owns its ArrayBuffer outright so it can be transferred, not copied. */
  jpeg: Uint8Array<ArrayBuffer>;
  resolve: (analysis: FaceFrameAnalysis) => void;
  reject: (error: Error) => void;
};

let pool: PoolWorker[] | null = null;
const queue: QueueEntry[] = [];
let nextRequestId = 1;

/**
 * Where the worker lives depends on how the server was started: `tsc` output
 * next to this file in production, the TypeScript source under tsx/vitest.
 */
function workerEntry() {
  const compiled = new URL("./faceInferenceWorker.js", import.meta.url);
  if (existsSync(compiled)) return { entry: compiled, execArgv: undefined };
  return {
    entry: new URL("./faceInferenceWorker.ts", import.meta.url),
    execArgv: ["--import", "tsx"],
  };
}

function spawnWorker(): PoolWorker {
  const { entry, execArgv } = workerEntry();
  const worker = new Worker(entry, {
    workerData: { modelsDir: config.faceModelsDir },
    execArgv,
  });
  worker.unref();

  const slot: PoolWorker = {
    worker,
    busy: null,
    busyId: null,
    ready: new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Face model load timed out after ${READY_TIMEOUT_MS}ms`)),
        READY_TIMEOUT_MS,
      );
      timer.unref();
      worker.once("message", (message: { type?: string; message?: string }) => {
        clearTimeout(timer);
        if (message?.type === "ready") resolve();
        else reject(new Error(message?.message ?? "Face inference worker failed to start"));
      });
      worker.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    }),
  };

  worker.on(
    "message",
    (message: {
      id?: number;
      ok?: boolean;
      analysis?: FaceFrameAnalysis;
      failure?: { status: number; message: string };
    }) => {
      if (typeof message?.id !== "number" || slot.busyId !== message.id) return;
      const pending = slot.busy;
      slot.busy = null;
      slot.busyId = null;
      if (pending) {
        clearTimeout(pending.timer);
        if (message.ok && message.analysis) pending.resolve(message.analysis);
        else
          pending.reject(
            new HttpError(
              message.failure?.status ?? 500,
              message.failure?.message ?? "Face verification failed",
            ),
          );
      }
      drain();
    },
  );

  const discard = (error: Error) => {
    const pending = slot.busy;
    slot.busy = null;
    slot.busyId = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    // Drop the whole pool so the next request rebuilds it rather than routing
    // work to a worker that has already exited.
    pool = null;
    void worker.terminate();
    drain();
  };
  worker.on("error", (error) => discard(error));
  worker.on("exit", (code) => {
    if (code !== 0) discard(new Error(`Face inference worker exited with code ${code}`));
  });

  return slot;
}

/**
 * One worker per spare core. Inference is CPU-bound, so oversubscribing would
 * only steal time from the event loop that has to answer everything else.
 */
function poolSize() {
  return Math.max(1, config.faceInferenceWorkers);
}

function ensurePool() {
  if (!pool) pool = Array.from({ length: poolSize() }, () => spawnWorker());
  return pool;
}

function drain() {
  if (!queue.length || !pool) return;
  for (const slot of pool) {
    if (!queue.length) return;
    if (slot.busy) continue;
    const entry = queue.shift()!;
    const id = nextRequestId++;
    const timer = setTimeout(() => {
      if (slot.busyId !== id) return;
      slot.busy = null;
      slot.busyId = null;
      entry.reject(new HttpError(504, "Face verification timed out. Please try again."));
    }, REQUEST_TIMEOUT_MS);
    timer.unref();
    slot.busy = { resolve: entry.resolve, reject: entry.reject, timer };
    slot.busyId = id;
    // Transferred rather than cloned, so the frame is moved into the worker.
    slot.worker.postMessage({ id, jpeg: entry.jpeg.buffer }, [entry.jpeg.buffer]);
  }
}

/** Spawns the pool and resolves once every worker has its models in memory. */
export async function loadFaceInference() {
  const workers = ensurePool();
  try {
    await Promise.all(workers.map((slot) => slot.ready));
  } catch (error) {
    pool = null;
    for (const slot of workers) void slot.worker.terminate();
    throw error;
  }
}

/**
 * Detects exactly one face in the frame and returns the descriptor and quality
 * scores computed here, not the ones the client claimed.
 */
export async function analyzeFaceFrame(dataUrl: string): Promise<FaceFrameAnalysis> {
  if (!dataUrl.startsWith(JPEG_PREFIX)) {
    throw new HttpError(422, "A JPEG camera image is required");
  }
  const decoded = Buffer.from(dataUrl.slice(JPEG_PREFIX.length), "base64");
  if (decoded.length < 1_000 || decoded.length > 900_000) {
    throw new HttpError(422, "Camera image size is invalid");
  }
  const jpeg = new Uint8Array(decoded.length);
  jpeg.set(decoded);

  // Past this depth the wait would outlast the request timeout anyway, and a
  // frame the employee can retry beats a connection that dies silently.
  if (queue.length >= config.faceInferenceQueueLimit) {
    throw new HttpError(503, "Face verification is busy right now. Please try again in a moment.");
  }

  await loadFaceInference();
  return new Promise<FaceFrameAnalysis>((resolve, reject) => {
    queue.push({ jpeg, resolve, reject });
    drain();
  });
}
