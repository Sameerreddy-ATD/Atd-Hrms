#!/usr/bin/env bash
# Deterministic production release build.
# BUILD env (install tooling) is separate from RUNTIME NODE_ENV=production.
#
# Usage:
#   bash scripts/release-build.sh
#   RELEASE_ID=2026-08-20-abc1234 bash scripts/release-build.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Release build (deterministic)"

# Ensure Vite/React tooling is present even when the shell has NODE_ENV=production
# (npm ci otherwise omits devDependencies and the frontend build fails).
echo "==> npm ci --include=dev"
npm ci --include=dev

echo "==> Stamp release identity"
node scripts/stamp-app-version.mjs

echo "==> Prisma generate"
npx prisma generate

echo "==> Frontend production build (with asset retention)"
NODE_ENV=production npm run build:production

echo "==> Backend production build"
NODE_ENV=production npm run build:backend

# Validate artifacts before any release switch.
need=(
  "dist/client/index.html"
  "dist/client/assets"
  "dist-server/server/src/index.js"
  "public/app-version.json"
  "public/maintenance.html"
)
for path in "${need[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "ERROR: missing required build artifact: $path" >&2
    exit 1
  fi
done

if ! grep -q '"buildId"' public/app-version.json; then
  echo "ERROR: app-version.json missing buildId" >&2
  exit 1
fi

echo "==> Release build OK"
echo "    frontend: dist/client"
echo "    backend:  dist-server"
cat public/app-version.json
