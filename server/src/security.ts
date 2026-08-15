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
  sessionVersion: number;
  /** Identifies the signed-in device. Absent on tokens issued before per-device sessions. */
  sid?: string;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.secureCookies,
  path: "/",
};

/** Precomputed bcrypt hash used only to equalize login timing for unknown emails. */
const LOGIN_TIMING_DUMMY_HASH = "$2a$12$CdGAMCWpSeIMX4GNum3D1eKMGW2Wv29eVWFWsVtTODtDuwliModBe";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/** Run a password compare even when the account is unknown (timing hardening). */
export async function verifyPasswordForLoginTiming(password: string) {
  await verifyPassword(password, LOGIN_TIMING_DUMMY_HASH);
}

export function issueCookies(
  res: Response,
  user: Pick<
    User,
    | "id"
    | "employeeId"
    | "role"
    | "name"
    | "email"
    | "firstLoginPasswordChangeRequired"
    | "sessionVersion"
  >,
  sessionId: string,
) {
  const payload: SessionUser = {
    id: user.id,
    employeeId: user.employeeId,
    role: user.role,
    name: user.name,
    email: user.email,
    mustChangePassword: user.firstLoginPasswordChangeRequired,
    sessionVersion: user.sessionVersion,
    sid: sessionId,
  };
  const access = jwt.sign(payload, config.accessSecret, {
    expiresIn: "15m",
    algorithm: "HS256",
  });
  const refresh = jwt.sign(
    { id: user.id, sessionVersion: user.sessionVersion, sid: sessionId },
    config.refreshSecret,
    { expiresIn: "7d", algorithm: "HS256" },
  );
  res.cookie(config.sessionCookie, access, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
  res.cookie(config.refreshCookie, refresh, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export function clearCookies(res: Response) {
  res.clearCookie(config.sessionCookie, cookieOptions);
  res.clearCookie(config.refreshCookie, cookieOptions);
}

export function verifyAccessToken(token: string): SessionUser {
  return jwt.verify(token, config.accessSecret, { algorithms: ["HS256"] }) as SessionUser;
}

export function verifyRefreshToken(token: string): {
  id: string;
  sessionVersion: number;
  sid?: string;
} {
  return jwt.verify(token, config.refreshSecret, {
    algorithms: ["HS256"],
  }) as { id: string; sessionVersion: number; sid?: string };
}
