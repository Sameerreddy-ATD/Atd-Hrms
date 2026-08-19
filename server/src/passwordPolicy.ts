/** Shared password rules — keep aligned with src/lib/password-policy.ts */

export const PASSWORD_MIN_LENGTH = 10;

export function passwordMeetsPolicy(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export function passwordPolicyError(): string {
  return "Password must be at least 10 characters with an uppercase letter and a number";
}
