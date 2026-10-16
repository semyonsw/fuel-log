# Working on this repo

Fuel Log is a sideloaded Android app (Expo SDK 54, React Native 0.81) for logging
car trips, dashboard fuel-range readings and refuels. It replaces a Samsung Notes
page, so the data entry has to be at least as fast as typing a note.

## Finish every change with a release

A change that only exists in `src/` has not reached the phone. The app is
sideloaded (no store, no OTA), so **shipping is part of the task, not a
follow-up**. After every change, without being asked:

1. **Bump the version.** `app.json` (`expo.version` and `expo.android.versionCode`,
   both) and `package.json` `version`. Patch bump unless the change is bigger.
   `versionCode` is an integer and must go up by one every release, or Android
   refuses the install as a downgrade.
2. **Build the APK** (below) and copy it to the repo root as
   `fuel-log-<version>.apk`.
3. **Commit and push to `main`.** `.gitignore` has `*.apk`, so the APK must be
   force-added: `git add -f fuel-log-<version>.apk`, or the release quietly
   contains no release. Short, plain one-line commit message.

The user copies that file to the phone and installs it over the old one. Leave
the previous APKs on disk as rollbacks; do not delete them.

## Building the APK

The SDK lives at `/root/android-sdk`, JDK 17 at
`/usr/lib/jvm/java-17-openjdk-amd64`. If the SDK is gone, reinstall:
cmdline-tools, `platforms;android-35`, `platforms;android-36`,
`build-tools;35.0.0`, `build-tools;36.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1`.

```bash
CI=1 npx expo prebuild -p android --no-install   # app.json changed, so always
cd android
echo "sdk.dir=/root/android-sdk" > local.properties
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=/root/android-sdk ANDROID_SDK_ROOT=/root/android-sdk
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
  -PWT_STORE_FILE="$PWD/app/debug.keystore" -PWT_STORE_PASSWORD=android \
  -PWT_KEY_ALIAS=androiddebugkey -PWT_KEY_PASSWORD=android
cp app/build/outputs/apk/release/app-release.apk ../fuel-log-<version>.apk
```

Takes ~10-20 minutes cold; run it in the background. `android/` is generated
output (gitignored); never hand-edit it, change `app.json` or `plugins/` instead.

If dependency resolution fails with `Could not find <group>:<artifact>` and the
URLs listed are `repo.maven.apache.org`, Maven Central is rate-limiting this
machine (it answers 404 with a `retry-after` header, or 429). Check with
`curl -sI https://repo.maven.apache.org/maven2/junit/junit/4.13.2/junit-4.13.2.pom`.
It is not a broken build; ask the user how to proceed rather than routing around it.

## Signing

`plugins/withReleaseSigning.js` makes the release build sign with the keystore
named by the `WT_STORE_FILE`/`WT_STORE_PASSWORD`/`WT_KEY_ALIAS`/`WT_KEY_PASSWORD`
Gradle properties (the `WT_` prefix is inherited from the sister project). The
command above points them at `android/app/debug.keystore`, which is the stock
React Native template debug keystore (`CN=Android Debug`), rewritten identically
by every prebuild. So a fresh clone can produce an APK that updates the phone.

What still matters: Android identifies an app by package name
(`com.semyonsw.fuellog`) + signing key. An APK signed with any other key cannot
update the install, and the uninstall that would let it through deletes the log.
So check the certificate on the built APK, every release.

## Verify the artifact, never the source

```bash
export PATH="/root/android-sdk/build-tools/36.0.0:$PATH"
apksigner verify --print-certs <apk> | grep "certificate DN"   # CN=Android Debug
aapt2 dump badging <apk> | head -1                             # package, versionCode, versionName
aapt2 dump badging <apk> | grep permission                     # VIBRATE, nothing surprising
```

The manifest merger takes the union of every library's permissions, so the only
honest permission check reads the built file.

To prove the JS that shipped is the JS you wrote, grep the bundle inside the APK
for a string your change introduced:
`unzip -p <apk> assets/index.android.bundle | grep -ac 'some ascii string'`.
The bundle is Hermes bytecode: use `grep -a`, pick an ASCII-only string (non-ASCII
strings are stored as UTF-16), and pick a string, not a number (numeric literals
live in a constant pool, not as text).

## Before committing

`npx tsc --noEmit`, `npx vitest run`, `npx eslint src`, `npx prettier --write src`.
All four, every time. CI (`.github/workflows/ci.yml`) runs test, typecheck and
lint on every push.

## House style

Read a neighbouring file before writing one. Comment the *decision* and the
*why*, not the mechanics. Decisions (range used per trip, summaries, parsing) live
in `src/lib/` as pure functions so they can be tested without a renderer; the
store persists through AsyncStorage (stubbed in tests by
`test/asyncStorageStub.ts`); screens are composition.
