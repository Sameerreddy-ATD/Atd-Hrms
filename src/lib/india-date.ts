/** Calendar date helpers in Asia/Kolkata (IST), matching backend attendance/leave day keys. */

const IST = "Asia/Kolkata";

export function indiaDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Shift an IST calendar date by whole days and return YYYY-MM-DD. */
export function indiaDateKeyShift(days: number, from: Date = new Date()): string {
  const [year, month, day] = indiaDateKey(from).split("-").map(Number);
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  utcNoon.setUTCDate(utcNoon.getUTCDate() + days);
  return indiaDateKey(utcNoon);
}

/** Current calendar month in Asia/Kolkata as YYYY-MM. */
export function indiaMonthKey(date: Date = new Date()): string {
  return indiaDateKey(date).slice(0, 7);
}

/** Inclusive first/last calendar days for a YYYY-MM month key (IST).
 * For the current month, `to` stops at today so future dates are not included.
 */
export function indiaMonthRange(monthKey: string): { from: string; to: string } {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) {
    const fallback = indiaMonthKey();
    return indiaMonthRange(fallback);
  }
  const from = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  // Day 0 of the next month is the last day of `month`.
  const lastDay = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  const monthEnd = indiaDateKey(lastDay);
  const today = indiaDateKey();
  const to = monthEnd > today ? today : monthEnd;
  return { from, to: to < from ? from : to };
}

/**
 * Display dates as DD/MM/YYYY (day/month/year) everywhere in the UI.
 * Accepts YYYY-MM-DD keys, ISO timestamps, or Date objects.
 * Keep YYYY-MM-DD only for API payloads and `<input type="date">` values.
 */
export function formatDisplayDate(value?: string | Date | null): string {
  if (value == null || value === "") return "-";
  if (typeof value === "string") {
    const dayKey = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      const [year, month, day] = dayKey.split("-");
      return `${day}/${month}/${year}`;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Compact weekday label for mobile day cards, e.g. "Sat, 15 Aug". */
export function formatDisplayDateWeekday(value?: string | Date | null): string {
  if (value == null || value === "") return "-";
  let date: Date;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    date = new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
  } else {
    date = value instanceof Date ? value : new Date(value);
  }
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/** Display date + time in IST as DD/MM/YYYY, HH:MM. */
export function formatDisplayDateTime(value?: string | Date | null): string {
  if (value == null || value === "") return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const datePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${datePart}, ${timePart}`;
}

/**
 * Editable-input form of a YYYY-MM-DD key: DD/MM/YYYY, or "" when unset.
 * Unlike `formatDisplayDate` this never renders a "-" placeholder.
 */
export function toDateInputText(value?: string | null): string {
  if (!value) return "";
  const dayKey = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return "";
  const [year, month, day] = dayKey.split("-");
  return `${day}/${month}/${year}`;
}

/** Progressively insert slashes while digits are typed: "05082026" -> "05/08/2026". */
export function maskDateInputText(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Parse typed DD/MM/YYYY into a YYYY-MM-DD key. Returns null when incomplete or not a real date. */
export function parseDateInputText(input: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const dayNum = Number(day);
  const monthNum = Number(month);
  const yearNum = Number(year);
  if (yearNum < 1900 || yearNum > 2999) return null;
  // Rejects rollovers such as 31/02 that Date would silently shift into March.
  const probe = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
  if (
    probe.getUTCFullYear() !== yearNum ||
    probe.getUTCMonth() !== monthNum - 1 ||
    probe.getUTCDate() !== dayNum
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

/** YYYY-MM-DD -> Date in the local calendar (no timezone shift for day-only values). */
export function dateKeyToLocalDate(value?: string | null): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").slice(0, 10));
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Local calendar Date -> YYYY-MM-DD, without the UTC shift `toISOString` would apply. */
export function localDateToDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Inclusive range label: DD/MM/YYYY to DD/MM/YYYY */
export function formatDisplayDateRange(
  from?: string | Date | null,
  to?: string | Date | null,
): string {
  if (!from && !to) return "-";
  if (from && to) return `${formatDisplayDate(from)} to ${formatDisplayDate(to)}`;
  return formatDisplayDate(from ?? to);
}
