import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma.js";

export const PROFILE_VERIFICATION_SETTING_KEY = "employee_profile_verification";

/** Roles that may be targeted for profile verification prompts. */
export const PROFILE_VERIFICATION_TARGET_ROLES = [
  Role.EMPLOYEE,
  Role.SALES,
  Role.FIELD_STAFF,
  Role.MANAGER,
  Role.HR,
  Role.MAIN_ADMIN,
] as const;

export type ProfileVerificationTargetRole = (typeof PROFILE_VERIFICATION_TARGET_ROLES)[number];

/** Always skipped regardless of policy (executives / bowser pilots). */
export const PROFILE_VERIFICATION_ALWAYS_EXEMPT: Role[] = [
  Role.CEO,
  Role.CHIEF_OF_STAFF,
  Role.DRIVER,
  Role.DEVELOPER_ADMIN,
];

export const PROFILE_VERIFICATION_ROLE_META: {
  key: ProfileVerificationTargetRole;
  label: string;
}[] = [
  { key: Role.EMPLOYEE, label: "Team members" },
  { key: Role.SALES, label: "Sales" },
  { key: Role.FIELD_STAFF, label: "Field staff" },
  { key: Role.MANAGER, label: "Managers" },
  { key: Role.HR, label: "HR" },
  { key: Role.MAIN_ADMIN, label: "Main Admin" },
];

export const profileVerificationPolicySchema = z.object({
  enabled: z.boolean(),
  targetRoles: z.array(z.nativeEnum(Role)).default([]),
});

export type ProfileVerificationPolicy = z.infer<typeof profileVerificationPolicySchema>;

export const defaultProfileVerificationPolicy = (): ProfileVerificationPolicy => ({
  // Off for everyone until Developer Admin turns it on and picks roles.
  enabled: false,
  targetRoles: [
    Role.EMPLOYEE,
    Role.SALES,
    Role.FIELD_STAFF,
    Role.MANAGER,
    Role.HR,
  ],
});

function sanitizeTargetRoles(roles: Role[]): ProfileVerificationTargetRole[] {
  const allowed = new Set<string>(PROFILE_VERIFICATION_TARGET_ROLES);
  return roles.filter(
    (role, index, list): role is ProfileVerificationTargetRole =>
      allowed.has(role) && list.indexOf(role) === index,
  );
}

export async function readProfileVerificationPolicy(): Promise<ProfileVerificationPolicy> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: PROFILE_VERIFICATION_SETTING_KEY },
  });
  if (!row) return defaultProfileVerificationPolicy();
  try {
    const parsed = profileVerificationPolicySchema.parse(JSON.parse(row.value));
    return {
      enabled: parsed.enabled,
      targetRoles: sanitizeTargetRoles(parsed.targetRoles),
    };
  } catch {
    return defaultProfileVerificationPolicy();
  }
}

export async function saveProfileVerificationPolicy(
  value: unknown,
  updatedById: string,
): Promise<ProfileVerificationPolicy> {
  const parsed = profileVerificationPolicySchema.parse(value);
  const targetRoles = sanitizeTargetRoles(parsed.targetRoles);
  if (parsed.enabled && targetRoles.length === 0) {
    throw new Error("Select at least one role before enabling profile verification");
  }
  const policy: ProfileVerificationPolicy = {
    enabled: parsed.enabled,
    targetRoles,
  };
  await prisma.systemSetting.upsert({
    where: { key: PROFILE_VERIFICATION_SETTING_KEY },
    create: {
      key: PROFILE_VERIFICATION_SETTING_KEY,
      value: JSON.stringify(policy),
      updatedById,
    },
    update: {
      value: JSON.stringify(policy),
      updatedById,
    },
  });
  return policy;
}

export function profileVerificationPolicyDto(policy: ProfileVerificationPolicy) {
  return {
    enabled: policy.enabled,
    targetRoles: policy.targetRoles,
    availableRoles: PROFILE_VERIFICATION_ROLE_META,
  };
}

export function isProfileVerificationRequiredForRole(
  role: Role,
  profileVerified: boolean | undefined,
  policy: ProfileVerificationPolicy,
): boolean {
  if (!policy.enabled) return false;
  if (profileVerified) return false;
  if (PROFILE_VERIFICATION_ALWAYS_EXEMPT.includes(role)) return false;
  return policy.targetRoles.includes(role as ProfileVerificationTargetRole);
}
