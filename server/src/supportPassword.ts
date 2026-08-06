import { prisma } from "./prisma.js";
import { hashPassword, verifyPassword } from "./security.js";

export const SUPPORT_PASSWORD_SETTING_KEY = "company_support_password_hash";

export async function getSupportPasswordStatus() {
  const row = await prisma.systemSetting.findUnique({
    where: { key: SUPPORT_PASSWORD_SETTING_KEY },
    select: { value: true, updatedAt: true },
  });
  const enabled = Boolean(row?.value?.trim());
  return {
    enabled,
    updatedAt: enabled ? row!.updatedAt.toISOString() : null,
  };
}

export async function getSupportPasswordHash() {
  const row = await prisma.systemSetting.findUnique({
    where: { key: SUPPORT_PASSWORD_SETTING_KEY },
    select: { value: true },
  });
  const hash = row?.value?.trim();
  return hash || null;
}

export async function setSupportPassword(password: string, updatedById: string) {
  const passwordHash = await hashPassword(password);
  await prisma.systemSetting.upsert({
    where: { key: SUPPORT_PASSWORD_SETTING_KEY },
    create: {
      key: SUPPORT_PASSWORD_SETTING_KEY,
      value: passwordHash,
      updatedById,
    },
    update: {
      value: passwordHash,
      updatedById,
    },
  });
  return getSupportPasswordStatus();
}

export async function clearSupportPassword(updatedById: string) {
  await prisma.systemSetting.deleteMany({
    where: { key: SUPPORT_PASSWORD_SETTING_KEY },
  });
  // Keep an audit trail row optional — delete is enough; touch nothing else.
  void updatedById;
  return { enabled: false as const, updatedAt: null };
}

export async function verifySupportPassword(password: string) {
  const hash = await getSupportPasswordHash();
  if (!hash) return false;
  return verifyPassword(password, hash);
}
