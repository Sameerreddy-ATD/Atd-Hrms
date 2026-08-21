/**
 * Shift Template + Segment + Roster + Day Override foundation.
 * Canonical resolver: DAY_OVERRIDE > ROSTER > DEFAULT > NONE
 *
 * Does not change attendance punch / midnight heuristics (Attendance Workday later).
 */
import type { ShiftDefinition, ShiftSegment, ShiftType } from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "./errors.js";
import { startOfDayUtc } from "./attendanceDayRules.js";
import { audit } from "./audit.js";

export type SegmentInput = {
  sequence?: number;
  startMinute: number;
  endMinute: number;
  endDayOffset: 0 | 1;
};

export type ShiftTemplateInput = {
  name: string;
  code: string;
  description?: string | null;
  timezone?: string;
  graceInMinutes?: number;
  graceOutMinutes?: number;
  colorToken?: string | null;
  active?: boolean;
  segments: SegmentInput[];
};

export type ResolvedShiftSource = "DAY_OVERRIDE" | "ROSTER" | "DEFAULT" | "NONE";

export type ResolvedSegment = {
  sequence: number;
  startMinute: number;
  endMinute: number;
  endDayOffset: number;
  /** Absolute minutes from workDate local midnight. */
  absoluteStartMinute: number;
  absoluteEndMinute: number;
  crossesMidnight: boolean;
};

export type ResolvedEmployeeShift = {
  employeeId: string;
  workDate: string;
  source: ResolvedShiftSource;
  /** True when a roster/override row explicitly sets no shift (blocks DEFAULT fallback). */
  explicitNoShift: boolean;
  timezone: string;
  shiftTemplate: null | {
    id: string;
    code: string;
    name: string;
    active: boolean;
    shiftType: ShiftType;
    graceInMinutes: number;
    graceOutMinutes: number;
    expectedWorkMinutes: number;
  };
  segments: ResolvedSegment[];
  expectedWorkMinutes: number;
  firstSegmentStartMinute: number | null;
  finalSegmentEndMinute: number | null;
  finalSegmentEndDayOffset: number | null;
  crossesMidnight: boolean;
};

/** DEFAULT assignment date semantics: effectiveFrom inclusive, effectiveTo exclusive. */
export const DEFAULT_EFFECTIVE_TO_EXCLUSIVE = true;

const MAX_SEGMENT_MINUTES = 24 * 60;
const CODE_RE = /^[A-Z0-9_]+$/;

