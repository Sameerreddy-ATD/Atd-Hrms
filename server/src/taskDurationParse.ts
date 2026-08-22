import { HttpError } from "./errors.js";

const MAX_MINUTES_PER_ENTRY = 24 * 60;

/** Parse human duration strings like "1h 30m", "90m", "1h" into integer minutes. */
export function parseDurationToMinutes(input: string): number {
  const raw = input.trim().toLowerCase();
  if (/^-/.test(raw)) throw new HttpError(400, "Duration must be greater than zero");

  if (/^\d+$/.test(raw)) {
    const minutes = Number(raw);
    if (minutes <= 0) throw new HttpError(400, "Duration must be greater than zero");
    if (minutes > MAX_MINUTES_PER_ENTRY) {
      throw new HttpError(400, "Duration cannot exceed 24 hours per entry");
    }
    return minutes;
  }

  let total = 0;
  const pattern = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/g;
  let match: RegExpExecArray | null;
  let found = false;
  while ((match = pattern.exec(raw)) !== null) {
    found = true;
    const value = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(value) || value <= 0) {
      throw new HttpError(400, "Duration must be greater than zero");
    }
    if (unit.startsWith("h")) total += Math.round(value * 60);
    else total += Math.round(value);
  }
  if (!found) throw new HttpError(400, "Could not parse duration. Use formats like 1h 30m or 90m");
  if (total <= 0) throw new HttpError(400, "Duration must be greater than zero");
  if (total > MAX_MINUTES_PER_ENTRY) {
    throw new HttpError(400, "Duration cannot exceed 24 hours per entry");
  }
  return total;
}

export function formatMinutesAsDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
