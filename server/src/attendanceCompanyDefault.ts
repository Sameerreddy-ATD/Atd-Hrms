/**
 * Company default shift — prospective fallback only.
 * Configured via SystemSetting `attendance.defaultShiftId` (never by name inference).
 * Changing the pointer must not rewrite historical AttendanceWorkday snapshots.
 */
import { prisma } from "./prisma.js";

export const ATTENDANCE_DEFAULT_SHIFT_SETTING_KEY = "attendance.defaultShiftId";

/** Canonical production-compatible General Shift (09:30–18:30 IST, 540 expected minutes). */
export const CANONICAL_GENERAL_SHIFT_ID = "shift-morning-0930";
export const CANONICAL_GENERAL_SHIFT_CODE = "MORNING_0930";
export const CANONICAL_GENERAL_START_MINUTES = 570;
export const CANONICAL_GENERAL_END_MINUTES = 1110;
export const CANONICAL_GENERAL_EXPECTED_MINUTES = 540;

export async function getCompanyDefaultShiftId(): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: ATTENDANCE_DEFAULT_SHIFT_SETTING_KEY },
  });
  const id = row?.value?.trim();
  return id || null;
}

export async function setCompanyDefaultShiftId(
  shiftId: string,
  updatedById?: string,
): Promise<string> {
  await prisma.systemSetting.upsert({
    where: { key: ATTENDANCE_DEFAULT_SHIFT_SETTING_KEY },
    create: {
      key: ATTENDANCE_DEFAULT_SHIFT_SETTING_KEY,
      value: shiftId,
      updatedById: updatedById ?? null,
    },
    update: {
      value: shiftId,
      updatedById: updatedById ?? null,
    },
  });
  return shiftId;
}

/**
 * Ensures the configured company default points at a valid active shift.
 * Reuses shift-morning-0930 when timing matches; does not mutate referenced schedule timing.
 */
export async function ensureCompanyDefaultShiftConfigured(updatedById?: string): Promise<{
  shiftId: string;
  name: string;
  expectedWorkMinutes: number;
  created: boolean;
}> {
  const existingId = await getCompanyDefaultShiftId();
  if (existingId) {
    const existing = await prisma.shiftDefinition.findUnique({
      where: { shiftId: existingId },
      include: { segments: { orderBy: { sequence: "asc" } } },
    });
    if (existing?.active && (existing.segments?.length ?? 0) > 0) {
      return {
        shiftId: existing.shiftId,
        name: existing.name,
        expectedWorkMinutes: existing.expectedWorkMinutes,
        created: false,
      };
    }
  }

  let canonical = await prisma.shiftDefinition.findUnique({
    where: { shiftId: CANONICAL_GENERAL_SHIFT_ID },
    include: { segments: { orderBy: { sequence: "asc" } } },
  });

  if (
    canonical &&
    canonical.startMinutes === CANONICAL_GENERAL_START_MINUTES &&
    canonical.endMinutes === CANONICAL_GENERAL_END_MINUTES
  ) {
    if (canonical.name !== "General Shift") {
      // Display rename only — times/segments unchanged (historically safe).
      const conflict = await prisma.shiftDefinition.findFirst({
        where: { name: "General Shift", NOT: { shiftId: canonical.shiftId } },
      });
      if (conflict) {
        await prisma.shiftDefinition.update({
          where: { shiftId: conflict.shiftId },
          data: {
            name:
              conflict.code === "GENERAL_0900_1800"
                ? "Day Shift 09:00–18:00"
                : `${conflict.name} (legacy)`,
          },
        });
      }
      canonical = await prisma.shiftDefinition.update({
        where: { shiftId: canonical.shiftId },
        data: {
          name: "General Shift",
          expectedWorkMinutes: CANONICAL_GENERAL_EXPECTED_MINUTES,
          timezone: "Asia/Kolkata",
        },
        include: { segments: { orderBy: { sequence: "asc" } } },
      });
    }
    if (!canonical.segments.length) {
      await prisma.shiftSegment.create({
        data: {
          shiftId: canonical.shiftId,
          sequence: 1,
          startMinute: CANONICAL_GENERAL_START_MINUTES,
          endMinute: CANONICAL_GENERAL_END_MINUTES,
          endDayOffset: 0,
        },
      });
      canonical = await prisma.shiftDefinition.findUniqueOrThrow({
        where: { shiftId: canonical.shiftId },
        include: { segments: { orderBy: { sequence: "asc" } } },
      });
    }
    await setCompanyDefaultShiftId(canonical.shiftId, updatedById);
    return {
      shiftId: canonical.shiftId,
      name: canonical.name,
      expectedWorkMinutes: canonical.expectedWorkMinutes || CANONICAL_GENERAL_EXPECTED_MINUTES,
      created: false,
    };
  }

  // Timing mismatch or missing — create a new canonical General Shift without mutating history.
  const created = await prisma.shiftDefinition.create({
    data: {
      name: "General Shift",
      code: "GENERAL_0930_1830",
      shiftType: "DAY",
      startMinutes: CANONICAL_GENERAL_START_MINUTES,
      endMinutes: CANONICAL_GENERAL_END_MINUTES,
      timezone: "Asia/Kolkata",
      graceInMinutes: 30,
      graceOutMinutes: 0,
      expectedWorkMinutes: CANONICAL_GENERAL_EXPECTED_MINUTES,
      active: true,
      segments: {
        create: [
          {
            sequence: 1,
            startMinute: CANONICAL_GENERAL_START_MINUTES,
            endMinute: CANONICAL_GENERAL_END_MINUTES,
            endDayOffset: 0,
          },
        ],
      },
    },
  });
  await setCompanyDefaultShiftId(created.shiftId, updatedById);
  return {
    shiftId: created.shiftId,
    name: created.name,
    expectedWorkMinutes: CANONICAL_GENERAL_EXPECTED_MINUTES,
    created: true,
  };
}
