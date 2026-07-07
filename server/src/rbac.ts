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
  MAIN_ADMIN: [Role.CEO, Role.HR, Role.MANAGER, Role.EMPLOYEE],
  CEO: [],
  HR: [Role.EMPLOYEE, Role.MANAGER, Role.SALES, Role.DRIVER, Role.FIELD_STAFF],
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
    req.user = verifyAccessToken(token);
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
    const employee = await prisma.employee.findUnique({
      where: { employeeId },
      select: { managerId: true },
    });
    if (employee?.managerId === viewer.employeeId) return;
  }
  throw new HttpError(403, "You can only access permitted employee data");
}

export function roleToUi(role: Role) {
  return role.toLowerCase();
}
