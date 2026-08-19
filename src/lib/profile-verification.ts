import type { Role } from "@/types/domain";

/** CEO, Chief of Staff, and Bowser Pilots skip profile verification. */
export function isProfileVerificationExempt(role: Role | undefined): boolean {
  return role === "ceo" || role === "chief_of_staff" || role === "driver";
}

export function shouldShowProfileVerification(user: {
  employeeId?: string;
  role: Role;
  profileVerified?: boolean;
}): boolean {
  if (!user.employeeId) return false;
  if (isProfileVerificationExempt(user.role)) return false;
  return !user.profileVerified;
}
