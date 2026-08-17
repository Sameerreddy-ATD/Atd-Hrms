/**
 * Phone login helpers.
 *
 * Sign-in accepts either a work email or a mobile number. Accounts created with
 * only a phone still need a unique User.email column, so those rows store a
 * non-routable placeholder that is never shown as a real mailbox.
 */

export const PHONE_PLACEHOLDER_EMAIL_DOMAIN = "phone.atd.local";

export function normalizePhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function isEmailIdentifier(value: string) {
  return value.includes("@");
}

export function isPhoneIdentifier(value: string) {
  const digits = normalizePhoneDigits(value);
  return digits.length >= 10 && digits.length <= 15;
}

export function isPhonePlaceholderEmail(email: string | null | undefined) {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${PHONE_PLACEHOLDER_EMAIL_DOMAIN}`);
}

export function phonePlaceholderEmail(digits: string) {
  return `m${normalizePhoneDigits(digits)}@${PHONE_PLACEHOLDER_EMAIL_DOMAIN}`;
}

/** Forms used when looking up an already-saved phone that may not be normalised. */
export function phoneLookupVariants(raw: string): string[] {
  const digits = normalizePhoneDigits(raw);
  if (!digits) return [];
  return Array.from(
    new Set([digits, `+91${digits}`, `91${digits}`, `0${digits}`, `+${digits}`]),
  );
}