export function minutesToHm(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Duration of one segment in minutes. Gaps between segments are not counted. */
export function segmentDurationMinutes(seg: {
  startMinute: number;
  endMinute: number;
  endDayOffset: number;
}): number {
  if (seg.endDayOffset === 0) {
    return Math.max(0, seg.endMinute - seg.startMinute);
  }
  if (seg.endDayOffset === 1) {
    return Math.max(0, 1440 - seg.startMinute) + Math.max(0, seg.endMinute);
  }
  throw new HttpError(400, "Unsupported day offset (use 0 = same day, 1 = next day)");
}

export function expectedWorkMinutesFromSegments(
  segments: Array<{ startMinute: number; endMinute: number; endDayOffset: number }>,
): number {
  return segments.reduce((sum, seg) => sum + segmentDurationMinutes(seg), 0);
}

function segmentAbsoluteRange(seg: {
  sequence: number;
  startMinute: number;
  endMinute: number;
  endDayOffset: number;
}) {
  const start = seg.startMinute;
  const end = seg.endDayOffset * 1440 + seg.endMinute;
  return { sequence: seg.sequence, start, end };
}

export function validateSegments(raw: SegmentInput[]): SegmentInput[] {
  if (!raw.length) {
    throw new HttpError(400, "At least one work segment is required");
  }
  const normalized = raw.map((seg, index) => {
    const sequence = seg.sequence ?? index + 1;
    const startMinute = Number(seg.startMinute);
    const endMinute = Number(seg.endMinute);
    const endDayOffset = Number(seg.endDayOffset) as 0 | 1;
    if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) {
      throw new HttpError(400, `Invalid start time for segment ${sequence}`);
    }
    if (!Number.isInteger(endMinute) || endMinute < 0 || endMinute > 1439) {
      throw new HttpError(400, `Invalid end time for segment ${sequence}`);
    }
    if (endDayOffset !== 0 && endDayOffset !== 1) {
      throw new HttpError(400, "Ends must be Same Day (0) or Next Day (1)");
    }
    if (endDayOffset === 0 && endMinute <= startMinute) {
      throw new HttpError(
        400,
        `Segment ${sequence}: same-day end time must be after start time`,
      );
    }
    const absoluteStart = startMinute;
    const absoluteEnd = endDayOffset * 1440 + endMinute;
    const duration = absoluteEnd - absoluteStart;
    if (duration <= 0) {
      throw new HttpError(400, `Segment ${sequence} must have a positive duration`);
    }
    if (duration > MAX_SEGMENT_MINUTES) {
      throw new HttpError(
        400,
        `Segment ${sequence} cannot exceed 24 hours (got ${formatDuration(duration)})`,
      );
    }
    return { sequence, startMinute, endMinute, endDayOffset };
  });

  const sequences = new Set(normalized.map((s) => s.sequence));
  if (sequences.size !== normalized.length) {
    throw new HttpError(400, "Duplicate segment sequence");
  }

  const ordered = [...normalized].sort((a, b) => a.sequence - b.sequence);
  const renumbered = ordered.map((seg, i) => ({ ...seg, sequence: i + 1 }));

  const ranges = renumbered.map(segmentAbsoluteRange).sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  for (const range of ranges) {
    const key = `${range.start}:${range.end}`;
    if (seen.has(key)) {
      throw new HttpError(400, "Duplicate work segments are not allowed");
    }
    seen.add(key);
  }
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i]!.start < ranges[i - 1]!.end) {
      throw new HttpError(400, "Work segments overlap");
    }
  }
  const bySeq = [...renumbered].sort((a, b) => a.sequence - b.sequence);
  for (let i = 1; i < bySeq.length; i++) {
    const prev = segmentAbsoluteRange(bySeq[i - 1]!);
    const cur = segmentAbsoluteRange(bySeq[i]!);
    if (cur.start < prev.start) {
      throw new HttpError(400, "Segment order must follow chronological start times");
    }
  }

  return renumbered;
}

export function inferLegacyShiftType(
  segments: Array<{ startMinute: number; endMinute: number; endDayOffset: number }>,
): ShiftType {
  if (segments.some((s) => s.endDayOffset === 1)) return "NIGHT";
  return "DAY";
}

export function legacyWindowFromSegments(segments: SegmentInput[]): {
  startMinutes: number;
  endMinutes: number;
  shiftType: ShiftType;
} {
  const sorted = [...segments].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  return {
    startMinutes: first.startMinute,
    endMinutes: last.endMinute,
    shiftType: inferLegacyShiftType(sorted),
  };
}

function assertShiftCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!CODE_RE.test(normalized) || normalized.length < 2 || normalized.length > 40) {
    throw new HttpError(400, "Shift Code must be uppercase snake case (A-Z, 0-9, _)");
  }
  return normalized;
}

export function shiftTemplateDto(
  shift: ShiftDefinition & { segments?: ShiftSegment[]; _count?: { assignments?: number } },
) {
  const segments = [...(shift.segments ?? [])].sort((a, b) => a.sequence - b.sequence);
  return {
    id: shift.shiftId,
    name: shift.name,
    code: shift.code,
    description: shift.description,
    timezone: shift.timezone,
    graceInMinutes: shift.graceInMinutes,
    graceOutMinutes: shift.graceOutMinutes,
    expectedWorkMinutes: shift.expectedWorkMinutes,
    expectedWorkLabel: formatDuration(shift.expectedWorkMinutes),
    colorToken: shift.colorToken,
    active: shift.active,
    shiftType: shift.shiftType,
    startMinutes: shift.startMinutes,
    endMinutes: shift.endMinutes,
    segments: segments.map((s) => ({
      id: s.id,
      sequence: s.sequence,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      endDayOffset: s.endDayOffset,
      startLabel: minutesToHm(s.startMinute),
      endLabel: minutesToHm(s.endMinute),
      ends: s.endDayOffset === 0 ? "SAME_DAY" : "NEXT_DAY",
    })),
    assignedEmployees: shift._count?.assignments ?? undefined,
    createdAt: shift.createdAt,
    updatedAt: shift.updatedAt,
  };
}

function workDateIso(d: Date): string {
  return startOfDayUtc(d).toISOString().slice(0, 10);
}

async function writeAudit(action: string, performedByUserId: string | undefined, payload: unknown) {
  await audit({
    action,
    performedByUserId,
    newValue: payload as never,
  });
}

