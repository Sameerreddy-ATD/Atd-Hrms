/**
 * Leave calendar policy — configurable boundaries.
 * Defaults preserve current production semantics until HR confirms.
 *
 * POLICY_CONFIRMATION_REQUIRED=YES
 */
import { prisma } from "./prisma.js";

export const LEAVE_HOLIDAY_CONSUMES_KEY = "leave.holidayConsumesBalance";
export const LEAVE_WEEKLY_OFF_CONSUMES_KEY = "leave.weeklyOffConsumesBalance";

/** Production-compatible defaults (audit): holidays consume; weekly offs do not. */
export const LEAVE_CALENDAR_DEFAULTS = {
  holidayConsumesBalance: true,
  weeklyOffConsumesBalance: false,
} as const;

export const LEAVE_POLICY_CONFIRMATION_REQUIRED = true;
export const LEAVE_HOLIDAY_POLICY_CONFIRMATION_REQUIRED = true;
export const LEAVE_WEEKLY_OFF_POLICY_CONFIRMATION_REQUIRED = true;
export const COMP_OFF_POLICY_CONFIRMATION_REQUIRED = true;
export const SPLIT_SHIFT_HALF_DAY_POLICY = "BLOCKED_UNTIL_CONFIRMED" as const;

function parseBool(raw: string | null | undefined, fallback: boolean) {
  if (raw == null || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return fallback;
}

export async function getLeaveCalendarPolicy() {
  const rows = await prisma.systemSetting.findMany({
    where: {
      key: { in: [LEAVE_HOLIDAY_CONSUMES_KEY, LEAVE_WEEKLY_OFF_CONSUMES_KEY] },
    },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    holidayConsumesBalance: parseBool(
      map.get(LEAVE_HOLIDAY_CONSUMES_KEY),
      LEAVE_CALENDAR_DEFAULTS.holidayConsumesBalance,
    ),
    weeklyOffConsumesBalance: parseBool(
      map.get(LEAVE_WEEKLY_OFF_CONSUMES_KEY),
      LEAVE_CALENDAR_DEFAULTS.weeklyOffConsumesBalance,
    ),
    policyConfirmationRequired: LEAVE_POLICY_CONFIRMATION_REQUIRED,
    splitShiftHalfDayPolicy: SPLIT_SHIFT_HALF_DAY_POLICY,
    compOffPolicyConfirmationRequired: COMP_OFF_POLICY_CONFIRMATION_REQUIRED,
  };
}

export async function setLeaveCalendarPolicy(input: {
  holidayConsumesBalance?: boolean;
  weeklyOffConsumesBalance?: boolean;
  updatedById?: string | null;
}) {
  if (input.holidayConsumesBalance !== undefined) {
    await prisma.systemSetting.upsert({
      where: { key: LEAVE_HOLIDAY_CONSUMES_KEY },
      create: {
        key: LEAVE_HOLIDAY_CONSUMES_KEY,
        value: input.holidayConsumesBalance ? "true" : "false",
        updatedById: input.updatedById ?? null,
      },
      update: {
        value: input.holidayConsumesBalance ? "true" : "false",
        updatedById: input.updatedById ?? null,
      },
    });
  }
  if (input.weeklyOffConsumesBalance !== undefined) {
    await prisma.systemSetting.upsert({
      where: { key: LEAVE_WEEKLY_OFF_CONSUMES_KEY },
      create: {
        key: LEAVE_WEEKLY_OFF_CONSUMES_KEY,
        value: input.weeklyOffConsumesBalance ? "true" : "false",
        updatedById: input.updatedById ?? null,
      },
      update: {
        value: input.weeklyOffConsumesBalance ? "true" : "false",
        updatedById: input.updatedById ?? null,
      },
    });
  }
  return getLeaveCalendarPolicy();
}
