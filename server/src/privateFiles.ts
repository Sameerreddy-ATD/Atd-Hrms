import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Role } from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "./errors.js";

export async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export function decodeBase64Payload(contentBase64: string) {
  const raw = contentBase64.includes(",") ? contentBase64.split(",").pop()! : contentBase64;
  return Buffer.from(raw, "base64");
}

const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/** Detect MIME from magic bytes; reject polyglots / mismatched client claims. */
export function detectAllowedUploadMime(buffer: Buffer): string {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  throw new HttpError(400, "Only PDF, JPEG, PNG, or WebP files are allowed");
}

export function assertClientMimeMatches(detected: string, claimed: string) {
  const normalized = claimed.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!ALLOWED_MIME.has(normalized)) {
    throw new HttpError(400, "Unsupported file type");
  }
  if (normalized !== detected) {
    throw new HttpError(400, "File content does not match the declared type");
  }
}

export async function storePrivateFile(options: {
  dir: string;
  /** Prefer full user id — never truncate to 8 chars. */
  prefix: string;
  fileName: string;
  contentBase64: string;
  maxBytes?: number;
  kind: "medical" | "receipt";
  uploadedByUserId: string;
  claimedMimeType: string;
}) {
  const buffer = decodeBase64Payload(options.contentBase64);
  const maxBytes = options.maxBytes ?? 1_500_000;
  if (buffer.length > maxBytes) {
    throw new HttpError(400, `File must be under ${Math.round(maxBytes / 1_000_000)} MB`);
  }
  const mimeType = detectAllowedUploadMime(buffer);
  assertClientMimeMatches(mimeType, options.claimedMimeType);
  await ensureDir(options.dir);
  const safeName = options.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const storageKey = `${options.prefix}-${randomBytes(8).toString("hex")}-${safeName}`;
  await writeFile(path.join(options.dir, storageKey), buffer, { mode: 0o600 });
  await prisma.privateFile.create({
    data: {
      storageKey,
      kind: options.kind,
      uploadedByUserId: options.uploadedByUserId,
      mimeType,
      sizeBytes: buffer.length,
    },
  });
  return { storageKey, sizeBytes: buffer.length, buffer, mimeType };
}

export async function readPrivateFile(dir: string, storageKey: string) {
  if (!storageKey || storageKey.includes("..") || storageKey.includes("/") || storageKey.includes("\\")) {
    throw new HttpError(400, "Invalid file key");
  }
  try {
    return await readFile(path.join(dir, storageKey));
  } catch {
    throw new HttpError(404, "File not found");
  }
}

export function isPrivateAppFileUrl(url: string, prefixes: string[]) {
  return prefixes.some((prefix) => url.startsWith(prefix));
}

export function privateFileKeyFromUrl(url: string, prefix: string) {
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  if (!key || key.includes("/") || key.includes("..") || key.includes("\\")) return null;
  return key;
}

/**
 * Authorize download of a private vault object.
 * Prefer DB ownership; fall back to full-userId prefix for any pre-registry files.
 */
export async function assertCanAccessPrivateFile(options: {
  storageKey: string;
  kind: "medical" | "receipt";
  userId: string;
  role: Role;
  /** When true, managers may read medical files linked to leave they can see — handled by caller. */
  allowManagerMedical?: boolean;
}) {
  const privileged =
    options.role === Role.DEVELOPER_ADMIN ||
    options.role === Role.MAIN_ADMIN ||
    options.role === Role.HR;

  const record = await prisma.privateFile.findUnique({
    where: { storageKey: options.storageKey },
    select: { uploadedByUserId: true, kind: true, mimeType: true },
  });

  if (record) {
    if (record.kind !== options.kind) {
      throw new HttpError(404, "File not found");
    }
    if (privileged || record.uploadedByUserId === options.userId) return record;
    if (options.kind === "medical" && options.allowManagerMedical && options.role === Role.MANAGER) {
      return record;
    }
    throw new HttpError(403, "File not available");
  }

  // Legacy disk keys without a registry row: only full user-id prefix (not 8-char).
  if (options.storageKey.startsWith(`${options.userId}-`)) return null;
  if (privileged) return null;
  throw new HttpError(403, "File not available");
}

export async function assertOwnsPrivateFileUrl(options: {
  url: string;
  urlPrefix: string;
  kind: "medical" | "receipt";
  userId: string;
}) {
  const key = privateFileKeyFromUrl(options.url, options.urlPrefix);
  if (!key) {
    throw new HttpError(400, "Invalid private file URL");
  }
  const record = await prisma.privateFile.findUnique({
    where: { storageKey: key },
    select: { uploadedByUserId: true, kind: true },
  });
  if (record) {
    if (record.kind !== options.kind || record.uploadedByUserId !== options.userId) {
      throw new HttpError(403, "You can only attach files you uploaded");
    }
    return;
  }
  if (!key.startsWith(`${options.userId}-`)) {
    throw new HttpError(403, "You can only attach files you uploaded");
  }
}
