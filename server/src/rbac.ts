import type { NextFunction, Request, Response } from "express";
import { Role, UserStatus } from "@prisma/client";
import { HttpError } from "./errors.js";
import { prisma } from "./prisma.js";
import { clearCookies, verifyAccessToken } from "./security.js";
import { config } from "./config.js";
import { moduleForApiPath, roleHasModuleAccess } from "./module-access.js";
import { userHasApprovedFace } from "./faceAttendance.js";

declare global {
  namespace Express {
    interface Request {
      user?: import("./security.js").SessionUser;
    }
  }
}

const creationRules: Record<Role, Role[]> = {
  DEVELOPER_ADMIN: Object.values(Role),
  MAIN_ADMIN: [],
  CEO: [],
  HR: [],
  MANAGER: [],
  EMPLOYEE: [],
  SALES: [],
  DRIVER: [],
  FIELD_STAFF: [],
};

export function canCreateRole(actor: Role, target: Role) {
  return creationRules[actor]?.includes(target) ?? false;
}

/**
 * Prefer an explicit role from Developer Admin create-login.
 * Otherwise infer from organization unit name + level (legacy path).
 */
export function resolveTargetLoginRole(input: {
  explicitRole?: Role | null;
  unitName?: string | null;
  organizationLevel?: string | null;
}): Role {
  if (input.explicitRole) return input.explicitRole;
  const unitName = (input.unitName ?? "").trim().toLowerCase();
  const level = input.organizationLevel ?? "MEMBER";
  if (unitName === "executive leadership") return Role.CEO;
  if (unitName === "human resources") return Role.HR;
  if (unitName === "administration" && level === "HEAD") return Role.MAIN_ADMIN;
  if (unitName === "drivers") return Role.DRIVER;
  if (level === "HEAD") return Role.MANAGER;
  if (unitName.includes("sales")) return Role.SALES;
  return Role.EMPLOYEE;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[config.sessionCookie];
  if (!token) return next(new HttpError(401, "Authentication required"));
  let user: ReturnType<typeof verifyAccessToken>;
  try {
    user = verifyAccessToken(token);
  } catch {
    clearCookies(res);
    return next(new HttpError(401, "Session expired"));
  }
  try {
    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        employeeId: true,
        role: true,
        name: true,
        email: true,
        status: true,
        firstLoginPasswordChangeRequired: true,
        sessionVersion: true,
        suspensionStartsAt: true,
        suspendedUntil: true,
      },
    });
    if (!account || account.status !== UserStatus.ACTIVE) {
      clearCookies(res);
      return next(new HttpError(401, "Account is inactive or no longer available"));
    }
    if (!Number.isInteger(user.sessionVersion) || user.sessionVersion !== account.sessionVersion) {
      clearCookies(res);
      return next(new HttpError(401, "Session has been revoked. Sign in again"));
    }
    if (
      account.suspensionStartsAt &&
      account.suspendedUntil &&
      account.suspensionStartsAt.getTime() <= Date.now() &&
      account.suspendedUntil.getTime() > Date.now()
    ) {
      clearCookies(res);
      return next(new HttpError(403, "Account is temporarily suspended"));
    }
    user = {
      id: account.id,
      employeeId: account.employeeId,
      role: account.role,
      name: account.name,
      email: account.email,
      mustChangePassword: account.firstLoginPasswordChangeRequired,
      sessionVersion: account.sessionVersion,
    };
    req.user = user;
  } catch (error) {
    return next(error);
  }
  if (
    user.mustChangePassword &&
    req.path !== "/auth/change-password" &&
    req.path !== "/auth/logout" &&
    req.path !== "/auth/me" &&
    req.path !== "/health" &&
    req.path !== "/health/db"
  ) {
    return next(new HttpError(403, "Password change required on first login"));
  }
  const faceEnrollmentPath =
    req.path === "/face/status" ||
    req.path === "/face/session" ||
    req.path === "/face/enrollment" ||
    req.path === "/auth/change-password" ||
    req.path === "/auth/logout" ||
    req.path === "/auth/me" ||
    req.path === "/module-access/me" ||
    req.path === "/health" ||
    req.path === "/health/db";
  try {
    if (
      user.role !== Role.DEVELOPER_ADMIN &&
      !user.mustChangePassword &&
      !faceEnrollmentPath &&
      !(await userHasApprovedFace(user.id))
    ) {
      return next(
        new HttpError(
          403,
          "Face registration and Developer Admin approval are required before using the application",
        ),
      );
    }
  } catch (error) {
    return next(error);
  }
  const module = moduleForApiPath(req.path, req.method);
  try {
    if (module && !(await roleHasModuleAccess(user.role, module))) {
      return next(
        new HttpError(
          403,
          `Access to the ${module.toLowerCase().replaceAll("_", " ")} module is disabled`,
        ),
      );
    }
  } catch (error) {
    return next(error);
  }
  return next();
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "Authentication required"));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, "Insufficient permissions"));
    return next();
  };
}

