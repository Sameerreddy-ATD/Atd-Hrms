/**
 * Periodic Attendance exception detector (Missing Check-In / Missing Checkout).
 *
 * Cadence: every 10 minutes. Evaluation uses absolute Workday schedule timestamps
 * (Asia/Kolkata wall times stored as UTC instants) — midnight is irrelevant.
 *
 * Writes are skipped while maintenance mode is ON (handled inside
 * runAttendanceExceptionDetector). Idempotent via AttendanceException.dedupeKey.
 */
import { runAttendanceExceptionDetector } from "./attendanceExceptions.js";

/** Detector interval — do not tighten below 10 minutes in production. */
export const ATTENDANCE_EXCEPTION_DETECTOR_INTERVAL_MS = 10 * 60 * 1000;

/** Schedule semantics / Workday wall clock timezone for this product. */
export const ATTENDANCE_EXCEPTION_DETECTOR_TIMEZONE = "Asia/Kolkata";

let started = false;
let inFlight: Promise<unknown> | null = null;

async function tick() {
  if (inFlight) return;
  inFlight = runAttendanceExceptionDetector()
    .then((result) => {
      if (result.skipped) {
        console.info(
          `[attendance-exceptions] detector skipped (${"reason" in result ? result.reason : "unknown"})`,
        );
        return;
      }
      if (result.created > 0 || result.orphansRemoved) {
        console.info(
          `[attendance-exceptions] detector scanned=${result.scanned} created=${result.created} orphansRemoved=${result.orphansRemoved ?? 0}`,
        );
      }
    })
    .catch((error) => {
      console.error("[attendance-exceptions] detector failed", error);
    })
    .finally(() => {
      inFlight = null;
    });
  await inFlight;
}

/**
 * Start the background detector. Safe to call once per process.
 * Overlapping ticks are coalesced (single in-flight run).
 */
export function startAttendanceExceptionDetectorScheduler() {
  if (started) return;
  started = true;

  // Delay first tick slightly so boot / migrate / health settle first.
  setTimeout(() => void tick(), 45_000).unref();
  setInterval(() => void tick(), ATTENDANCE_EXCEPTION_DETECTOR_INTERVAL_MS).unref();

  console.info(
    `[attendance-exceptions] detector scheduled every ${ATTENDANCE_EXCEPTION_DETECTOR_INTERVAL_MS / 60_000}m (${ATTENDANCE_EXCEPTION_DETECTOR_TIMEZONE})`,
  );
}

/** Test helper — reset module singleton between unit tests. */
export function __resetAttendanceExceptionDetectorSchedulerForTests() {
  started = false;
  inFlight = null;
}
