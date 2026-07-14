import bcrypt from "bcryptjs";
import type { Response } from "express";
import jwt from "jsonwebtoken";
import type { Role, User } from "@prisma/client";
import { config } from "./config.js";

export interface SessionUser {
  id: string;
  employeeId: string | null;
  role: Role;
  name: string;
  email: string;
  mustChangePassword: boolean;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.secureCookies,
  path: "/",
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function issueCookies(
  res: Response,
  user: Pick<
    User,
    "id" | "employeeId" | "role" | "name" | "email" | "firstLoginPasswordChangeRequired"
  >,
) {
  const payload: SessionUser = {
    id: user.id,
    employeeId: user.employeeId,
    role: user.role,
    name: user.name,
    email: user.email,
    mustChangePassword: user.firstLoginPasswordChangeRequired,
  };
  const access = jwt.sign(payload, config.accessSecret, { expiresIn: "15m" });
  const refresh = jwt.sign({ id: user.id }, config.refreshSecret, { expiresIn: "7d" });
  res.cookie(config.sessionCookie, access, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
  res.cookie(config.refreshCookie, refresh, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export function clearCookies(res: Response) {
  res.clearCookie(config.sessionCookie, cookieOptions);
  res.clearCookie(config.refreshCookie, cookieOptions);
}

export function verifyAccessToken(token: string): SessionUser {
  return jwt.verify(token, config.accessSecret) as SessionUser;
}

export function verifyRefreshToken(token: string): { id: string } {
  return jwt.verify(token, config.refreshSecret) as { id: string };
}
