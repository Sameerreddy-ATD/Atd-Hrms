import { Prisma, type Branch, type PrismaClient } from "@prisma/client";
import { HttpError } from "./errors.js";
import { startOfUtcDay } from "./organizationStructure.js";
import {
  composeAddressLine,
  isWorkLocationType,
  parseIndiaStateInput,
  suggestLocationCode,
  type WorkLocationType,
  WORK_LOCATION_TYPE_LABELS,
} from "./workLocationCatalog.js";

type Tx = Prisma.TransactionClient | PrismaClient;

export const BASE_OFFICE_ASSIGNMENT = "BASE_OFFICE" as const;

export type WorkLocationInput = {
  name: string;
  code?: string;
  locationType?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  locality?: string | null;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  /** Legacy single address (still accepted from old clients). */
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  attendanceRadiusMeters?: number;
  timezone?: string;
  description?: string | null;
  sortOrder?: number;
  status?: string;
  /** Legacy; synced from locationType when omitted. */
  isHub?: boolean;
};

function normalizeCode(raw: string) {
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!code || code.length > 40) {
    throw new HttpError(400, "Location code must be 1–40 uppercase letters, numbers, or underscores");
  }
  if (!/^[A-Z0-9_]+$/.test(code)) {
    throw new HttpError(400, "Location code must be uppercase snake case");
  }
  return code;
}

function resolveLocationType(input: WorkLocationInput): WorkLocationType {
  if (input.locationType) {
    const upper = input.locationType.trim().toUpperCase();
    if (!isWorkLocationType(upper)) {
      throw new HttpError(400, "Invalid location type");
    }
    return upper;
  }
  if (input.isHub === true) return "PARKING_HUB";
  return "BRANCH";
}

function validateCoords(lat: number | null | undefined, lng: number | null | undefined) {
  if (lat == null && lng == null) return { latitude: null, longitude: null };
  if (lat == null || lng == null) {
    throw new HttpError(400, "Latitude and longitude must both be provided");
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new HttpError(400, "Enter a valid latitude between -90 and 90.");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new HttpError(400, "Enter a valid longitude between -180 and 180.");
  }
  return { latitude: lat, longitude: lng };
}

function validateRadius(meters: number | undefined, fallback = 250) {
  const value = meters ?? fallback;
  if (!Number.isInteger(value) || value < 25 || value > 5000) {
    throw new HttpError(400, "Enter a valid attendance radius.");
  }
  return value;
}

function validatePostalCode(country: string, postalCode: string | undefined) {
  if (!postalCode?.trim()) {
    throw new HttpError(400, "Enter a valid 6-digit PIN code.");
  }
  const pin = postalCode.trim();
  if (country === "India" || country === "IN") {
    if (!/^\d{6}$/.test(pin)) {
      throw new HttpError(400, "Enter a valid 6-digit PIN code.");
    }
  }
  return pin;
}

export function workLocationDto(
  branch: Branch,
  extras?: { employeeCount?: number },
) {
  const locationType = isWorkLocationType(branch.locationType)
    ? branch.locationType
    : branch.isHub
      ? "PARKING_HUB"
      : "BRANCH";
  return {
    id: branch.branchId,
    locationCode: branch.branchCode,
    code: branch.branchCode,
    name: branch.branchName,
    locationType,
    locationTypeLabel: WORK_LOCATION_TYPE_LABELS[locationType as WorkLocationType] ?? locationType,
    address: branch.address,
    addressLine1: branch.addressLine1 ?? undefined,
    addressLine2: branch.addressLine2 ?? undefined,
    locality: branch.locality ?? undefined,
    city: branch.city ?? undefined,
    state: branch.state ?? undefined,
    postalCode: branch.postalCode ?? undefined,
    country: branch.country,
    latitude: branch.latitude == null ? undefined : Number(branch.latitude),
    longitude: branch.longitude == null ? undefined : Number(branch.longitude),
    attendanceRadiusMeters: branch.attendanceRadiusMeters,
    timezone: branch.timezone,
    description: branch.description ?? undefined,
    sortOrder: branch.sortOrder,
    status: branch.status,
    active: branch.status === "ACTIVE",
    isHub: Boolean(branch.isHub) || locationType === "PARKING_HUB",
    employeeCount: extras?.employeeCount,
  };
}

