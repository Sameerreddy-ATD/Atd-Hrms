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
  DRIVER: [
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

const SETTING_KEY = "module_access_matrix";
let cached: { value: ModuleAccessMatrix; expiresAt: number } | null = null;

const LIFECYCLE_MODULES: ModuleKey[] = ["TALENT", "LIFECYCLE", "PERFORMANCE", "LMS"];

function normalize(value: unknown): ModuleAccessMatrix {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.values(Role).map((role) => {
      const configured = Array.isArray(source[role]) ? source[role] : DEFAULT_MODULE_ACCESS[role];
      const allowed = configured.filter((item): item is ModuleKey =>
        MODULE_KEYS.includes(item as ModuleKey),
      );
      const hasLifecycleKeys = allowed.some((key) => LIFECYCLE_MODULES.includes(key));
      const merged = hasLifecycleKeys
        ? allowed
        : [...allowed, ...DEFAULT_MODULE_ACCESS[role].filter((key) => LIFECYCLE_MODULES.includes(key))];
      return [role, role === Role.DEVELOPER_ADMIN ? ALL_MODULES : [...new Set(merged)]];
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
  const value = normalize(parsed);
  cached = { value, expiresAt: Date.now() + 30_000 };
  return value;
}

export async function saveModuleAccessMatrix(matrix: unknown, updatedById: string) {
  const value = normalize(matrix);
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(value), updatedById },
    update: { value: JSON.stringify(value), updatedById },
  });
  cached = { value, expiresAt: Date.now() + 30_000 };
  return value;
}

export function moduleForApiPath(path: string, method = "GET"): ModuleKey | null {
  if (path === "/module-access/me") return null;
  if (path.startsWith("/users") || path.startsWith("/departments")) return "PEOPLE";
  if (path.startsWith("/employees") && method !== "GET") return "PEOPLE";
  if (path.startsWith("/branches") && method !== "GET") return "COMPANY";
  if (path.startsWith("/tasks") || path.startsWith("/task-boards")) return "TASKS";
  if (path.startsWith("/expense-claims") || path.startsWith("/certificate-requests"))
    return "EMPLOYEE_REQUESTS";
  if (path.startsWith("/search") || path.startsWith("/notification-preferences")) return null;
  if (path.startsWith("/checklists")) return "PEOPLE";
  if (
    path.startsWith("/lifecycle/jobs") ||
    path.startsWith("/lifecycle/candidates") ||
    path.startsWith("/lifecycle/offers")
  )
    return "TALENT";
  if (path.startsWith("/lifecycle/performance")) return "PERFORMANCE";
  if (path.startsWith("/lifecycle/lms")) return "LMS";
  if (path.startsWith("/lifecycle/")) return "LIFECYCLE";
  if (
    path.startsWith("/leave/") ||
    path.startsWith("/weekly-offs") ||
    path.startsWith("/reports/leave")
  )
    return "LEAVE";
  if (
    path.startsWith("/attendance/") ||
    path.startsWith("/biometric/") ||
    path.startsWith("/reports/attendance") ||
    path.startsWith("/reports/employee-attendance") ||
    path.startsWith("/reports/branch-wise") ||
    path.startsWith("/reports/multi-branch") ||
    path.startsWith("/reports/field") ||
    path.startsWith("/reports/client-visits") ||
    path.startsWith("/reports/late") ||
    path.startsWith("/reports/absent") ||
    path.startsWith("/reports/payroll") ||
    path.startsWith("/reports/timeline") ||
    path.startsWith("/reports/movement")
  )
    return "ATTENDANCE";
  // Employee "My Assets" is a profile self-service surface; admin asset APIs stay COMPANY.
  if (path === "/assets/mine") return "PROFILE";
  if (path.startsWith("/assets")) return "COMPANY";
  if (path.startsWith("/holidays")) return "COMPANY";
  if (path.startsWith("/profile/") || path.startsWith("/id-card/")) return "PROFILE";
  if (
    path.startsWith("/announcements") ||
    path.startsWith("/notifications") ||
    path.startsWith("/push/")
  )
    return "COMMUNICATIONS";
  if (
    path.startsWith("/audit-logs") ||
    path.startsWith("/system/") ||
    path.startsWith("/module-access/") ||
    path.startsWith("/integration-clients") ||
    path.startsWith("/face/admin/")
  )
    return "SYSTEM";
  return null;
}

export async function roleHasModuleAccess(role: Role, module: ModuleKey) {
  if (role === Role.DEVELOPER_ADMIN) return true;
  const matrix = await getModuleAccessMatrix();
  return matrix[role].includes(module);
}
