/**
 * Anytime Diesel attendance / payroll cycle: 21st of prior month → 20th of closing month.
 * Period key is YYYY-MM of the closing month (month of the 20th).
 * Keep in sync with src/lib/attendance-cycle.ts.
 */

import { todayIstDate } from "./attendanceDayRules.js";

export type AttendanceCycle = {
  periodKey: string;
  from: string;
  to: string;
  fromDate: Date;
  toDate: Date;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dayKeyUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfDayUtc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function parseDayKey(dayKey: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.slice(0, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function parsePeriodKey(periodKey: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, month };
}

function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function dayKey(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

function todayKeyIst(now = new Date()) {
  return dayKeyUtc(todayIstDate(now));
}

/** Inclusive cycle bounds for a closing-month period key (YYYY-MM of the 20th). */
export function attendanceCycleRange(
  periodKey: string,
  options?: { clampToToday?: boolean; now?: Date },
): AttendanceCycle {
  const parsed = parsePeriodKey(periodKey);
  if (!parsed) {
    return attendanceCycleForDate(todayKeyIst(options?.now), options);
  }
  const prev = shiftMonth(parsed.year, parsed.month, -1);
  const from = dayKey(prev.year, prev.month, 21);
  let to = dayKey(parsed.year, parsed.month, 20);
  if (options?.clampToToday !== false) {
    const today = todayKeyIst(options?.now);
    if (to > today) to = today;
    if (to < from) to = from;
  }
  const fromParts = parseDayKey(from)!;
  const toParts = parseDayKey(to)!;
  return {
    periodKey: `${String(parsed.year).padStart(4, "0")}-${pad2(parsed.month)}`,
    from,
    to,
    fromDate: startOfDayUtc(fromParts.year, fromParts.month, fromParts.day),
    toDate: startOfDayUtc(toParts.year, toParts.month, toParts.day),
  };
}

/** Resolve which 21→20 cycle contains an IST day key. */
export function attendanceCycleForDate(
  dayKeyValue: string,
  options?: { clampToToday?: boolean; now?: Date },
): AttendanceCycle {
  const parsed = parseDayKey(dayKeyValue);
  if (!parsed) {
    return attendanceCycleForDate(todayKeyIst(options?.now), options);
  }
  const period =
    parsed.day >= 21
      ? shiftMonth(parsed.year, parsed.month, 1)
      : { year: parsed.year, month: parsed.month };
  const periodKey = `${String(period.year).padStart(4, "0")}-${pad2(period.month)}`;
  return attendanceCycleRange(periodKey, options);
}

/** Current open cycle for “now” (IST). */
export function currentAttendanceCycle(now = new Date()): AttendanceCycle {
  return attendanceCycleForDate(todayKeyIst(now), { clampToToday: true, now });
}
