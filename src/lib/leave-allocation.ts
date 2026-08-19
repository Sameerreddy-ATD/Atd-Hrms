import type { LeaveBalance, LeaveTypeOption, WeeklyOffPolicy } from "@/types/domain";

export type LeaveAllocation = Record<string, number>;

const AUTO_ALLOCATE_ORDER = ["CASUAL", "COMP_OFF", "LOP"] as const;
const DISPLAY_ORDER = ["CASUAL", "COMP_OFF", "LOP", "SICK"] as const;

export function eachDateKeys(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const keys: string[] = [];
  let [year, month, day] = from.split("-").map(Number);
  for (;;) {
    const key = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (key > to) break;
    keys.push(key);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return keys;
}

export function isSundayDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
}

export function weekOffSkipKeys(input: {
  policy: WeeklyOffPolicy;
  dateKeys: string[];
  approvedWeeklyOffKeys: string[];
  countApprovedWeekOffAsLeaveKeys?: string[];
}) {
  const approved = new Set(input.approvedWeeklyOffKeys);
  const countAsLeave = new Set(input.countApprovedWeekOffAsLeaveKeys ?? []);
  return input.dateKeys.filter((key) => {
    if (input.policy === "SUNDAY_FIXED" && isSundayDateKey(key)) return true;
    if (approved.has(key) && !countAsLeave.has(key)) return true;
    return false;
  });
}

export function sortLeaveTypesForApply(types: LeaveTypeOption[]) {
  return [...types].sort((a, b) => {
    const ia = DISPLAY_ORDER.indexOf(a.code as (typeof DISPLAY_ORDER)[number]);
    const ib = DISPLAY_ORDER.indexOf(b.code as (typeof DISPLAY_ORDER)[number]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/** Casual first, then Comp Off, then unpaid. Sick is never auto-selected. */
export function autoAllocateLeaveTypes(
  totalDays: number,
  types: LeaveTypeOption[],
  balances: LeaveBalance[],
): LeaveAllocation {
  const alloc: LeaveAllocation = {};
  let remaining = totalDays;
  if (remaining <= 0) return alloc;

  for (const code of AUTO_ALLOCATE_ORDER) {
    if (remaining <= 0) break;
    const type = types.find((row) => row.code === code);
    if (!type) continue;
    if (code === "LOP") {
      alloc[type.id] = remaining;
      remaining = 0;
      break;
    }
    const balance = balances.find((row) => row.code === type.code)?.balance ?? 0;
    if (balance <= 0) continue;
    const use = Math.min(remaining, balance);
    if (use <= 0) continue;
    alloc[type.id] = use;
    remaining = Math.round((remaining - use) * 100) / 100;
  }

  return alloc;
}

export function sickDaysUsedInMonth(
  requests: Array<{
    type: string;
    from: string;
    status: string;
    days: number;
    cancelledDays?: number;
  }>,
  sickTypeName: string,
  monthKey: string,
) {
  const counted = new Set(["Pending", "Approved"]);
  return requests.reduce((total, row) => {
    if (row.type !== sickTypeName) return total;
    if (!counted.has(row.status)) return total;
    if (row.from.slice(0, 7) !== monthKey) return total;
    return total + Math.max(0, row.days - (row.cancelledDays ?? 0));
  }, 0);
}

export function sickLeaveMonthCap(balance: number, maxPerMonth: number, usedThisMonth: number) {
  return Math.max(0, Math.round(Math.min(balance, maxPerMonth - usedThisMonth) * 100) / 100);
}
