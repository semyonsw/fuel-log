# Fuel Log

A small Android app for keeping a car's fuel diary: where you drove, what the
dashboard said the remaining range was, and when and how much you refuelled. It
replaces a running note in Samsung Notes with something that does the arithmetic.

## Features

- **Trips with stops.** Log a trip as a chain of places (home, work, shop, home).
- **Range readings.** Record the dashboard's "km remaining" at the start and end
  of a trip, or whenever you glance at it.
- **Range used per trip,** computed automatically from the readings around it.
- **Refuels** with liters and price in AMD.
- **Remembered places,** so frequent stops are one tap instead of retyped.
- **Weekly and monthly summary** of trips, range used, liters and money spent.

Data stays on the phone (AsyncStorage). No account, no network.

## Development

```bash
npm ci
npm start            # Expo dev server
npm test             # vitest
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
```

## Build and install

Requires the Android SDK and JDK 17 (see `CLAUDE.md` for exact paths and versions).

```bash
CI=1 npx expo prebuild -p android --no-install
cd android
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
  -PWT_STORE_FILE="$PWD/app/debug.keystore" -PWT_STORE_PASSWORD=android \
  -PWT_KEY_ALIAS=androiddebugkey -PWT_KEY_PASSWORD=android
```

The APK lands at `android/app/build/outputs/apk/release/app-release.apk`. Released
builds are committed to the repo root as `fuel-log-<version>.apk`: copy one to the
phone and open it to install (allow "install unknown apps" for your file manager).
Each new version installs over the previous one and keeps your data, as long as it
is signed with the same key.
