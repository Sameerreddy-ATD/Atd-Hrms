import { z } from "zod";
import { prisma } from "./prisma.js";

export const PROFILE_SELF_EDIT_SETTING_KEY = "employee_profile_self_edit";

/** Fields employees may be allowed to edit on My Profile when the toggle is on. */
export const PROFILE_SELF_EDIT_FIELD_KEYS = [
  "name",
  "phone",
  "companyPhone",
  "dateOfBirth",
  "bloodGroup",
  "bankAccountHolderName",
  "bankAccountNumber",
  "bankIfscCode",
  "panNumber",
  "aadhaarNumber",
  "uanNumber",
  "emergencyContact",
] as const;

export type ProfileSelfEditFieldKey = (typeof PROFILE_SELF_EDIT_FIELD_KEYS)[number];

export const PROFILE_SELF_EDIT_FIELD_META: {
  key: ProfileSelfEditFieldKey;
  label: string;
  group: string;
}[] = [
  { key: "name", label: "Full name", group: "Identity and contact" },
  { key: "phone", label: "Personal phone", group: "Identity and contact" },
  { key: "companyPhone", label: "Company phone", group: "Identity and contact" },
  { key: "dateOfBirth", label: "Date of birth", group: "Identity and contact" },
  { key: "bloodGroup", label: "Blood group", group: "Identity and contact" },
  { key: "bankAccountHolderName", label: "Account holder name", group: "Banking" },
  { key: "bankAccountNumber", label: "Bank account number", group: "Banking" },
  { key: "bankIfscCode", label: "IFSC code", group: "Banking" },
  { key: "panNumber", label: "PAN", group: "Statutory" },
  { key: "aadhaarNumber", label: "Aadhaar", group: "Statutory" },
  { key: "uanNumber", label: "UAN", group: "Statutory" },
  { key: "emergencyContact", label: "Emergency contact", group: "Emergency" },
];

const DEFAULT_ALLOWED: ProfileSelfEditFieldKey[] = ["phone", "emergencyContact"];

export const profileSelfEditPolicySchema = z.object({
  enabled: z.boolean(),
  allowedFields: z.array(z.enum(PROFILE_SELF_EDIT_FIELD_KEYS)).default([]),
});

export type ProfileSelfEditPolicy = z.infer<typeof profileSelfEditPolicySchema>;

export const defaultProfileSelfEditPolicy = (): ProfileSelfEditPolicy => ({
  enabled: false,
  allowedFields: [...DEFAULT_ALLOWED],
});

export async function readProfileSelfEditPolicy(): Promise<ProfileSelfEditPolicy> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: PROFILE_SELF_EDIT_SETTING_KEY },
  });
  if (!row) return defaultProfileSelfEditPolicy();
  try {
    const parsed = profileSelfEditPolicySchema.parse(JSON.parse(row.value));
    const allowedFields = parsed.allowedFields.filter((key, index, list) => list.indexOf(key) === index);
    return { enabled: parsed.enabled, allowedFields };
  } catch {
    return defaultProfileSelfEditPolicy();
  }
}

export async function saveProfileSelfEditPolicy(
  value: unknown,
  updatedById: string,
): Promise<ProfileSelfEditPolicy> {
  const parsed = profileSelfEditPolicySchema.parse(value);
  const allowedFields = parsed.allowedFields.filter((key, index, list) => list.indexOf(key) === index);
  if (parsed.enabled && allowedFields.length === 0) {
    throw new Error("Select at least one field before enabling employee profile editing");
  }
  const policy: ProfileSelfEditPolicy = {
    enabled: parsed.enabled,
    allowedFields,
  };
  await prisma.systemSetting.upsert({
    where: { key: PROFILE_SELF_EDIT_SETTING_KEY },
    create: {
      key: PROFILE_SELF_EDIT_SETTING_KEY,
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

export function profileSelfEditPolicyDto(policy: ProfileSelfEditPolicy) {
  return {
    enabled: policy.enabled,
    allowedFields: policy.allowedFields,
    availableFields: PROFILE_SELF_EDIT_FIELD_META,
  };
}

/** Employee-record keys that may appear on PATCH /employees/:id for self-edit. */
export const PROFILE_SELF_EDIT_EMPLOYEE_PATCH_KEYS = PROFILE_SELF_EDIT_FIELD_KEYS.filter(
  (key) => key !== "emergencyContact",
) as Exclude<ProfileSelfEditFieldKey, "emergencyContact">[];
