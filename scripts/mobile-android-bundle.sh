#!/usr/bin/env bash
# Build a signed-ready Android App Bundle for Play Store upload.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python3 scripts/generate-android-icons.py
npx cap sync android
cd android
./gradlew bundleRelease
echo "AAB: $ROOT/android/app/build/outputs/bundle/release/app-release.aab"
echo "Upload that file in Play Console → Production (or Internal testing)."
echo "Privacy: https://hrms.anytime-diesel.com/privacy"
echo "Account deletion: https://hrms.anytime-diesel.com/account-deletion"
