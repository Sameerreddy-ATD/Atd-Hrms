import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "./config.js";

const VERSION = "v1";

function key() {
  return createHash("sha256").update(config.employeeDataEncryptionKey, "utf8").digest();
}

export function encryptEmployeeField(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptEmployeeField(value?: string | null) {
  if (!value) return undefined;
  try {
    const [version, iv, tag, encrypted] = value.split(".");
    if (version !== VERSION || !iv || !tag || !encrypted) return undefined;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return undefined;
  }
}

export function lastFour(value?: string | null) {
  const normalized = value?.replace(/[^A-Za-z0-9]/g, "");
  return normalized ? normalized.slice(-4) : null;
}
