import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

const TICKET_TTL_SECONDS = 16 * 60 * 60;

type PunchTicketPayload = {
  employeeId: string;
  userId: string;
  iat: number;
  exp: number;
  jti: string;
};

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

export function issuePunchTicket(employeeId: string, userId: string) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TICKET_TTL_SECONDS;
  const payload = b64url(
    JSON.stringify({
      employeeId,
      userId,
      iat,
      exp,
      jti: randomBytes(12).toString("hex"),
    } satisfies PunchTicketPayload),
  );
  const sig = createHmac("sha256", config.accessSecret).update(`punch:${payload}`).digest();
  return {
    ticket: `${payload}.${b64url(sig)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyPunchTicket(ticket: string, employeeId: string, userId: string): PunchTicketPayload {
  const parts = ticket.split(".");
  if (parts.length !== 2) throw new HttpError(400, "Invalid punch ticket");
  const [payload, sig] = parts;
  if (!payload || !sig) throw new HttpError(400, "Invalid punch ticket");
  const expected = createHmac("sha256", config.accessSecret).update(`punch:${payload}`).digest();
  let provided: Buffer;
  try {
    provided = fromB64url(sig);
  } catch {
    throw new HttpError(400, "Invalid punch ticket");
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new HttpError(400, "Invalid punch ticket");
  }
  let data: PunchTicketPayload;
  try {
    data = JSON.parse(fromB64url(payload).toString("utf8")) as PunchTicketPayload;
  } catch {
    throw new HttpError(400, "Invalid punch ticket");
  }
  if (!data.employeeId || !data.userId || !data.jti || typeof data.exp !== "number") {
    throw new HttpError(400, "Invalid punch ticket");
  }
  if (data.exp < Math.floor(Date.now() / 1000)) {
    throw new HttpError(400, "Punch ticket expired. Reconnect and try again.");
  }
  if (data.employeeId !== employeeId || data.userId !== userId) {
    throw new HttpError(403, "Punch ticket does not match this login");
  }
  return data;
}
