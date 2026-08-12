#!/usr/bin/env bash
# Build the web app while PRESERVING previously deployed JS/CSS chunks.
#
# Why this exists:
#   `vite build` wipes dist/client/assets on every build, deleting the hashed
#   chunks that already-open clients still reference. The native Android WebView
#   has no service worker, so after a redeploy it can hold a cached index.html
#   that points at chunk hashes which no longer exist. When such a client then
#   lazy-imports a now-deleted chunk (e.g. the /dashboard route right after
#   login) it throws "Failed to fetch dynamically imported module" and the
#   screen after login never renders — which users experience as the app
#   "not responding" or "closing after login".
#
#   Retaining old chunks for a grace window (default 7 days) makes every deploy
#   backward-compatible for in-flight clients, so nobody breaks mid-session.
#
# Usage (on the server, in place of `npm run build`):
#   bash deploy/build-with-retention.sh
#   ASSET_RETAIN_DAYS=14 bash deploy/build-with-retention.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCHIVE="$ROOT/.asset-archive"
ASSETS="$ROOT/dist/client/assets"
RETAIN_DAYS="${ASSET_RETAIN_DAYS:-7}"

mkdir -p "$ARCHIVE"

# 1) Snapshot the currently-live assets before the build wipes them.
if [ -d "$ASSETS" ]; then
  cp -an "$ASSETS/." "$ARCHIVE/" 2>/dev/null || true
fi

# 2) Build. This recreates dist/client and empties dist/client/assets.
npm run build

# 3) Restore older chunks the new build removed, without overwriting new ones.
mkdir -p "$ASSETS"
cp -an "$ARCHIVE/." "$ASSETS/" 2>/dev/null || true

# 4) Refresh the archive with the new build and prune anything past the window.
cp -an "$ASSETS/." "$ARCHIVE/" 2>/dev/null || true
find "$ARCHIVE" -type f -mtime +"$RETAIN_DAYS" -delete 2>/dev/null || true

RETAINED="$(find "$ASSETS" -type f | wc -l | tr -d ' ')"
echo "Build complete. dist/client/assets now serves ${RETAINED} files (new + retained)."
echo "Old chunks are kept for ${RETAIN_DAYS} days so in-flight clients never 404."
