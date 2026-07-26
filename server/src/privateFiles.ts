import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { HttpError } from "./errors.js";

export async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export function decodeBase64Payload(contentBase64: string) {
  const raw = contentBase64.includes(",") ? contentBase64.split(",").pop()! : contentBase64;
  return Buffer.from(raw, "base64");
}

export async function storePrivateFile(options: {
  dir: string;
  prefix: string;
  fileName: string;
  contentBase64: string;
  maxBytes?: number;
}) {
  const buffer = decodeBase64Payload(options.contentBase64);
  const maxBytes = options.maxBytes ?? 1_500_000;
  if (buffer.length > maxBytes) {
    throw new HttpError(400, `File must be under ${Math.round(maxBytes / 1_000_000)} MB`);
  }
  await ensureDir(options.dir);
  const safeName = options.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const storageKey = `${options.prefix}-${randomBytes(8).toString("hex")}-${safeName}`;
  await writeFile(path.join(options.dir, storageKey), buffer, { mode: 0o600 });
  return { storageKey, sizeBytes: buffer.length, buffer };
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
