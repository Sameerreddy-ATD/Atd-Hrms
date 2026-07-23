import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const root = process.cwd();
const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    cwd: root,
    encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean)
  .map((file) => file.replaceAll("\\", "/"))
  .filter((file) => existsSync(resolve(root, file)));
const trackedSet = new Set(tracked);
const failures = [];
const warnings = [];

const requiredFiles = [
  ".editorconfig",
  ".env.example",
  ".gitignore",
  "README.md",
  "SECURITY.md",
  "docs/README.md",
  "docs/DEVELOPMENT_AND_TESTING.md",
  "docs/REPOSITORY_STRUCTURE.md",
  "docs/THIRD_PARTY_HANDOVER.md",
  "docs/CLOUD_DEPLOYMENT_OPTIONS.md",
  "docs/AWS_DEPLOYMENT_PATTERNS.md",
  "docs/DATABASE_INTEGRITY_AUDIT.md",
  "docs/EMPLOYEE_DATA_AND_INTEGRATION_API.md",
  "docs/openapi.employee-v1.yaml",
  "prisma/schema.prisma",
  "prisma.config.ts",
  "prisma/migrations/migration_lock.toml",
  "Dockerfile",
  ".dockerignore",
  "deploy/docker-compose.handoff.yml",
  "deploy/handoff.env.example",
  "deploy/nginx/container.conf",
  "scripts/README.md",
  "src/routes/README.md",
  "src/types/domain.ts",
];

for (const file of requiredFiles) {
  if (!trackedSet.has(file)) failures.push(`Required file is not tracked: ${file}`);
}

const forbiddenTracked = tracked.filter(
  (file) =>
    (file.startsWith(".env") && file !== ".env.example") ||
    file.startsWith("node_modules/") ||
    file.startsWith("dist/") ||
    file.startsWith("dist-server/") ||
    file.startsWith(".tmp/") ||
    file.startsWith("playwright-report/") ||
    file.startsWith("test-results/") ||
    /\.(?:pem|key|p12|dump)$/i.test(file) ||
    (/\.sql$/i.test(file) &&
      !file.startsWith("prisma/migrations/") &&
      !file.startsWith("prisma/postgresql-migrations/")),
);
for (const file of forbiddenTracked)
  failures.push(`Forbidden generated or sensitive file: ${file}`);

for (const obsoletePath of [
  "src/mock/data.ts",
  "src/mock/types.ts",
  "src/assets/logo.png.asset.json",
  "src/components/common/PlaceholderPage.tsx",
  "src/components/common/BackButton.tsx",
]) {
  if (trackedSet.has(obsoletePath))
    failures.push(`Obsolete file is still tracked: ${obsoletePath}`);
}

const textFiles = tracked.filter(
  (file) => file.startsWith("src/") && [".js", ".mjs", ".ts", ".tsx"].includes(extname(file)),
);
for (const file of textFiles) {
  const content = readFileSync(resolve(root, file), "utf8");
  if (content.includes("@/mock/") || content.includes("src/mock/")) {
    failures.push(`Production source still references the retired mock folder: ${file}`);
  }
}

const markdownFiles = tracked.filter((file) => extname(file) === ".md");
const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
for (const file of markdownFiles) {
  const content = readFileSync(resolve(root, file), "utf8");
  for (const match of content.matchAll(linkPattern)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    if (!target || target.startsWith("#") || /^(?:https?:|mailto:)/i.test(target)) continue;
    target = target.split("#", 1)[0];
    if (!target) continue;
    let decodedTarget;
    try {
      decodedTarget = decodeURIComponent(target);
    } catch {
      failures.push(`Invalid encoded Markdown link in ${file}: ${target}`);
      continue;
    }
    const absoluteTarget = resolve(root, dirname(file), decodedTarget);
    if (!existsSync(absoluteTarget))
      failures.push(`Broken local Markdown link in ${file}: ${target}`);
  }
}

const docsIndex = readFileSync(resolve(root, "docs/README.md"), "utf8");
for (const file of tracked.filter((item) => item.startsWith("docs/") && extname(item) === ".md")) {
  if (file === "docs/README.md") continue;
  const name = file.slice("docs/".length);
  if (!docsIndex.includes(name)) failures.push(`Documentation index does not reference ${name}`);
}
if (!docsIndex.includes("openapi.employee-v1.yaml")) {
  failures.push("Documentation index does not reference openapi.employee-v1.yaml");
}

const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
for (const script of [
  "repo:audit",
  "typecheck",
  "lint",
  "test",
  "build",
  "build:backend",
  "db:verify",
  "db:audit",
  "audit:deps",
]) {
  if (!packageJson.scripts?.[script]) failures.push(`Required npm script is missing: ${script}`);
}

const migrationLocks = tracked.filter((file) => file.endsWith("migration_lock.toml"));
if (!migrationLocks.includes("prisma/migrations/migration_lock.toml")) {
  failures.push("The active MySQL migration lock is missing");
}
if (tracked.some((file) => file.startsWith("prisma/postgresql-migrations/"))) {
  const structureGuide = readFileSync(resolve(root, "docs/REPOSITORY_STRUCTURE.md"), "utf8");
  if (!structureGuide.includes("archived migration history")) {
    warnings.push("Archived PostgreSQL migrations are not clearly identified in repository docs");
  }
}

const summary = {
  trackedFiles: tracked.length,
  markdownFiles: markdownFiles.length,
  requiredFiles: requiredFiles.length,
  failures: failures.length,
  warnings: warnings.length,
};

console.log(JSON.stringify({ summary, failures, warnings }, null, 2));
if (failures.length > 0) process.exitCode = 1;
