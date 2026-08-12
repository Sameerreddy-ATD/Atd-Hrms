#!/usr/bin/env bash
# Build a signed-ready Android App Bundle for Play Store upload.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npx cap sync android
cd android
./gradlew bundleRelease
echo "AAB: $ROOT/android/app/build/outputs/bundle/release/app-release.aab"
