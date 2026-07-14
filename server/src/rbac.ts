import type { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { HttpError } from "./errors.js";
import { prisma } from "./prisma.js";
import { verifyAccessToken } from "./security.js";
import { config } from "./config.js";

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

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[config.sessionCookie];
  if (!token) return next(new HttpError(401, "Authentication required"));
  try {
    const user = verifyAccessToken(token);
    req.user = user;

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

    return next();
  } catch {
    return next(new HttpError(401, "Session expired"));
  }
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "Authentication required"));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, "Insufficient permissions"));
    return next();
  };
}

/** Returns active employees in the units below an organizational head. */
export async function getOrganizationTeamEmployeeIds(employeeId: string) {
  const [employee, units] = await Promise.all([
    prisma.employee.findUnique({
      where: { employeeId },
      select: { departmentId: true, organizationLevel: true },
    }),
    prisma.department.findMany({
      select: { departmentId: true, parentDepartmentId: true, headEmployeeId: true },
    }),
  ]);
  if (!employee) return [];

  const ownedUnitIds = units
    .filter((unit) => unit.headEmployeeId === employeeId)
    .map((unit) => unit.departmentId);
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
  if (viewer.role === Role.MANAGER && viewer.employeeId) {
    const teamEmployeeIds = await getOrganizationTeamEmployeeIds(viewer.employeeId);
    if (teamEmployeeIds.includes(employeeId)) return;
  }
  throw new HttpError(403, "You can only access permitted employee data");
}

export function roleToUi(role: Role) {
  return role.toLowerCase();
}