const ORG_WIDE_ATTENDANCE_ROLES: Role[] = [
  Role.HR,
  Role.MAIN_ADMIN,
  Role.DEVELOPER_ADMIN,
  Role.CEO,
];

/** HR/admin/CEO see org-wide attendance; managers and org heads see their team only. */
export async function assertCanViewTeamAttendance(user: Express.Request["user"]) {
  if (!user) throw new HttpError(401, "Authentication required");
  if (ORG_WIDE_ATTENDANCE_ROLES.includes(user.role)) return { scope: "org" as const, teamIds: [] as string[] };
  if (!user.employeeId) {
    throw new HttpError(403, "You can only view attendance for your team.");
  }
  const teamIds = await getOrganizationTeamEmployeeIds(user.employeeId);
  if (user.role === Role.MANAGER || teamIds.length > 0) {
    return { scope: "team" as const, teamIds };
  }
  throw new HttpError(403, "Day Logs is available to organization heads with a team.");
}

/** True when this employee is head of one or more organization units (multi-unit / multi-head). */
export async function isAssignedOrganizationHead(employeeId: string) {
  const [assignmentCount, legacyCount] = await Promise.all([
    prisma.departmentHeadAssignment.count({ where: { employeeId } }),
    prisma.department.count({ where: { headEmployeeId: employeeId } }),
  ]);
  return assignmentCount > 0 || legacyCount > 0;
}

/** Returns active employees in the units below an organizational head. */
export async function getOrganizationTeamEmployeeIds(employeeId: string) {
  const [employee, units, assignments] = await Promise.all([
    prisma.employee.findUnique({
      where: { employeeId },
      select: { departmentId: true, organizationLevel: true },
    }),
    prisma.department.findMany({
      select: { departmentId: true, parentDepartmentId: true, headEmployeeId: true },
    }),
    prisma.departmentHeadAssignment.findMany({
      where: { employeeId },
      select: { departmentId: true },
    }),
  ]);
  if (!employee) return [];

  // One person may head multiple units — and a unit may have multiple heads.
  const ownedUnitIds = [
    ...new Set([
      ...assignments.map((row) => row.departmentId),
      ...units.filter((unit) => unit.headEmployeeId === employeeId).map((unit) => unit.departmentId),
    ]),
  ];
  if (ownedUnitIds.length === 0 && employee.organizationLevel === "HEAD" && employee.departmentId) {
    ownedUnitIds.push(employee.departmentId);
  }
  if (ownedUnitIds.length === 0) return [];

  const children = new Map<string, string[]>();
  for (const unit of units) {
    if (!unit.parentDepartmentId) continue;
    children.set(unit.parentDepartmentId, [
      ...(children.get(unit.parentDepartmentId) ?? []),
      unit.departmentId,
    ]);
  }
  const visibleUnitIds = new Set(ownedUnitIds);
  const queue = [...ownedUnitIds];
  while (queue.length) {
    const current = queue.shift()!;
    for (const childId of children.get(current) ?? []) {
      if (!visibleUnitIds.has(childId)) {
        visibleUnitIds.add(childId);
        queue.push(childId);
      }
    }
  }

  const team = await prisma.employee.findMany({
    where: {
      departmentId: { in: [...visibleUnitIds] },
      status: "ACTIVE",
      employeeId: { not: employeeId },
    },
    select: { employeeId: true },
  });
  return team.map((member) => member.employeeId);
}

export async function assertEmployeeAccess(viewer: Express.Request["user"], employeeId: string) {
  if (!viewer) throw new HttpError(401, "Authentication required");
  if (
    viewer.role === Role.DEVELOPER_ADMIN ||
    viewer.role === Role.MAIN_ADMIN ||
    viewer.role === Role.HR ||
    viewer.role === Role.CEO
  ) {
    return;
  }
  if (viewer.employeeId === employeeId) return;
  if (viewer.employeeId) {
    const teamEmployeeIds = await getOrganizationTeamEmployeeIds(viewer.employeeId);
    if (teamEmployeeIds.includes(employeeId)) return;
  }
  throw new HttpError(403, "You can only access permitted employee data");
}

export function roleToUi(role: Role) {
  return role.toLowerCase();
}
