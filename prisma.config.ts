import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * `prisma/schema.prisma` resolves its datasource through `env("DATABASE_URL")`,
 * so schema-only commands (`validate`, `format`, `generate`) fail on a fresh
 * checkout even though they never open a connection. Outside production we fill
 * in an obviously fake host so those commands work; production keeps failing
 * fast, and commands that really connect surface the placeholder immediately.
 */
const PLACEHOLDER_URL =
  "mysql://placeholder:placeholder@127.0.0.1:3306/placeholder_set_DATABASE_URL";

if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production") {
  process.env.DATABASE_URL = PLACEHOLDER_URL;
}

export default defineConfig({
  engine: "classic",
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
