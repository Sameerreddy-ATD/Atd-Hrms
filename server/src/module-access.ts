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
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
export type ModuleAccessMatrix = Record<Role, ModuleKey[]>;

const ALL_MODULES = [...MODULE_KEYS];
export const DEFAULT_MODULE_ACCESS: ModuleAccessMatrix = {
  DEVELOPER_ADMIN: ALL_MODULES,
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
  ],
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
  ],
  MANAGER: [
    "DASHBOARD",
    "PEOPLE",
    "ATTENDANCE",
    "TASKS",
    "EMPLOYEE_REQUESTS",
    "LEAVE",
    "PROFILE",
    "COMMUNICATIONS",
  ],
  EMPLOYEE: [
    "DASHBOARD",
    "ATTENDANCE",
    "TASKS",
    "EMPLOYEE_REQUESTS",
    "LEAVE",
    "PROFILE",
    "COMMUNICATIONS",
  ],
  SALES: [
    "DASHBOARD",
    "ATTENDANCE",
    "TASKS",
    "EMPLOYEE_REQUESTS",
    "LEAVE",
    "PROFILE",
    "COMMUNICATIONS",
  ],
  DRIVER: [
    "DASHBOARD",
    "ATTENDANCE",
    "TASKS",
    "EMPLOYEE_REQUESTS",
    "LEAVE",
    "PROFILE",
    "COMMUNICATIONS",
  ],
  FIELD_STAFF: [
    "DASHBOARD",
    "ATTENDANCE",
    "TASKS",
    "EMPLOYEE_REQUESTS",
    "LEAVE",
    "PROFILE",
    "COMMUNICATIONS",
  ],
};

const SETTING_KEY = "module_access_matrix";
let cached: { value: ModuleAccessMatrix; expiresAt: number } | null = null;

function normalize(value: unknown): ModuleAccessMatrix {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.values(Role).map((role) => {
      const configured = Array.isArray(source[role]) ? source[role] : DEFAULT_MODULE_ACCESS[role];
      const allowed = configured.filter((item): item is ModuleKey =>
        MODULE_KEYS.includes(item as ModuleKey),
      );
      return [role, role === Role.DEVELOPER_ADMIN ? ALL_MODULES : [...new Set(allowed)]];
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

export function moduleForApiPath(path: string): ModuleKey | null {
  if (path.startsWith("/tasks") || path.startsWith("/task-boards")) return "TASKS";
  if (path.startsWith("/expense-claims") || path.startsWith("/certificate-requests"))
    return "EMPLOYEE_REQUESTS";
  if (path.startsWith("/leave/")) return "LEAVE";
  if (path.startsWith("/attendance/")) return "ATTENDANCE";
  if (path.startsWith("/assets")) return "COMPANY";
  if (path.startsWith("/announcements")) return "COMMUNICATIONS";
  if (path.startsWith("/audit-logs")) return "SYSTEM";
  return null;
}

export async function roleHasModuleAccess(role: Role, module: ModuleKey) {
  if (role === Role.DEVELOPER_ADMIN) return true;
  const matrix = await getModuleAccessMatrix();
  return matrix[role].includes(module);
}
