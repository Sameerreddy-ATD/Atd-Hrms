/**
 * Fails the build when a translation key used in the UI is missing from a
 * locale file, which otherwise renders the raw key ("pages.assets.tabEquipment")
 * on screen for whichever language is short.
 *
 * Run with tsx so the locale modules can be imported directly:
 *   npm run check:i18n
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import en from "../src/i18n/locales/en";
import te from "../src/i18n/locales/te";
import hi from "../src/i18n/locales/hi";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/** i18next appends these to a base key when `count` is passed. */
const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];

const LOCALES = { en, te, hi } as const;
type LocaleName = keyof typeof LOCALES;

type Translations = { [key: string]: string | Translations };

function flatten(node: Translations, prefix = "", out = new Set<string>()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, out);
    else out.add(path);
  }
  return out;
}

function collectSourceFiles(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "locales") collectSourceFiles(full, files);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const localeKeys = Object.fromEntries(
  Object.entries(LOCALES).map(([name, tree]) => [name, flatten(tree as Translations)]),
) as Record<LocaleName, Set<string>>;

const namespaces = Object.keys(en).join("|");
const literalKeyPattern = new RegExp(`"((?:${namespaces})(?:\\.[A-Za-z0-9_]+)+)"`, "g");
const callPattern = /\bt\(\s*"([A-Za-z0-9_.]+)"/g;
const dynamicPattern = /\bt\(\s*`([^`]*\$\{[^`]*)`/g;

const usedKeys = new Map<string, string>();
const dynamicKeys = new Map<string, string>();

for (const file of collectSourceFiles(SRC)) {
  const text = readFileSync(file, "utf8");
  const where = relative(ROOT, file);
  for (const match of text.matchAll(callPattern)) {
    if (!usedKeys.has(match[1])) usedKeys.set(match[1], where);
  }
  for (const match of text.matchAll(literalKeyPattern)) {
    if (!usedKeys.has(match[1])) usedKeys.set(match[1], where);
  }
  for (const match of text.matchAll(dynamicPattern)) {
    if (!dynamicKeys.has(match[1])) dynamicKeys.set(match[1], where);
  }
}

function isDefined(locale: LocaleName, key: string) {
  const keys = localeKeys[locale];
  if (keys.has(key)) return true;
  return PLURAL_SUFFIXES.some((suffix) => keys.has(`${key}${suffix}`));
}

/** Duplicate keys in an object literal silently win over the earlier copy. */
function findDuplicateKeys(file: string) {
  const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
  const stack: string[] = [];
  const seen = new Map<string, number>();
  const duplicates: string[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) return;
    if (trimmed === "}," || trimmed === "}" || trimmed === "};") {
      stack.pop();
      return;
    }
    const opening = trimmed.match(/^"?([A-Za-z0-9_]+)"?:\s*\{$/);
    if (opening) {
      stack.push(opening[1]);
      return;
    }
    const entry = trimmed.match(/^"?([A-Za-z0-9_]+)"?:/);
    if (!entry) return;
    const path = [...stack, entry[1]].join(".");
    const previous = seen.get(path);
    if (previous) duplicates.push(`${path} (lines ${previous} and ${i + 1})`);
    else seen.set(path, i + 1);
  });

  return duplicates;
}

const problems: string[] = [];

for (const locale of Object.keys(LOCALES) as LocaleName[]) {
  const missing = [...usedKeys].filter(([key]) => !isDefined(locale, key));
  if (missing.length) {
    problems.push(
      `${missing.length} key(s) used in the UI are missing from ${locale}:\n` +
        missing.map(([key, file]) => `    ${key}  (${file})`).join("\n"),
    );
  }
}

for (const locale of ["te", "hi"] as const) {
  const gaps = [...localeKeys.en].filter((key) => !localeKeys[locale].has(key));
  if (gaps.length) {
    problems.push(
      `${gaps.length} key(s) exist in en but not in ${locale}, so they fall back to English:\n` +
        gaps.map((key) => `    ${key}`).join("\n"),
    );
  }
}

for (const file of [
  "src/i18n/locales/en.ts",
  "src/i18n/locales/te.ts",
  "src/i18n/locales/hi.ts",
  "src/i18n/locales/pages-en.ts",
  "src/i18n/locales/pages-te.ts",
  "src/i18n/locales/pages-hi.ts",
]) {
  const duplicates = findDuplicateKeys(file);
  if (duplicates.length) {
    problems.push(
      `${duplicates.length} duplicate key(s) in ${file}:\n` +
        duplicates.map((entry) => `    ${entry}`).join("\n"),
    );
  }
}

if (problems.length) {
  console.error("i18n check failed.\n");
  for (const problem of problems) console.error(`  ${problem}\n`);
  process.exit(1);
}

const counts = (Object.keys(LOCALES) as LocaleName[])
  .map((locale) => `${locale} ${localeKeys[locale].size}`)
  .join(", ");
console.log(
  `i18n check passed: ${usedKeys.size} keys used, all present in every locale (${counts}).`,
);
if (dynamicKeys.size) {
  console.log(`  ${dynamicKeys.size} key(s) are built at runtime and cannot be verified:`);
  for (const [expression, file] of dynamicKeys) console.log(`    \`${expression}\`  (${file})`);
}
