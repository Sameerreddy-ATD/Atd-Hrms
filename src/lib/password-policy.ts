/** Shared password rules — keep aligned with server/src/passwordPolicy.ts and schemas.ts */

export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_RULES = {
  minLength: PASSWORD_MIN_LENGTH,
  requiresUppercase: true,
  requiresNumber: true,
} as const;

export type PasswordRuleCheck = { label: string; ok: boolean };

export function passwordMeetsPolicy(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export function passwordPolicyChecks(
  password: string,
  labels: {
    minLength: string;
    uppercase: string;
    number: string;
  },
): PasswordRuleCheck[] {
  return [
    { label: labels.minLength, ok: password.length >= PASSWORD_MIN_LENGTH },
    { label: labels.uppercase, ok: /[A-Z]/.test(password) },
    { label: labels.number, ok: /[0-9]/.test(password) },
  ];
}

export function passwordPolicyError(): string {
  return "Password must be at least 10 characters with an uppercase letter and a number";
}
