type TimelinePunch = { type: string; time: string };

const IN_TYPES = new Set([
  "OFFICE_IN",
  "BRANCH_IN",
  "FIELD_CHECK_IN",
  "CLIENT_CHECK_IN",
  "BREAK_IN",
]);

const OUT_TYPES = new Set([
  "OFFICE_OUT",
  "BRANCH_OUT",
  "FIELD_CHECK_OUT",
  "CLIENT_CHECK_OUT",
  "BREAK_OUT",
]);

export function workedTime(timeline: TimelinePunch[], now = Date.now()) {
  const punches = [...timeline]
    .map((punch) => ({ ...punch, timestamp: new Date(punch.time).getTime() }))
    .filter((punch) => Number.isFinite(punch.timestamp))
    .sort((first, second) => first.timestamp - second.timestamp);

  let activeStart: number | null = null;
  let completedMilliseconds = 0;
  let firstCheckIn: number | null = null;

  for (const punch of punches) {
    if (IN_TYPES.has(punch.type)) {
      if (activeStart === null) activeStart = punch.timestamp;
      if (firstCheckIn === null) firstCheckIn = punch.timestamp;
    } else if (OUT_TYPES.has(punch.type) && activeStart !== null) {
      completedMilliseconds += Math.max(0, punch.timestamp - activeStart);
      activeStart = null;
    }
  }

  return {
    activeStart,
    firstCheckIn,
    isCheckedIn: activeStart !== null,
    milliseconds:
      completedMilliseconds + (activeStart === null ? 0 : Math.max(0, now - activeStart)),
  };
}

export function formatWorkedTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function formatStoredWorkedTime(totalHours?: number, workedMinutes?: number) {
  const milliseconds = Number.isFinite(totalHours)
    ? Math.round(Math.max(0, totalHours ?? 0) * 3600) * 1000
    : Math.max(0, workedMinutes ?? 0) * 60_000;
  return formatWorkedTime(milliseconds);
}
