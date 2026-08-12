import { prisma } from "./prisma.js";
import { hashPassword, verifyPassword } from "./security.js";
import { HttpError } from "./errors.js";

export const SUPPORT_PASSWORD_SETTING_KEY = "company_support_password";
/** Legacy key (hash-only). Migrated / rejected on read after expiry rules. */
export const SUPPORT_PASSWORD_LEGACY_HASH_KEY = "company_support_password_hash";

const MIN_TTL_HOURS = 1;
const MAX_TTL_HOURS = 24;
const DEFAULT_TTL_HOURS = 4;

type SupportPasswordRecord = {
  hash: string;
  expiresAt: string;
  updatedById: string;
};

function parseRecord(raw: string | null | undefined): SupportPasswordRecord | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as SupportPasswordRecord;
      if (!parsed.hash || !parsed.expiresAt) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  // Legacy plaintext bcrypt hash without TTL — treat as expired (must be re-set).
  return null;
}

export async function getSupportPasswordStatus() {
  const row = await prisma.systemSetting.findUnique({
    where: { key: SUPPORT_PASSWORD_SETTING_KEY },
    select: { value: true, updatedAt: true },
  });
  const record = parseRecord(row?.value);
  if (!record) {
    return { enabled: false as const, updatedAt: null, expiresAt: null };
  }
  const expiresAt = new Date(record.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    await clearSupportPassword(record.updatedById).catch(() => undefined);
    return { enabled: false as const, updatedAt: null, expiresAt: null };
  }
  return {
    enabled: true as const,
    updatedAt: row!.updatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function setSupportPassword(
  password: string,
  updatedById: string,
  ttlHours = DEFAULT_TTL_HOURS,
) {
  const hours = Math.min(MAX_TTL_HOURS, Math.max(MIN_TTL_HOURS, Math.floor(ttlHours)));
  const passwordHash = await hashPassword(password);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const value = JSON.stringify({
    hash: passwordHash,
    expiresAt,
    updatedById,
  } satisfies SupportPasswordRecord);
  await prisma.systemSetting.upsert({
    where: { key: SUPPORT_PASSWORD_SETTING_KEY },
    create: {
      key: SUPPORT_PASSWORD_SETTING_KEY,
      value,
      updatedById,
    },
    update: {
      value,
      updatedById,
    },
  });
  // Remove legacy key if present.
  await prisma.systemSetting.deleteMany({ where: { key: SUPPORT_PASSWORD_LEGACY_HASH_KEY } });
  return getSupportPasswordStatus();
}

export async function clearSupportPassword(updatedById: string) {
  await prisma.systemSetting.deleteMany({
    where: {
      key: { in: [SUPPORT_PASSWORD_SETTING_KEY, SUPPORT_PASSWORD_LEGACY_HASH_KEY] },
    },
  });
  void updatedById;
  return { enabled: false as const, updatedAt: null, expiresAt: null };
}

export async function verifySupportPassword(password: string) {
  const row = await prisma.systemSetting.findUnique({
    where: { key: SUPPORT_PASSWORD_SETTING_KEY },
    select: { value: true },
  });
  const record = parseRecord(row?.value);
  if (!record) return false;
  const expiresAt = new Date(record.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    await clearSupportPassword(record.updatedById).catch(() => undefined);
    return false;
  }
  return verifyPassword(password, record.hash);
}

export function assertSupportPasswordTtlHours(ttlHours: number | undefined) {
  if (ttlHours === undefined) return DEFAULT_TTL_HOURS;
  if (!Number.isFinite(ttlHours) || ttlHours < MIN_TTL_HOURS || ttlHours > MAX_TTL_HOURS) {
    throw new HttpError(
      400,
      `Support password TTL must be between ${MIN_TTL_HOURS} and ${MAX_TTL_HOURS} hours`,
    );
  }
  return Math.floor(ttlHours);
}

export { DEFAULT_TTL_HOURS, MIN_TTL_HOURS, MAX_TTL_HOURS };
