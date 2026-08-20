#!/usr/bin/env node
/**
 * Stamp public/app-version.json, src/lib/app-build.ts, and public/sw.js build id.
 * Does NOT bump Android versionCode / versionName.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function gitSha() {
  if (process.env.GIT_SHA?.trim()) return process.env.GIT_SHA.trim();
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function shortSha(sha) {
  return sha === "unknown" ? "unknown" : sha.slice(0, 7);
}

const fullSha = gitSha();
const short = shortSha(fullSha);
const now = new Date();
const day = now.toISOString().slice(0, 10);
const buildId = (process.env.RELEASE_ID || process.env.BUILD_ID || `${day}-${short}`).trim();
const builtAt = now.toISOString();

const versionPath = join(root, "public", "app-version.json");
let previous = {};
if (existsSync(versionPath)) {
  try {
    previous = JSON.parse(readFileSync(versionPath, "utf8"));
  } catch {
    previous = {};
  }
}

const next = {
  buildId,
  gitSha: fullSha,
  builtAt,
  forceReload: true,
  androidVersionCode: previous.androidVersionCode ?? 16,
  androidVersionName: previous.androidVersionName ?? "1.0.15",
  minAndroidVersionCode: previous.minAndroidVersionCode ?? previous.androidVersionCode ?? 16,
  playStoreUrl:
    previous.playStoreUrl ??
    "https://play.google.com/store/apps/details?id=com.anytimediesel.workforce",
};

writeFileSync(versionPath, `${JSON.stringify(next, null, 2)}\n`);

const appBuildPath = join(root, "src", "lib", "app-build.ts");
let appBuild = readFileSync(appBuildPath, "utf8");
appBuild = appBuild.replace(
  /export const APP_BUILD_ID = "[^"]*";/,
  `export const APP_BUILD_ID = "${buildId}";`,
);
writeFileSync(appBuildPath, appBuild);

const swPath = join(root, "public", "sw.js");
let sw = readFileSync(swPath, "utf8");
sw = sw.replace(/self\.ATD_BUILD_ID = "[^"]*";/, `self.ATD_BUILD_ID = "${buildId}";`);
writeFileSync(swPath, sw);

console.log(`Stamped buildId=${buildId} gitSha=${fullSha}`);
