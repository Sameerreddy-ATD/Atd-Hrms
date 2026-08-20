import type { Role } from "@/types/domain";

/** CEO, Chief of Staff, Bowser Pilots, and Dev Admin never see verification prompts. */
export function isProfileVerificationExempt(role: Role | undefined): boolean {
  return (
    role === "ceo" ||
    role === "chief_of_staff" ||
    role === "driver" ||
    role === "developer_admin"
  );
}

/**
 * Show the banner/modal only when the server says this account is targeted.
 * Default is off for everyone until Developer Admin enables the policy.
 */
export function shouldShowProfileVerification(user: {
  employeeId?: string;
  role: Role;
  profileVerified?: boolean;
  profileVerificationRequired?: boolean;
}): boolean {
  if (!user.employeeId) return false;
  if (isProfileVerificationExempt(user.role)) return false;
  if (user.profileVerified) return false;
  return user.profileVerificationRequired === true;
}
