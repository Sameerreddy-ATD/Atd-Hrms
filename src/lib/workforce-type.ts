import type { Role, User } from "@/types/domain";

/** Sign-in and directory split: Team Members (email) vs Bowser Pilots (mobile). */
export type WorkforceType = "team_member" | "bowser_pilot";

export type WorkforceTypeFilter = "all" | WorkforceType;

export const WORKFORCE_TYPE_ORDER: WorkforceType[] = ["team_member", "bowser_pilot"];

export const WORKFORCE_TYPE_LABELS: Record<WorkforceType, string> = {
  team_member: "Team Member",
  bowser_pilot: "Bowser Pilot",
};

export function workforceTypeFromRole(role: Role): WorkforceType {
  return role === "driver" ? "bowser_pilot" : "team_member";
}

export function workforceTypeLabel(type: WorkforceType): string {
  return WORKFORCE_TYPE_LABELS[type];
}

export function workforceTypeForPerson(person: Pick<User, "role">): WorkforceType {
  return workforceTypeFromRole(person.role);
}

export function matchesWorkforceTypeFilter(
  person: Pick<User, "role">,
  filter: WorkforceTypeFilter,
): boolean {
  if (filter === "all") return true;
  return workforceTypeForPerson(person) === filter;
}

export function occupiedWorkforceTypes(people: Array<Pick<User, "role">>): WorkforceType[] {
  const present = new Set(people.map((person) => workforceTypeForPerson(person)));
  return WORKFORCE_TYPE_ORDER.filter((type) => present.has(type));
}
