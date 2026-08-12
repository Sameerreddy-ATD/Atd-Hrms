#!/usr/bin/env bash
# Create the Play upload keystore locally (gitignored). Does not commit secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/android"

if ! command -v keytool >/dev/null 2>&1; then
  echo "keytool not found. Install a JDK first, e.g.: sudo apt install -y openjdk-17-jdk"
  exit 1
fi

STORE_PASS="${ANDROID_KEYSTORE_PASSWORD:-}"
KEY_PASS="${ANDROID_KEY_PASSWORD:-$STORE_PASS}"
ALIAS="${ANDROID_KEY_ALIAS:-anytime-workforce}"
JKS="anytime-workforce-upload.jks"

if [[ -z "$STORE_PASS" ]]; then
  echo "Set ANDROID_KEYSTORE_PASSWORD (and optionally ANDROID_KEY_PASSWORD) then re-run."
  echo "Example:"
  echo "  ANDROID_KEYSTORE_PASSWORD='your-strong-password' bash scripts/create-android-keystore.sh"
  exit 1
fi

if [[ -f "$JKS" ]]; then
  echo "Refusing to overwrite existing $JKS"
  exit 1
fi

keytool -genkeypair -v \
  -keystore "$JKS" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass "$STORE_PASS" \
  -keypass "$KEY_PASS" \
  -dname "CN=Anytime Workforce, OU=Anytime Diesel, O=Anytime Diesel, L=Hyderabad, ST=Telangana, C=IN"

cat > keystore.properties <<EOF
storeFile=../$JKS
storePassword=$STORE_PASS
keyAlias=$ALIAS
keyPassword=$KEY_PASS
EOF

chmod 600 "$JKS" keystore.properties
echo "Created android/$JKS and android/keystore.properties (gitignored)."
echo "Back these up offline. Losing them blocks Play updates."