export async function listShiftTemplates(includeInactive = false) {
  const shifts = await prisma.shiftDefinition.findMany({
    where: includeInactive ? {} : { active: true },
    include: {
      segments: { orderBy: { sequence: "asc" } },
      _count: { select: { assignments: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return shifts.map(shiftTemplateDto);
}

export async function getShiftTemplate(shiftId: string) {
  const shift = await prisma.shiftDefinition.findUnique({
    where: { shiftId },
    include: {
      segments: { orderBy: { sequence: "asc" } },
      _count: { select: { assignments: true } },
    },
  });
  if (!shift) throw new HttpError(404, "Shift template not found");
  return shiftTemplateDto(shift);
}

export async function createShiftTemplate(input: ShiftTemplateInput, actorUserId?: string) {
  const code = assertShiftCode(input.code);
  const name = input.name.trim();
  if (name.length < 2) throw new HttpError(400, "Shift Name is required");
  const segments = validateSegments(input.segments);
  const expectedWorkMinutes = expectedWorkMinutesFromSegments(segments);
  const legacy = legacyWindowFromSegments(segments);
  const graceIn = input.graceInMinutes ?? 30;
  const graceOut = input.graceOutMinutes ?? 30;
  if (graceIn < 0 || graceIn > 240 || graceOut < 0 || graceOut > 240) {
    throw new HttpError(400, "Grace periods must be between 0 and 240 minutes");
  }

  const existing = await prisma.shiftDefinition.findFirst({
    where: { OR: [{ code }, { name }] },
  });
  if (existing?.code === code) throw new HttpError(409, "Shift Code already exists");
  if (existing?.name === name) throw new HttpError(409, "Shift Name already exists");

  const shift = await prisma.shiftDefinition.create({
    data: {
      name,
      code,
      description: input.description?.trim() || null,
      timezone: input.timezone?.trim() || "Asia/Kolkata",
      graceInMinutes: graceIn,
      graceOutMinutes: graceOut,
      expectedWorkMinutes,
      colorToken: input.colorToken ?? null,
      active: input.active ?? true,
      shiftType: legacy.shiftType,
      startMinutes: legacy.startMinutes,
      endMinutes: legacy.endMinutes,
      segments: {
        create: segments.map((s) => ({
          sequence: s.sequence!,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
          endDayOffset: s.endDayOffset,
        })),
      },
    },
    include: { segments: { orderBy: { sequence: "asc" } } },
  });

  await writeAudit("SHIFT_TEMPLATE_CREATED", actorUserId, shiftTemplateDto(shift));
  return shiftTemplateDto(shift);
}

export async function updateShiftTemplate(
  shiftId: string,
  input: Partial<ShiftTemplateInput> & { segments?: SegmentInput[] },
  actorUserId?: string,
) {
  const existing = await prisma.shiftDefinition.findUnique({
    where: { shiftId },
    include: { segments: true },
  });
  if (!existing) throw new HttpError(404, "Shift template not found");

  if (input.code != null && assertShiftCode(input.code) !== existing.code) {
    throw new HttpError(400, "Shift Code cannot be changed after creation");
  }

  const name = input.name?.trim() ?? existing.name;
  if (name.length < 2) throw new HttpError(400, "Shift Name is required");
  if (name !== existing.name) {
    const clash = await prisma.shiftDefinition.findFirst({ where: { name, NOT: { shiftId } } });
    if (clash) throw new HttpError(409, "Shift Name already exists");
  }

  const schedulingCriticalRequested =
    input.segments != null ||
    input.timezone != null ||
    input.graceInMinutes != null ||
    input.graceOutMinutes != null;

  const segments = input.segments ? validateSegments(input.segments) : null;

  if (schedulingCriticalRequested && (await shiftHasScheduleHistory(shiftId))) {
    const segmentsChanged = segments != null && !segmentsEqual(existing.segments, segments);
    const timezoneChanged =
      input.timezone != null && input.timezone.trim() !== existing.timezone;
    const graceChanged =
      (input.graceInMinutes != null && input.graceInMinutes !== existing.graceInMinutes) ||
      (input.graceOutMinutes != null && input.graceOutMinutes !== existing.graceOutMinutes);
    if (segmentsChanged || timezoneChanged || graceChanged) {
      throw new HttpError(
        409,
        "This shift is already used in schedule history. Duplicate it to revise times, timezone, or grace — historical meaning cannot change.",
      );
    }
  }

  // expectedWorkMinutes is always derived from segments — never client-supplied.
  const expectedWorkMinutes = segments
    ? expectedWorkMinutesFromSegments(segments)
    : existing.expectedWorkMinutes;
  const legacy = segments ? legacyWindowFromSegments(segments) : null;
  const graceIn = input.graceInMinutes ?? existing.graceInMinutes;
  const graceOut = input.graceOutMinutes ?? existing.graceOutMinutes;
  if (graceIn < 0 || graceIn > 240 || graceOut < 0 || graceOut > 240) {
    throw new HttpError(400, "Grace periods must be between 0 and 240 minutes");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (segments) {
      await tx.shiftSegment.deleteMany({ where: { shiftId } });
      await tx.shiftSegment.createMany({
        data: segments.map((s) => ({
          shiftId,
          sequence: s.sequence!,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
          endDayOffset: s.endDayOffset,
        })),
      });
    }
    return tx.shiftDefinition.update({
      where: { shiftId },
      data: {
        name,
        description:
          input.description !== undefined ? input.description?.trim() || null : undefined,
        timezone: input.timezone?.trim() || undefined,
        graceInMinutes: graceIn,
        graceOutMinutes: graceOut,
        expectedWorkMinutes,
        colorToken: input.colorToken !== undefined ? input.colorToken : undefined,
        active: input.active ?? undefined,
        ...(legacy
          ? {
              shiftType: legacy.shiftType,
              startMinutes: legacy.startMinutes,
              endMinutes: legacy.endMinutes,
            }
          : {}),
      },
      include: { segments: { orderBy: { sequence: "asc" } } },
    });
  });

  await writeAudit("SHIFT_TEMPLATE_UPDATED", actorUserId, {
    before: shiftTemplateDto(existing),
    after: shiftTemplateDto(updated),
  });
  return shiftTemplateDto(updated);
}

async function shiftHasScheduleHistory(shiftId: string): Promise<boolean> {
  const [assignments, rosters, overrides] = await Promise.all([
    prisma.employeeShiftAssignment.count({ where: { shiftId } }),
    prisma.rosterAssignment.count({ where: { shiftId } }),
    prisma.employeeShiftDayOverride.count({ where: { shiftId } }),
  ]);
  return assignments + rosters + overrides > 0;
}

function segmentsEqual(
  existing: ShiftSegment[],
  next: SegmentInput[],
): boolean {
  if (existing.length !== next.length) return false;
  const a = [...existing].sort((x, y) => x.sequence - y.sequence);
  const b = [...next].sort((x, y) => (x.sequence ?? 0) - (y.sequence ?? 0));
  return a.every(
    (seg, i) =>
      seg.startMinute === b[i]!.startMinute &&
      seg.endMinute === b[i]!.endMinute &&
      seg.endDayOffset === b[i]!.endDayOffset,
  );
}

/** Create a revised template when historical schedule meaning must stay immutable. */
export async function duplicateShiftTemplate(
  shiftId: string,
  input: { name: string; code: string } & Partial<ShiftTemplateInput>,
  actorUserId?: string,
) {
  const source = await prisma.shiftDefinition.findUnique({
    where: { shiftId },
    include: { segments: { orderBy: { sequence: "asc" } } },
  });
  if (!source) throw new HttpError(404, "Shift template not found");
  const segments =
    input.segments ??
    source.segments.map((s) => ({
      sequence: s.sequence,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      endDayOffset: s.endDayOffset as 0 | 1,
    }));
  const created = await createShiftTemplate(
    {
      name: input.name,
      code: input.code,
      description: input.description ?? source.description,
      timezone: input.timezone ?? source.timezone,
      graceInMinutes: input.graceInMinutes ?? source.graceInMinutes,
      graceOutMinutes: input.graceOutMinutes ?? source.graceOutMinutes,
      colorToken: input.colorToken ?? source.colorToken,
      active: input.active ?? true,
      segments,
    },
    actorUserId,
  );
  await writeAudit("SHIFT_TEMPLATE_DUPLICATED", actorUserId, {
    sourceShiftId: shiftId,
    newShiftId: created.id,
  });
  return created;
}

export async function setShiftTemplateActive(
  shiftId: string,
  active: boolean,
  actorUserId?: string,
) {
  const existing = await prisma.shiftDefinition.findUnique({ where: { shiftId } });
  if (!existing) throw new HttpError(404, "Shift template not found");
  const updated = await prisma.shiftDefinition.update({
    where: { shiftId },
    data: { active },
    include: { segments: { orderBy: { sequence: "asc" } } },
  });
  await writeAudit(
    active ? "SHIFT_TEMPLATE_REACTIVATED" : "SHIFT_TEMPLATE_DEACTIVATED",
    actorUserId,
    { shiftId, active },
  );
  return shiftTemplateDto(updated);
}

async function assertActiveShiftForNewAssignment(shiftId: string) {
  const shift = await prisma.shiftDefinition.findUnique({ where: { shiftId } });
  if (!shift) throw new HttpError(404, "Shift template not found");
  if (!shift.active) {
    throw new HttpError(400, "Inactive shifts cannot be newly assigned");
  }
  return shift;
}

export async function assignDefaultShift(params: {
  employeeId: string;
  shiftId: string;
  effectiveFrom: Date;
  reason?: string | null;
  actorUserId?: string;
  actorLabel?: string | null;
}) {
  const shift = await assertActiveShiftForNewAssignment(params.shiftId);
  const employee = await prisma.employee.findUnique({
    where: { employeeId: params.employeeId },
    select: {
      employeeId: true,
      departmentId: true,
      homeBranchId: true,
      designation: true,
    },
  });
  if (!employee) throw new HttpError(404, "Employee not found");

  const effectiveFrom = startOfDayUtc(params.effectiveFrom);

  const assignment = await prisma.$transaction(async (tx) => {
    // Close prior DEFAULT ranges that cover effectiveFrom (effectiveTo exclusive).
    await tx.employeeShiftAssignment.updateMany({
      where: {
        employeeId: params.employeeId,
        assignmentType: "DEFAULT",
        effectiveFrom: { lt: effectiveFrom },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }],
      },
      data: { effectiveTo: effectiveFrom },
    });
    // Remove future/same-start DEFAULT rows being superseded (history kept via closed rows only).
    await tx.employeeShiftAssignment.deleteMany({
      where: {
        employeeId: params.employeeId,
        assignmentType: "DEFAULT",
        effectiveFrom: { gte: effectiveFrom },
      },
    });
    return tx.employeeShiftAssignment.create({
      data: {
        employeeId: params.employeeId,
        shiftId: shift.shiftId,
        assignmentType: "DEFAULT",
        effectiveFrom,
        assignedBy: params.actorLabel ?? params.actorUserId ?? null,
        reason: params.reason?.trim() || null,
      },
      include: { shift: { include: { segments: true } } },
    });
  });

  await prisma.employee.update({
    where: { employeeId: params.employeeId },
    data: {
      shiftType: shift.shiftType,
      shiftStartMinutes: shift.startMinutes,
      shiftEndMinutes: shift.endMinutes,
    },
  });

  await writeAudit("DEFAULT_SHIFT_ASSIGNED", params.actorUserId, {
    employeeId: params.employeeId,
    shiftId: shift.shiftId,
    effectiveFrom: workDateIso(effectiveFrom),
    effectiveToExclusive: true,
    reason: params.reason,
    orgUnchanged: employee.departmentId,
    baseOfficeUnchanged: employee.homeBranchId,
    roleUnchanged: employee.designation,
  });

  return assignment;
}

export async function upsertRosterAssignment(params: {
  employeeId: string;
  workDate: Date;
  /** null = explicit NO_SHIFT for this roster date */
  shiftId: string | null;
  source?: "MANUAL" | "BULK" | "IMPORT";
  note?: string | null;
  actorUserId?: string;
}) {
  await prisma.employee.findUniqueOrThrow({ where: { employeeId: params.employeeId } });
  const workDate = startOfDayUtc(params.workDate);
  const noShift = params.shiftId == null;
  const shift = noShift ? null : await assertActiveShiftForNewAssignment(params.shiftId!);

  const row = await prisma.rosterAssignment.upsert({
    where: {
      employeeId_workDate: { employeeId: params.employeeId, workDate },
    },
    create: {
      employeeId: params.employeeId,
      workDate,
      shiftId: shift?.shiftId ?? null,
      shiftPreset: noShift ? "NO_SHIFT" : shift!.shiftType,
      startMinutes: shift?.startMinutes ?? null,
      endMinutes: shift?.endMinutes ?? null,
      source: params.source ?? "MANUAL",
      note: params.note ?? null,
      published: true,
      createdBy: params.actorUserId ?? null,
    },
    update: {
      shiftId: shift?.shiftId ?? null,
      shiftPreset: noShift ? "NO_SHIFT" : shift!.shiftType,
      startMinutes: shift?.startMinutes ?? null,
      endMinutes: shift?.endMinutes ?? null,
      source: params.source ?? "MANUAL",
      note: params.note ?? null,
      published: true,
    },
    include: { shift: { include: { segments: true } } },
  });
  await writeAudit(noShift ? "ROSTER_NO_SHIFT_SET" : "ROSTER_UPSERTED", params.actorUserId, {
    employeeId: params.employeeId,
    workDate: workDateIso(workDate),
    shiftId: shift?.shiftId ?? null,
    explicitNoShift: noShift,
  });
  return row;
}

export async function upsertDayOverride(params: {
  employeeId: string;
  workDate: Date;
  /** null = explicit NO_SHIFT (blocks roster/default fallback) */
  shiftId: string | null;
  reason?: string | null;
  actorUserId?: string;
}) {
  await prisma.employee.findUniqueOrThrow({ where: { employeeId: params.employeeId } });
  const workDate = startOfDayUtc(params.workDate);
  const noShift = params.shiftId == null;
  const shift = noShift ? null : await assertActiveShiftForNewAssignment(params.shiftId!);

  const row = await prisma.employeeShiftDayOverride.upsert({
    where: {
      employeeId_workDate: { employeeId: params.employeeId, workDate },
    },
    create: {
      employeeId: params.employeeId,
      workDate,
      shiftId: shift?.shiftId ?? null,
      reason: params.reason ?? null,
      createdBy: params.actorUserId ?? null,
    },
    update: {
      shiftId: shift?.shiftId ?? null,
      reason: params.reason ?? null,
      createdBy: params.actorUserId ?? null,
    },
    include: { shift: { include: { segments: true } } },
  });
  await writeAudit(
    noShift ? "DAY_OVERRIDE_NO_SHIFT_SET" : "DAY_OVERRIDE_UPSERTED",
    params.actorUserId,
    {
      employeeId: params.employeeId,
      workDate: workDateIso(workDate),
      shiftId: shift?.shiftId ?? null,
      explicitNoShift: noShift,
      reason: params.reason,
    },
  );
  return row;
}

export async function removeDayOverride(params: {
  employeeId: string;
  workDate: Date;
  actorUserId?: string;
}) {
  const workDate = startOfDayUtc(params.workDate);
  const existing = await prisma.employeeShiftDayOverride.findUnique({
    where: { employeeId_workDate: { employeeId: params.employeeId, workDate } },
  });
  if (!existing) throw new HttpError(404, "Day override not found");
  await prisma.employeeShiftDayOverride.delete({ where: { id: existing.id } });
  await writeAudit("DAY_OVERRIDE_REMOVED", params.actorUserId, {
    employeeId: params.employeeId,
    workDate: workDateIso(workDate),
    previousShiftId: existing.shiftId,
  });
}

/**
 * Canonical shift resolution for a Work Date.
 * Priority: DAY_OVERRIDE > ROSTER > DEFAULT > NONE
 * Explicit NO_SHIFT rows (override/roster with null shiftId) block fallback.
 * Does not auto-create defaults (unlike attendancePolicy.ensureEmployeeShiftAssignment).
 */
export async function resolveEmployeeShiftForWorkDate(
  employeeId: string,
  workDateInput: Date,
): Promise<ResolvedEmployeeShift> {
  const workDate = startOfDayUtc(workDateInput);
  const workDateStr = workDateIso(workDate);

  const override = await prisma.employeeShiftDayOverride.findUnique({
    where: { employeeId_workDate: { employeeId, workDate } },
    include: { shift: { include: { segments: { orderBy: { sequence: "asc" } } } } },
  });
  if (override) {
    if (override.shiftId == null || !override.shift) {
      return emptyResolved(employeeId, workDateStr, "DAY_OVERRIDE", true);
    }
    return toResolved(employeeId, workDateStr, "DAY_OVERRIDE", false, override.shift);
  }

  const roster = await prisma.rosterAssignment.findUnique({
    where: { employeeId_workDate: { employeeId, workDate } },
    include: { shift: { include: { segments: { orderBy: { sequence: "asc" } } } } },
  });
  if (roster) {
    if (roster.shiftId == null || !roster.shift) {
      return emptyResolved(employeeId, workDateStr, "ROSTER", true);
    }
    return toResolved(employeeId, workDateStr, "ROSTER", false, roster.shift);
  }

  // effectiveFrom inclusive, effectiveTo exclusive
  const assignment = await prisma.employeeShiftAssignment.findFirst({
    where: {
      employeeId,
      assignmentType: "DEFAULT",
      effectiveFrom: { lte: workDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: workDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
    include: { shift: { include: { segments: { orderBy: { sequence: "asc" } } } } },
  });
  if (assignment?.shift) {
    return toResolved(employeeId, workDateStr, "DEFAULT", false, assignment.shift);
  }

  return emptyResolved(employeeId, workDateStr, "NONE", false);
}

function mapResolvedSegments(
  segments: ShiftSegment[],
): ResolvedSegment[] {
  return [...segments]
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => {
      const absoluteStartMinute = s.startMinute;
      const absoluteEndMinute = s.endDayOffset * 1440 + s.endMinute;
      return {
        sequence: s.sequence,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        endDayOffset: s.endDayOffset,
        absoluteStartMinute,
        absoluteEndMinute,
        crossesMidnight: s.endDayOffset === 1,
      };
    });
}

function emptyResolved(
  employeeId: string,
  workDate: string,
  source: ResolvedShiftSource,
  explicitNoShift: boolean,
): ResolvedEmployeeShift {
  return {
    employeeId,
    workDate,
    source,
    explicitNoShift,
    timezone: "Asia/Kolkata",
    shiftTemplate: null,
    segments: [],
    expectedWorkMinutes: 0,
    firstSegmentStartMinute: null,
    finalSegmentEndMinute: null,
    finalSegmentEndDayOffset: null,
    crossesMidnight: false,
  };
}

function toResolved(
  employeeId: string,
  workDate: string,
  source: Exclude<ResolvedShiftSource, "NONE">,
  explicitNoShift: boolean,
  shift: ShiftDefinition & { segments: ShiftSegment[] },
): ResolvedEmployeeShift {
  const segments = mapResolvedSegments(shift.segments);
  const expectedWorkMinutes = expectedWorkMinutesFromSegments(segments);
  const first = segments[0] ?? null;
  const last = segments[segments.length - 1] ?? null;
  return {
    employeeId,
    workDate,
    source,
    explicitNoShift,
    timezone: shift.timezone || "Asia/Kolkata",
    shiftTemplate: {
      id: shift.shiftId,
      code: shift.code,
      name: shift.name,
      active: shift.active,
      shiftType: shift.shiftType,
      graceInMinutes: shift.graceInMinutes,
      graceOutMinutes: shift.graceOutMinutes,
      expectedWorkMinutes,
    },
    segments,
    expectedWorkMinutes,
    firstSegmentStartMinute: first?.startMinute ?? null,
    finalSegmentEndMinute: last?.endMinute ?? null,
    finalSegmentEndDayOffset: last?.endDayOffset ?? null,
    crossesMidnight: segments.some((s) => s.crossesMidnight),
  };
}

export async function listRosterWeek(params: {
  weekStart: Date;
  employeeIds?: string[];
  shiftId?: string;
  departmentId?: string;
  homeBranchId?: string;
}) {
  const start = startOfDayUtc(params.weekStart);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const employees = await prisma.employee.findMany({
    where: {
      status: "ACTIVE",
      ...(params.employeeIds?.length ? { employeeId: { in: params.employeeIds } } : {}),
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
      ...(params.homeBranchId ? { homeBranchId: params.homeBranchId } : {}),
    },
    select: {
      employeeId: true,
      name: true,
      employeeCode: true,
      departmentId: true,
      homeBranchId: true,
    },
    orderBy: [{ name: "asc" }],
    take: 200,
  });
  const ids = employees.map((e) => e.employeeId);
  const [rosters, overrides, defaults] = await Promise.all([
    prisma.rosterAssignment.findMany({
      where: {
        employeeId: { in: ids },
        workDate: { gte: start, lte: end },
        ...(params.shiftId ? { shiftId: params.shiftId } : {}),
      },
      include: { shift: true },
    }),
    prisma.employeeShiftDayOverride.findMany({
      where: { employeeId: { in: ids }, workDate: { gte: start, lte: end } },
      include: { shift: true },
    }),
    prisma.employeeShiftAssignment.findMany({
      where: {
        employeeId: { in: ids },
        assignmentType: "DEFAULT",
        effectiveFrom: { lte: end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
      },
      include: { shift: true },
      orderBy: { effectiveFrom: "desc" },
    }),
  ]);

  return {
    weekStart: workDateIso(start),
    weekEnd: workDateIso(end),
    employees: employees.map((emp) => {
      const days: Record<
        string,
        {
          source: ResolvedShiftSource;
          shiftId: string | null;
          shiftName: string | null;
          code: string | null;
          explicitNoShift: boolean;
        }
      > = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
        const key = workDateIso(d);
        const ov = overrides.find(
          (o) => o.employeeId === emp.employeeId && workDateIso(o.workDate) === key,
        );
        if (ov) {
          if (!ov.shiftId || !ov.shift) {
            days[key] = {
              source: "DAY_OVERRIDE",
              shiftId: null,
              shiftName: null,
              code: null,
              explicitNoShift: true,
            };
          } else {
            days[key] = {
              source: "DAY_OVERRIDE",
              shiftId: ov.shift.shiftId,
              shiftName: ov.shift.name,
              code: ov.shift.code,
              explicitNoShift: false,
            };
          }
          continue;
        }
        const ro = rosters.find(
          (r) => r.employeeId === emp.employeeId && workDateIso(r.workDate) === key,
        );
        if (ro) {
          if (!ro.shiftId || !ro.shift) {
            days[key] = {
              source: "ROSTER",
              shiftId: null,
              shiftName: null,
              code: null,
              explicitNoShift: true,
            };
          } else {
            days[key] = {
              source: "ROSTER",
              shiftId: ro.shift.shiftId,
              shiftName: ro.shift.name,
              code: ro.shift.code,
              explicitNoShift: false,
            };
          }
          continue;
        }
        const def = defaults.find(
          (a) =>
            a.employeeId === emp.employeeId &&
            a.effectiveFrom <= d &&
            (a.effectiveTo == null || a.effectiveTo > d),
        );
        if (def?.shift) {
          days[key] = {
            source: "DEFAULT",
            shiftId: def.shift.shiftId,
            shiftName: def.shift.name,
            code: def.shift.code,
            explicitNoShift: false,
          };
        } else {
          days[key] = {
            source: "NONE",
            shiftId: null,
            shiftName: null,
            code: null,
            explicitNoShift: false,
          };
        }
      }
      return {
        employeeId: emp.employeeId,
        name: emp.name,
        employeeCode: emp.employeeCode,
        days,
      };
    }),
  };
}

export const LIVE_LIKE_SHIFT_FIXTURES: ShiftTemplateInput[] = [
  {
    name: "General Shift",
    code: "GENERAL_0900_1800",
    segments: [{ startMinute: 540, endMinute: 1080, endDayOffset: 0 }],
  },
  {
    name: "Early Shift",
    code: "EARLY_0600_1500",
    segments: [{ startMinute: 360, endMinute: 900, endDayOffset: 0 }],
  },
  {
    name: "Evening Shift",
    code: "EVENING_1400_2300",
    segments: [{ startMinute: 840, endMinute: 1380, endDayOffset: 0 }],
  },
  {
    name: "Night Shift",
    code: "NIGHT_2200_0300",
    segments: [{ startMinute: 1320, endMinute: 180, endDayOffset: 1 }],
  },
  {
    name: "Split Operations Shift",
    code: "SPLIT_0913_1721",
    segments: [
      { startMinute: 540, endMinute: 780, endDayOffset: 0 },
      { startMinute: 1020, endMinute: 1260, endDayOffset: 0 },
    ],
  },
  {
    name: "Hybrid Split Night",
    code: "HYBRID_0910_2203",
    segments: [
      { startMinute: 540, endMinute: 600, endDayOffset: 0 },
      { startMinute: 1320, endMinute: 180, endDayOffset: 1 },
    ],
  },
];

export async function ensureLiveLikeShiftFixtures(actorUserId?: string) {
  const created = [];
  for (const fixture of LIVE_LIKE_SHIFT_FIXTURES) {
    const existing = await prisma.shiftDefinition.findUnique({ where: { code: fixture.code } });
    if (existing) {
      created.push(await getShiftTemplate(existing.shiftId));
      continue;
    }
    created.push(await createShiftTemplate(fixture, actorUserId));
  }
  return created;
}
