import { Role } from "@prisma/client";
import { prisma } from "./prisma.js";

export const MODULE_KEYS = [
  "DASHBOARD",
  "PEOPLE",
  "ATTENDANCE",
  "TASKS",
  "EMPLOYEE_REQUESTS",
  "LEAVE",
  "COMPANY",
  "PROFILE",
  "COMMUNICATIONS",
  "SYSTEM",
  "TALENT",
  "LIFECYCLE",
  "PERFORMANCE",
  "LMS",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
export type ModuleAccessMatrix = Record<Role, ModuleKey[]>;

const ALL_MODULES = [...MODULE_KEYS];
export const DEFAULT_MODULE_ACCESS: ModuleAccessMatrix = {
  DEVELOPER_ADMIN: ALL_MODULES,
  // Company admin: setup + ops (no Employee Requests queue by default).
  MAIN_ADMIN: [
    "DASHBOARD",
    "PEOPLE",
    "ATTENDANCE",
    "TASKS",
    "EMPLOYEE_REQUESTS",
    "LEAVE",
    "COMPANY",
    "PROFILE",
    "COMMUNICATIONS",
    "SYSTEM",
    "TALENT",
    "LIFECYCLE",
    "PERFORMANCE",
    "LMS",
  ],
  // CEO: company-wide executive overview (no System). Attendance not required for the account.
  CEO: [
    "DASHBOARD",
    "PEOPLE",
    "ATTENDANCE",
    "TASKS",
    "EMPLOYEE_REQUESTS",
    "LEAVE",
    "COMPANY",
    "PROFILE",
    "COMMUNICATIONS",
    "TALENT",
    "LIFECYCLE",
    "PERFORMANCE",
    "LMS",
  ],
  HR: [
    "DASHBOARD",
    "PEOPLE",
    "ATTENDANCE",
    "TASKS",
    "EMPLOYEE_REQUESTS",
    "LEAVE",
    "COMPANY",
    "PROFILE",
    "COMMUNICATIONS",
    "TALENT",
    "LIFECYCLE",
    "PERFORMANCE",
    "LMS",
  ],
  // Department heads (MANAGER): team People/Attendance/Leave; no Company or System.
  MANAGER: [
    "DASHBOARD",
    "PEOPLE",
    "ATTENDANCE",
    "TASKS",
    "EMPLOYEE_REQUESTS",
    "LEAVE",
    "PROFILE",
    "COMMUNICATIONS",
    "TALENT",
    "LIFECYCLE",
    "PERFORMANCE",
    "LMS",
  ],
  EMPLOYEE: [
    "DASHBOARD",
    "ATTENDANCE",
    "TASKS",
    "EMPLOYEE_REQUESTS",
    "LEAVE",
    "PROFILE",
    "COMMUNICATIONS",
    "LIFECYCLE",
    "PERFORMANCE",
    "LMS",
  ],
  SALES: [
    "DASHBOARD",
    "ATTENDANCE",
    "TASKS",
    "EMPLOYEE_REQUESTS",
    "LEAVE",
    "PROFILE",
    "COMMUNICATIONS",
    "LIFECYCLE",
    "PERFORMANCE",
    "LMS",
  ],
  // Drivers: attendance + history (+ profile). Birthdays live on the dashboard.
  DRIVER: ["DASHBOARD", "ATTENDANCE", "PROFILE"],
  FIELD_STAFF: [
    "DASHBOARD",
    "ATTENDANCE",
    "TASKS",
    "EMPLOYEE_REQUESTS",
    "LEAVE",
    "PROFILE",
    "COMMUNICATIONS",
    "LIFECYCLE",
    "PERFORMANCE",
    "LMS",
  ],
};

const STAFF_ROLES: Role[] = [Role.EMPLOYEE, Role.SALES, Role.DRIVER, Role.FIELD_STAFF];
/** Staff may complete their own onboarding (LIFECYCLE) but never open TA hiring tools. */
const STAFF_HIDDEN_MODULES: ModuleKey[] = ["TALENT"];
/** Drivers stay on attendance + profile even if an old matrix grants more. */
const DRIVER_MODULES: ModuleKey[] = ["DASHBOARD", "ATTENDANCE", "PROFILE"];

const SETTING_KEY = "module_access_matrix";
let cached: { value: ModuleAccessMatrix; expiresAt: number } | null = null;

const LIFECYCLE_MODULES: ModuleKey[] = ["TALENT", "LIFECYCLE", "PERFORMANCE", "LMS"];

/** Exported for tests: pure, so it can be asserted without a database. */
export function normalizeModuleAccess(value: unknown): ModuleAccessMatrix {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.values(Role).map((role) => {
      if (role === Role.DEVELOPER_ADMIN) return [role, ALL_MODULES];
      if (role === Role.DRIVER) return [role, [...DRIVER_MODULES]];
      const configured = Array.isArray(source[role]) ? source[role] : DEFAULT_MODULE_ACCESS[role];
      const allowed = configured.filter((item): item is ModuleKey =>
        MODULE_KEYS.includes(item as ModuleKey),
      );
      const hasLifecycleKeys = allowed.some((key) => LIFECYCLE_MODULES.includes(key));
      const merged = hasLifecycleKeys
        ? allowed
        : [
            ...allowed,
            ...DEFAULT_MODULE_ACCESS[role].filter((key) => LIFECYCLE_MODULES.includes(key)),
          ];
      const scoped = STAFF_ROLES.includes(role)
        ? merged.filter((key) => !STAFF_HIDDEN_MODULES.includes(key))
        : merged;
      return [role, [...new Set(scoped)]];
    }),
  ) as ModuleAccessMatrix;
}