export async function createWorkLocation(tx: Tx, input: WorkLocationInput) {
  const name = input.name?.trim();
  if (!name) throw new HttpError(400, "Location name is required");

  const locationType = resolveLocationType(input);
  const code = normalizeCode(input.code?.trim() || suggestLocationCode(name));
  const country = (input.country?.trim() || "India").slice(0, 80);
  const addressLine1 = (input.addressLine1 ?? input.address)?.trim();
  if (!addressLine1) throw new HttpError(400, "Address Line 1 is required");
  const city = input.city?.trim();
  if (!city) throw new HttpError(400, "City is required");
  const stateRaw = input.state?.trim();
  if (!stateRaw) throw new HttpError(400, "State is required");
  const state = parseIndiaStateInput(stateRaw);
  if (!state) throw new HttpError(400, "State must be a valid Indian state or union territory");
  const postalCode = validatePostalCode(country, input.postalCode);
  const coords = validateCoords(input.latitude, input.longitude);
  const radius = validateRadius(input.attendanceRadiusMeters);
  const address = composeAddressLine({
    addressLine1,
    addressLine2: input.addressLine2,
    locality: input.locality,
    city,
    state,
    postalCode,
    country,
  });

  try {
    return await tx.branch.create({
      data: {
        branchName: name,
        branchCode: code,
        address,
        addressLine1,
        addressLine2: input.addressLine2?.trim() || null,
        locality: input.locality?.trim() || null,
        city,
        state,
        postalCode,
        country,
        locationType,
        status: input.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
        latitude: coords.latitude,
        longitude: coords.longitude,
        attendanceRadiusMeters: radius,
        timezone: input.timezone?.trim() || "Asia/Kolkata",
        description: input.description?.trim() || null,
        sortOrder: input.sortOrder ?? 0,
        isHub: locationType === "PARKING_HUB",
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "A location with this code already exists.");
    }
    throw error;
  }
}

export async function updateWorkLocation(tx: Tx, id: string, input: WorkLocationInput) {
  const existing = await tx.branch.findUnique({ where: { branchId: id } });
  if (!existing || existing.status === "DELETED") {
    throw new HttpError(404, "Work location not found");
  }

  const name = input.name !== undefined ? input.name.trim() : existing.branchName;
  if (!name) throw new HttpError(400, "Location name is required");

  let locationType = existing.locationType;
  if (input.locationType !== undefined || input.isHub !== undefined) {
    locationType = resolveLocationType({
      name,
      locationType: input.locationType ?? existing.locationType,
      isHub: input.isHub,
    });
  }

  let code = existing.branchCode;
  if (input.code !== undefined && input.code.trim() && input.code.trim() !== existing.branchCode) {
    code = normalizeCode(input.code);
  }

  const country = (input.country ?? existing.country ?? "India").trim() || "India";
  const addressLine1 = (
    input.addressLine1 ??
    existing.addressLine1 ??
    input.address ??
    existing.address
  )?.trim();
  if (!addressLine1) throw new HttpError(400, "Address Line 1 is required");
  const city = (input.city ?? existing.city ?? "").trim();
  if (!city) throw new HttpError(400, "City is required");
  const stateInput = input.state ?? existing.state ?? "";
  const state = parseIndiaStateInput(stateInput);
  if (!state) throw new HttpError(400, "State must be a valid Indian state or union territory");
  const postalCode = validatePostalCode(
    country,
    input.postalCode ?? existing.postalCode ?? undefined,
  );
  const coords = validateCoords(
    input.latitude !== undefined
      ? input.latitude
      : existing.latitude == null
        ? null
        : Number(existing.latitude),
    input.longitude !== undefined
      ? input.longitude
      : existing.longitude == null
        ? null
        : Number(existing.longitude),
  );
  const radius = validateRadius(
    input.attendanceRadiusMeters ?? existing.attendanceRadiusMeters,
    existing.attendanceRadiusMeters,
  );
  const address = composeAddressLine({
    addressLine1,
    addressLine2: input.addressLine2 !== undefined ? input.addressLine2 : existing.addressLine2,
    locality: input.locality !== undefined ? input.locality : existing.locality,
    city,
    state,
    postalCode,
    country,
  });

  try {
    return await tx.branch.update({
      where: { branchId: id },
      data: {
        branchName: name,
        branchCode: code,
        address,
        addressLine1,
        addressLine2:
          input.addressLine2 !== undefined
            ? input.addressLine2?.trim() || null
            : existing.addressLine2,
        locality:
          input.locality !== undefined ? input.locality?.trim() || null : existing.locality,
        city,
        state,
        postalCode,
        country,
        locationType,
        latitude: coords.latitude,
        longitude: coords.longitude,
        attendanceRadiusMeters: radius,
        timezone: input.timezone?.trim() || existing.timezone || "Asia/Kolkata",
        description:
          input.description !== undefined
            ? input.description?.trim() || null
            : existing.description,
        sortOrder: input.sortOrder ?? existing.sortOrder,
        isHub: locationType === "PARKING_HUB",
        ...(input.status
          ? { status: input.status === "INACTIVE" ? "INACTIVE" : input.status }
          : {}),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "A location with this code already exists.");
    }
    throw error;
  }
}

export async function deactivateWorkLocation(tx: Tx, id: string) {
  const existing = await tx.branch.findUnique({ where: { branchId: id } });
  if (!existing || existing.status === "DELETED") {
    throw new HttpError(404, "Work location not found");
  }
  return tx.branch.update({
    where: { branchId: id },
    data: { status: "INACTIVE", isHub: existing.locationType === "PARKING_HUB" },
  });
}

export async function reactivateWorkLocation(tx: Tx, id: string) {
  const existing = await tx.branch.findUnique({ where: { branchId: id } });
  if (!existing || existing.status === "DELETED") {
    throw new HttpError(404, "Work location not found");
  }
  return tx.branch.update({
    where: { branchId: id },
    data: { status: "ACTIVE" },
  });
}

export function isAssignmentActive(
  effectiveFrom: Date,
  effectiveTo: Date | null,
  asOf: Date = startOfUtcDay(new Date()),
) {
  const from = startOfUtcDay(effectiveFrom);
  const day = startOfUtcDay(asOf);
  if (day < from) return false;
  if (effectiveTo && day >= startOfUtcDay(effectiveTo)) return false;
  return true;
}

export async function getActiveBaseOfficeAssignment(
  tx: Tx,
  employeeId: string,
  asOf: Date = startOfUtcDay(new Date()),
) {
  const rows = await tx.employeeWorkLocationAssignment.findMany({
    where: { employeeId, assignmentType: BASE_OFFICE_ASSIGNMENT, isPrimary: true },
    include: { location: true },
    orderBy: { effectiveFrom: "desc" },
  });
  return rows.find((row) => isAssignmentActive(row.effectiveFrom, row.effectiveTo, asOf)) ?? null;
}

/**
 * Transfer Base Office. Rejects future effective dates in Module 2 (policy B).
 * Does not change Organization Unit or User.role.
 */
export async function transferBaseOffice(
  tx: Tx,
  params: {
    employeeId: string;
    toLocationId: string;
    effectiveFrom: Date;
    reason?: string | null;
    changedByUserId?: string | null;
  },
) {
  const effectiveFrom = startOfUtcDay(params.effectiveFrom);
  const today = startOfUtcDay(new Date());
  if (effectiveFrom.getTime() > today.getTime()) {
    throw new HttpError(
      400,
      "Future Base Office effective dates are not supported in Module 2. Use today's date or earlier.",
    );
  }

  const employee = await tx.employee.findUnique({ where: { employeeId: params.employeeId } });
  if (!employee) throw new HttpError(404, "Employee not found");

  const location = await tx.branch.findUnique({ where: { branchId: params.toLocationId } });
  if (!location || location.status === "DELETED") {
    throw new HttpError(404, "Work location not found");
  }
  if (location.status !== "ACTIVE") {
    throw new HttpError(
      400,
      "This location is inactive and cannot be assigned as a Base Office.",
    );
  }

  const open = await tx.employeeWorkLocationAssignment.findMany({
    where: {
      employeeId: params.employeeId,
      assignmentType: BASE_OFFICE_ASSIGNMENT,
      isPrimary: true,
      effectiveTo: null,
    },
  });
  for (const row of open) {
    // Allow same-day reassignment (close previous with effectiveTo = effectiveFrom).
    // Reject only when an open row starts *after* the requested effective date.
    if (startOfUtcDay(row.effectiveFrom).getTime() > effectiveFrom.getTime()) {
      throw new HttpError(409, "An overlapping Base Office assignment already exists");
    }
    await tx.employeeWorkLocationAssignment.update({
      where: { id: row.id },
      data: { effectiveTo: effectiveFrom },
    });
  }

  const created = await tx.employeeWorkLocationAssignment.create({
    data: {
      employeeId: params.employeeId,
      locationId: params.toLocationId,
      assignmentType: BASE_OFFICE_ASSIGNMENT,
      isPrimary: true,
      effectiveFrom,
      effectiveTo: null,
      changedByUserId: params.changedByUserId ?? null,
      reason: params.reason?.trim() || null,
    },
    include: { location: true },
  });

  await tx.employee.update({
    where: { employeeId: params.employeeId },
    data: { homeBranchId: params.toLocationId },
  });

  return created;
}

/** Seed open BASE_OFFICE history when an employee first gets a homeBranchId. */
export async function ensureInitialBaseOfficeAssignment(
  tx: Tx,
  params: {
    employeeId: string;
    locationId: string;
    effectiveFrom?: Date;
    changedByUserId?: string | null;
    reason?: string | null;
  },
) {
  const location = await tx.branch.findUnique({ where: { branchId: params.locationId } });
  if (!location || location.status === "DELETED") {
    throw new HttpError(404, "Work location not found");
  }
  if (location.status !== "ACTIVE") {
    throw new HttpError(
      400,
      "This location is inactive and cannot be assigned as a Base Office.",
    );
  }
  const existing = await tx.employeeWorkLocationAssignment.findFirst({
    where: {
      employeeId: params.employeeId,
      assignmentType: BASE_OFFICE_ASSIGNMENT,
      isPrimary: true,
      effectiveTo: null,
    },
  });
  if (existing) return existing;
  return tx.employeeWorkLocationAssignment.create({
    data: {
      employeeId: params.employeeId,
      locationId: params.locationId,
      assignmentType: BASE_OFFICE_ASSIGNMENT,
      isPrimary: true,
      effectiveFrom: startOfUtcDay(params.effectiveFrom ?? new Date()),
      effectiveTo: null,
      changedByUserId: params.changedByUserId ?? null,
      reason: params.reason?.trim() || "Initial Base Office assignment",
    },
  });
}

/**
 * Keep Employee.homeBranchId and Base Office history aligned when a PATCH
 * changes homeBranchId (Developer Admin employee edit).
 */
export async function syncBaseOfficeFromHomeBranchPatch(
  tx: Tx,
  params: {
    employeeId: string;
    previousHomeBranchId: string | null | undefined;
    nextHomeBranchId: string | null | undefined;
    changedByUserId?: string | null;
  },
) {
  const prev = params.previousHomeBranchId ?? null;
  const next = params.nextHomeBranchId ?? null;
  if (prev === next) return null;
  if (!next) {
    const open = await tx.employeeWorkLocationAssignment.findMany({
      where: {
        employeeId: params.employeeId,
        assignmentType: BASE_OFFICE_ASSIGNMENT,
        isPrimary: true,
        effectiveTo: null,
      },
    });
    const today = startOfUtcDay(new Date());
    for (const row of open) {
      await tx.employeeWorkLocationAssignment.update({
        where: { id: row.id },
        data: { effectiveTo: today },
      });
    }
    return null;
  }
  if (!prev) {
    return ensureInitialBaseOfficeAssignment(tx, {
      employeeId: params.employeeId,
      locationId: next,
      changedByUserId: params.changedByUserId,
    });
  }
  return transferBaseOffice(tx, {
    employeeId: params.employeeId,
    toLocationId: next,
    effectiveFrom: new Date(),
    reason: "Base Office changed via employee profile",
    changedByUserId: params.changedByUserId,
  });
}
