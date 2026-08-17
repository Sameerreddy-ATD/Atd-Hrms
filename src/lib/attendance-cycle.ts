/**
 * Anytime Diesel attendance / payroll cycle: 21st of prior month → 20th of closing month.
 * Period key is YYYY-MM of the closing month (month of the 20th).
 */

export type AttendanceCycle = {
  periodKey: string;
  from: string;
  to: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
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

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Inclusive cycle bounds for a closing-month period key (YYYY-MM of the 20th). */
export function attendanceCycleRange(
  periodKey: string,
  options?: { clampToToday?: boolean; todayKey?: string },
): AttendanceCycle {
  const parsed = parsePeriodKey(periodKey);
  if (!parsed) {
    return attendanceCycleForDate(options?.todayKey ?? new Date().toISOString().slice(0, 10), {
      clampToToday: options?.clampToToday,
      todayKey: options?.todayKey,
    });
  }
  const prev = shiftMonth(parsed.year, parsed.month, -1);
  const from = dayKey(prev.year, prev.month, 21);
  let to = dayKey(parsed.year, parsed.month, 20);
  if (options?.clampToToday !== false) {
    const today = options?.todayKey ?? new Date().toISOString().slice(0, 10);
    if (to > today) to = today;
    if (to < from) to = from;
  }
  return { periodKey: `${String(parsed.year).padStart(4, "0")}-${pad2(parsed.month)}`, from, to };
}

/** Resolve which 21→20 cycle contains an IST day key. */
export function attendanceCycleForDate(
  dayKeyValue: string,
  options?: { clampToToday?: boolean; todayKey?: string },
): AttendanceCycle {
  const parsed = parseDayKey(dayKeyValue);
  if (!parsed) {
    const today = options?.todayKey ?? new Date().toISOString().slice(0, 10);
    return attendanceCycleForDate(today, options);
  }
  const period =
    parsed.day >= 21
      ? shiftMonth(parsed.year, parsed.month, 1)
      : { year: parsed.year, month: parsed.month };
  const periodKey = `${String(period.year).padStart(4, "0")}-${pad2(period.month)}`;
  return attendanceCycleRange(periodKey, options);
}

/** Human label: `Apr 2026 · 21 Mar – 20 Apr`. */
export function attendanceCycleLabel(periodKey: string): string {
  const parsed = parsePeriodKey(periodKey);
  if (!parsed) return periodKey;
  const range = attendanceCycleRange(periodKey, { clampToToday: false });
  const fromParts = parseDayKey(range.from);
  const toParts = parseDayKey(range.to);
  if (!fromParts || !toParts) return periodKey;
  const closing = `${MONTH_SHORT[parsed.month - 1]} ${parsed.year}`;
  const fromLabel = `${fromParts.day} ${MONTH_SHORT[fromParts.month - 1]}`;
  const toLabel = `${toParts.day} ${MONTH_SHORT[toParts.month - 1]}`;
  return `${closing} · ${fromLabel} – ${toLabel}`;
}

/** Compact filename fragment: `2026-04_21Mar-20Apr`. */
export function attendanceCycleFileSlug(periodKey: string): string {
  const range = attendanceCycleRange(periodKey, { clampToToday: false });
  const fromParts = parseDayKey(range.from);
  const toParts = parseDayKey(range.to);
  if (!fromParts || !toParts) return periodKey;
  return `${periodKey}_${fromParts.day}${MONTH_SHORT[fromParts.month - 1]}-${toParts.day}${MONTH_SHORT[toParts.month - 1]}`;
}

/** Recent closing-month period keys ending at the current cycle (newest first). */
export function listRecentAttendanceCycles(
  count = 18,
  options?: { todayKey?: string },
): AttendanceCycle[] {
  const today = options?.todayKey ?? new Date().toISOString().slice(0, 10);
  const current = attendanceCycleForDate(today, { clampToToday: true, todayKey: today });
  const start = parsePeriodKey(current.periodKey);
  if (!start) return [current];
  const cycles: AttendanceCycle[] = [];
  for (let i = 0; i < count; i++) {
    const shifted = shiftMonth(start.year, start.month, -i);
    const key = `${String(shifted.year).padStart(4, "0")}-${pad2(shifted.month)}`;
    cycles.push(
      attendanceCycleRange(key, {
        clampToToday: i === 0,
        todayKey: today,
      }),
    );
  }
  return cycles;
}

/** Current open cycle for “today” (IST day key). */
export function currentAttendanceCycle(todayKey: string): AttendanceCycle {
  return attendanceCycleForDate(todayKey, { clampToToday: true, todayKey });
}
