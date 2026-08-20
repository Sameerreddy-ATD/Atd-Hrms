/**
 * Playwright global setup: disposable MySQL + migrations + E2E seed.
 * Fails loudly if infrastructure cannot start.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATABASE_URL =
  process.env.DATABASE_URL ?? "mysql://atd_test:atd_test_pass@127.0.0.1:3308/atd_org_test";

function run(cmd: string, env: Record<string, string> = {}) {
  console.log(`[e2e-setup] ${cmd}`);
  execSync(cmd, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env, DATABASE_URL },
  });
}

export default async function globalSetup() {
  if (process.env.E2E_SKIP_INFRA === "1") {
    console.log("[e2e-setup] E2E_SKIP_INFRA=1 — skipping database setup");
    return;
  }

  const tryDocker = () => {
    try {
      run("docker compose -f docker-compose.org-test.yml up -d --wait");
      return true;
    } catch (error) {
      console.warn("[e2e-setup] docker compose failed — will verify database connectivity", error);
      return false;
    }
  };

  if (!tryDocker()) {
    const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log("[e2e-setup] disposable MySQL already reachable");
    } catch {
      throw new Error(
        "E2E database is unavailable. Start disposable MySQL with:\n" +
          "  docker compose -f docker-compose.org-test.yml up -d --wait\n" +
          "Or set E2E_SKIP_INFRA=1 when infra is already running.",
      );
    } finally {
      await prisma.$disconnect();
    }
  }

  // 2. Apply all migrations
  run("npx prisma migrate deploy", { DATABASE_URL });

  // 3. Seed deterministic E2E users + 20-unit fixture
  run("node scripts/e2e-seed.mjs", { DATABASE_URL });

  // Rebuild only when forced or assets missing — keeps local iteration fast.
  if (process.env.E2E_FORCE_BUILD === "1" || !existsSync(path.join(ROOT, "dist/client/assets"))) {
    run("npm run build");
  }
  if (!existsSync(path.join(ROOT, "dist-server/server/src/index.js"))) {
    run("npm run build:backend");
  }

  console.log("[e2e-setup] Infrastructure ready");
}
