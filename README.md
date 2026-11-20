# Fuel Log

A small Android app for keeping a car's fuel diary: where you drove, what the
dashboard said the remaining range was, and when and how much you refuelled. It
replaces a running note in Samsung Notes with something that does the arithmetic.

## Features

- **GPS trips.** Start on the Log, Stop when you arrive (keeps recording with
  the screen off). The trip form opens with the route on a map (MapLibre +
  OpenFreeMap, no key), its distance, and From/To guessed from earlier trips;
  type the km left on the dashboard and save.
- **Range used and cost per trip,** computed from the readings around it: the
  drop in dashboard range, and its approximate cost in AMD (range used ÷ km per
  litre × the price per litre of the latest refuel).
- **Manual trips** as a chain of places (home, work, shop, home), with
  remembered places so frequent stops are one tap.
- **Range readings:** record the dashboard's "km remaining" on its own.
- **Refuels** with litres, total price in AMD and, optionally, the range after.
- **Today on the Log:** km driven today and what that driving cost.
- **Summary** for today, this week, this month, all time or a custom range:
  trips, km driven, range used, litres, AMD spent on refuels, the approximate
  cost of the driving, spending per day, and every refuel in the period
  (editable, plus "Add refuel" for a past date).
- **Fuel calculator:** what a distance costs, or how far an amount takes you.
- **Consumption:** derived from refuels, or type your car's L/100 km in Settings.
- **Statistics:** charts and trends of driving, range and spending over time.
- **AI chat (Gemini, your own key):** tell it what happened or send a dashboard
  photo; it proposes log entries you approve. Chats are saved and backed up.
  Key and model are set in Settings; the key stays in the Android keystore.
- **Backup:** export/import one JSON file (entries, chats, settings, API key);
  auto-backup after every change into a folder you pick once (the newest file
  replaces the old one). Importing `fuel-log-pre-2.0.json` brings back 1.7 chats.

Data stays on the phone (AsyncStorage). The network is used for map tiles and,
only when you use the AI chat, for Google Gemini.

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
