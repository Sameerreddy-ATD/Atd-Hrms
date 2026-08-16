import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Stages the Human model weights the browser downloads from /face-models.
 *
 * Files are left alone when their contents already match. The previous version
 * wiped the directory and re-copied on every deploy, which gave all 10MB a new
 * mtime — and because the preview server derives its ETag from size and mtime,
 * every employee's browser re-downloaded the whole set after each release even
 * though not a byte had changed.
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "node_modules", "@vladmandic", "human", "models");
const targetRoot = path.join(projectRoot, "public", "face-models");
const files = [
  "antispoof.bin",
  "antispoof.json",
  "blazeface.bin",
  "blazeface.json",
  "facemesh.bin",
  "facemesh.json",
  "faceres.bin",
  "faceres.json",
  "liveness.bin",
  "liveness.json",
];

const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");

await mkdir(targetRoot, { recursive: true });

let copied = 0;
await Promise.all(
  files.map(async (file) => {
    const source = path.join(sourceRoot, file);
    const target = path.join(targetRoot, file);
    const contents = await readFile(source);
    const existing = await readFile(target).catch(() => null);
    if (existing && digest(existing) === digest(contents)) return;
    await copyFile(source, target);
    copied += 1;
  }),
);

console.log(
  copied === 0
    ? `Face models already current in ${targetRoot} (${files.length} files unchanged)`
    : `Prepared ${copied} of ${files.length} face models in ${targetRoot}`,
);
