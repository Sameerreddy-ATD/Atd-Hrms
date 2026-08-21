/** Client-side helpers for shift segment / duration display (unit-friendly). */

export type SegmentLike = {
  startMinute: number;
  endMinute: number;
  endDayOffset: number;
};

export function minutesToHm(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function hmToMinutes(hm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const min = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(Math.max(0, minutes) / 60);
  const m = Math.max(0, minutes) % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function segmentDurationMinutes(seg: SegmentLike): number {
  if (seg.endDayOffset === 0) {
    return Math.max(0, seg.endMinute - seg.startMinute);
  }
  if (seg.endDayOffset === 1) {
    return Math.max(0, 1440 - seg.startMinute) + Math.max(0, seg.endMinute);
  }
  return 0;
}

export function expectedWorkMinutesFromSegments(segments: SegmentLike[]): number {
  return segments.reduce((sum, seg) => sum + segmentDurationMinutes(seg), 0);
}

/** Human label e.g. "09:00–18:00" or "22:00–03:00 (+1)". */
export function formatSegmentLabel(seg: SegmentLike): string {
  const start = minutesToHm(seg.startMinute);
  const end = minutesToHm(seg.endMinute);
  return seg.endDayOffset === 1 ? `${start}–${end} (+1)` : `${start}–${end}`;
}

export function formatSegmentsSummary(segments: SegmentLike[]): string {
  if (!segments.length) return "—";
  return segments.map(formatSegmentLabel).join(", ");
}

/** Monday (UTC date parts) as YYYY-MM-DD for the week containing `isoDate`. */
export function mondayOfWeek(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  const day = dt.getUTCDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function weekDayIsos(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
}

export function suggestShiftCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function todayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