export async function getModuleAccessMatrix() {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const setting = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  let parsed: unknown;
  try {
    parsed = setting ? JSON.parse(setting.value) : DEFAULT_MODULE_ACCESS;
  } catch {
    parsed = DEFAULT_MODULE_ACCESS;
  }
  const value = normalizeModuleAccess(parsed);
  cached = { value, expiresAt: Date.now() + 30_000 };
  return value;
}

export async function saveModuleAccessMatrix(matrix: unknown, updatedById: string) {
  const value = normalizeModuleAccess(matrix);
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(value), updatedById },
    update: { value: JSON.stringify(value), updatedById },
  });
  cached = { value, expiresAt: Date.now() + 30_000 };
  return value;
}

export function moduleForApiPath(path: string, method = "GET"): ModuleKey | null {
  // Express matches routes case-insensitively by default, but req.path keeps the
  // caller's casing. Matching against that casing while failing open on a miss
  // means GET /ASSETS skips the COMPANY gate. Always compare in lowercase.
  const normalized = path.toLowerCase();
  const verb = method.toUpperCase();
  if (normalized === "/module-access/me") return null;
  if (normalized.startsWith("/users") || normalized.startsWith("/departments")) return "PEOPLE";
  if (normalized.startsWith("/employees") && verb !== "GET") return "PEOPLE";
  if (normalized.startsWith("/branches") && verb !== "GET") return "COMPANY";
  if (normalized.startsWith("/tasks") || normalized.startsWith("/task-boards")) return "TASKS";
  if (normalized.startsWith("/expense-claims") || normalized.startsWith("/certificate-requests"))
    return "EMPLOYEE_REQUESTS";
  if (normalized.startsWith("/search") || normalized.startsWith("/notification-preferences"))
    return null;
  if (normalized.startsWith("/checklists")) return "PEOPLE";
  if (normalized.includes("/lifecycle/offers/") && normalized.endsWith("/sign")) return "LIFECYCLE";
  if (
    normalized.startsWith("/lifecycle/jobs") ||
    normalized.startsWith("/lifecycle/candidates") ||
    normalized.startsWith("/lifecycle/offers")
  )
    return "TALENT";
  if (normalized.startsWith("/lifecycle/performance")) return "PERFORMANCE";
  if (normalized.startsWith("/lifecycle/lms")) return "LMS";
  if (normalized.startsWith("/lifecycle/")) return "LIFECYCLE";
  if (
    normalized.startsWith("/leave/") ||
    normalized.startsWith("/weekly-offs") ||
    normalized.startsWith("/reports/leave")
  )
    return "LEAVE";
  if (
    normalized.startsWith("/attendance/") ||
    normalized.startsWith("/biometric/") ||
    normalized.startsWith("/reports/attendance") ||
    normalized.startsWith("/reports/employee-attendance") ||
    normalized.startsWith("/reports/branch-wise") ||
    normalized.startsWith("/reports/multi-branch") ||
    normalized.startsWith("/reports/field") ||
    normalized.startsWith("/reports/client-visits") ||
    normalized.startsWith("/reports/late") ||
    normalized.startsWith("/reports/absent") ||
    normalized.startsWith("/reports/payroll") ||
    normalized.startsWith("/reports/timeline") ||
    normalized.startsWith("/reports/movement")
  )
    return "ATTENDANCE";
  // Employee "My Assets" is a profile self-service surface; admin asset APIs stay COMPANY.
  if (normalized === "/assets/mine") return "PROFILE";
  if (normalized.startsWith("/assets")) return "COMPANY";
  if (normalized.startsWith("/holidays")) return "COMPANY";
  if (normalized.startsWith("/profile/") || normalized.startsWith("/id-card/")) return "PROFILE";
  if (
    normalized.startsWith("/announcements") ||
    normalized.startsWith("/notifications") ||
    normalized.startsWith("/push/")
  )
    return "COMMUNICATIONS";
  if (
    normalized.startsWith("/audit-logs") ||
    normalized.startsWith("/system/") ||
    normalized.startsWith("/module-access/") ||
    normalized.startsWith("/integration-clients") ||
    normalized.startsWith("/face/admin/")
  )
    return "SYSTEM";
  return null;
}

export async function roleHasModuleAccess(role: Role, module: ModuleKey) {
  if (role === Role.DEVELOPER_ADMIN) return true;
  const matrix = await getModuleAccessMatrix();
  return matrix[role].includes(module);
}
