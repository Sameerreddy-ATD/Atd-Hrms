import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  "iris.bin",
  "iris.json",
  "liveness.bin",
  "liveness.json",
];

await mkdir(targetRoot, { recursive: true });
await Promise.all(
  files.map((file) =>
    cp(path.join(sourceRoot, file), path.join(targetRoot, file), { force: true }),
  ),
);
console.log(`Prepared ${files.length} face models in ${targetRoot}`);
