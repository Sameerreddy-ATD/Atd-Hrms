/** Calendar date helpers in Asia/Kolkata (IST), matching backend attendance/leave day keys. */

export function indiaDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
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

/** Inclusive first/last calendar days for a YYYY-MM month key (IST). */
export function indiaMonthRange(monthKey: string): { from: string; to: string } {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) {
    const fallback = indiaMonthKey();
    return indiaMonthRange(fallback);
  }
  const from = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  // Day 0 of the next month is the last day of `month`.
  const lastDay = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  const to = indiaDateKey(lastDay);
  return { from, to };
}
