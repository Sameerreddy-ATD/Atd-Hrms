#!/usr/bin/env bash
# Build a signed-ready Android App Bundle for Play Store upload.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python3 scripts/generate-android-icons.py
npx cap sync android
python3 scripts/patch-capacitor-samsung-npe.py
cd android
./gradlew bundleRelease
VERSION_CODE=$(awk '/versionCode / { print $2; exit }' android/app/build.gradle)
VERSION_NAME=$(awk -F'"' '/versionName / { print $2; exit }' android/app/build.gradle)
echo "AAB: $ROOT/android/app/build/outputs/bundle/release/app-release.aab"
echo "Upload that file in Play Console → Production (or Internal testing)."
echo "After this build is live on Play, set public/app-version.json androidVersionCode=$VERSION_CODE androidVersionName=$VERSION_NAME so phones still on an older shell are asked to update."
echo "Privacy: https://hrms.anytime-diesel.com/privacy"
echo "Account deletion: https://hrms.anytime-diesel.com/account-deletion"
