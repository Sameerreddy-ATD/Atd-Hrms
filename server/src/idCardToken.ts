import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — ID cards stay scannable

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

export function issueIdCardVerificationToken(employeeId: string, ttlSeconds = TOKEN_TTL_SECONDS) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = b64url(JSON.stringify({ employeeId, exp }));
  const sig = createHmac("sha256", config.accessSecret).update(payload).digest();
  return {
    token: `${payload}.${b64url(sig)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyIdCardVerificationToken(token: string): { employeeId: string } {
  const parts = token.split(".");
  if (parts.length !== 2) throw new HttpError(400, "Invalid verification token");
  const [payload, sig] = parts;
  if (!payload || !sig) throw new HttpError(400, "Invalid verification token");
  const expected = createHmac("sha256", config.accessSecret).update(payload).digest();
  let provided: Buffer;
  try {
    provided = fromB64url(sig);
  } catch {
    throw new HttpError(400, "Invalid verification token");
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new HttpError(400, "Invalid verification token");
  }
  let data: { employeeId?: string; exp?: number };
  try {
    data = JSON.parse(fromB64url(payload).toString("utf8")) as {
      employeeId?: string;
      exp?: number;
    };
  } catch {
    throw new HttpError(400, "Invalid verification token");
  }
  if (!data.employeeId || typeof data.exp !== "number") {
    throw new HttpError(400, "Invalid verification token");
  }
  if (data.exp < Math.floor(Date.now() / 1000)) {
    throw new HttpError(400, "Verification link has expired");
  }
  return { employeeId: data.employeeId };
}
