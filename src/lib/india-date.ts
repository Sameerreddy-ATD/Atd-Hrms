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
