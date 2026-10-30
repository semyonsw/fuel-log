#!/usr/bin/env bash
# Builds the signed release APK as fuel-log-<version>.apk in the repo root,
# then checks the built file: signing key (must be CN=Android Debug, or the
# phone refuses the update) and package/version. Usage: npm run build:apk
#
# Paths default to this machine's (see CLAUDE.md); override with
# ANDROID_HOME / JAVA_HOME. Takes ~10-20 min cold, a few minutes warm.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-/root/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
VERSION="$(node -p "require('./app.json').expo.version")"
APK="fuel-log-$VERSION.apk"

[ -d node_modules ] || npm ci

# Prebuild rewrites package.json (adds an "ios" script); keep the committed one.
cp package.json package.json.prebuild-backup
trap 'mv -f package.json.prebuild-backup package.json 2>/dev/null || true' EXIT
CI=1 npx expo prebuild -p android --no-install

echo "sdk.dir=$ANDROID_HOME" > android/local.properties
(
  cd android
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
    -PWT_STORE_FILE="$PWD/app/debug.keystore" -PWT_STORE_PASSWORD=android \
    -PWT_KEY_ALIAS=androiddebugkey -PWT_KEY_PASSWORD=android
)
cp android/app/build/outputs/apk/release/app-release.apk "$APK"

BT="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
"$BT/apksigner" verify --print-certs "$APK" | grep -q "CN=Android Debug" \
  || { echo "ERROR: $APK is not signed with the Android Debug key; it would not update the phone." >&2; exit 1; }
# sed, not head: head exits early and SIGPIPEs aapt2, which fails the script under pipefail.
"$BT/aapt2" dump badging "$APK" | sed -n 1p
echo
echo "Done: $(pwd)/$APK"
