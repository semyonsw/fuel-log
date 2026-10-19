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
- **Today, weekly, monthly, all-time and custom-range summary** of trips, range
  used, liters and money spent, with spending per day, plus the approximate
  fuel cost of the period's driving (km × consumption × price per liter).
- **Today on the Log:** km driven today and what that driving cost, under the
  range.
- **Spending history:** every refuel in the period, editable, plus "Add refuel"
  for any past date. Refuels can record the station, its address and the grade.
- **Fuel calculator:** what a distance costs, or how far an amount takes you.
- **GPS trips:** start/stop recording from the Log (keeps going with the screen
  off), route on a map (MapLibre + OpenFreeMap, no key), distance from the track,
  From/To guessed from earlier trips, approximate fuel cost per trip.
- **AI chat (Gemini):** say what happened ("bought 15 L for 9000 AMD, fuel was
  15 km, now 250 km") or photograph the dashboard; the entries it implies appear
  as editable cards and one Approve saves them to the log. Ask about your log too.
  Several chats, with history; choice of current Gemini models.
- **Backup:** export/import one JSON file; auto-backup after every change into a
  folder you pick once (the newest file replaces the old one).

Data stays on the phone (AsyncStorage). The network is used only for map tiles
and the AI chat; everything else works offline.

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

Or all of it, with the signing check, in one command: `npm run build:apk`.

The APK lands at `android/app/build/outputs/apk/release/app-release.apk`. Released
builds are committed to the repo root as `fuel-log-<version>.apk`: copy one to the
phone and open it to install (allow "install unknown apps" for your file manager).
Each new version installs over the previous one and keeps your data, as long as it
is signed with the same key.
