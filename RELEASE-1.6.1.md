# Task: build and ship the Fuel Log 1.6.1 APK

You are Claude Code, working in the user's local checkout of this repo. The
code for 1.6.1 is already on `main`. Only the APK is missing: the cloud session
that wrote the change could not build it, because Maven Central kept answering
`429 Too Many Requests`. Your job is to build `fuel-log-1.6.1.apk`, check it,
and push it to `main`.

Read `CLAUDE.md` first. It is the source of truth for building, signing and
checking. This file only says what is left to do for this release.

## What 1.6.1 changes (already committed, do not redo)

Commit `62b4f2f` on `main`:

- **Trip cost uses range used, not trip length.** Cost = range used ÷ km per
  litre × price per litre. Range used is the dashboard range before the trip
  minus the range after it. So traffic (more range burned per km) costs more,
  and the highway costs less. See `tripCostKm` in `src/lib/fuel.ts`.
- **Trip length is the fallback**, used only when a trip has no range used:
  no range reading on either side, or the range did not drop.
- **The Today line shows range used**, for example
  `Today: 38.9 km driven · 45 km range used · ≈ 2 160 AMD`, in English,
  Armenian and Russian. See `todayLine` and `tripRangeUsedKm` in
  `src/lib/entries.ts`.
- Version is already bumped: `app.json` `expo.version` 1.6.1,
  `expo.android.versionCode` 8, `package.json` `version` 1.6.1.
  **Do not bump it again.**

## Steps

### 1. Get up to date and confirm the starting point

```bash
git checkout main
git pull origin main
node -p "require('./app.json').expo.version + ' / ' + require('./app.json').expo.android.versionCode"
# expect: 1.6.1 / 8
```

If it prints anything else, stop and tell the user.

### 2. Run the checks (all four, as CLAUDE.md requires)

```bash
npm ci            # only if node_modules is missing or stale
npx tsc --noEmit
npx vitest run    # expect: all tests pass (323 at the time of writing)
npx eslint src
npx prettier --check src
```

If any of these fails, stop and tell the user. Do not "fix" tests to make
them pass.

### 3. Build the APK

```bash
npm run build:apk
```

This runs `scripts/build-apk.sh`. The script runs `expo prebuild`, builds,
writes `fuel-log-1.6.1.apk` to the repo root and checks the signing key.

- The script defaults to `/root/android-sdk` and
  `/usr/lib/jvm/java-17-openjdk-amd64`, the cloud machine's paths. On this
  machine, set `ANDROID_HOME` and `JAVA_HOME` to the local Android SDK and a
  **JDK 17** before running it. The SDK packages needed are listed in
  `CLAUDE.md`.
- A cold build takes about 10–20 minutes.
- While it runs, `package.json` shows as modified. That is prebuild's
  temporary edit; the script restores the file when it exits. Never commit it.
- If the build fails with `Could not find …`, `429` or a `retry-after` from
  `repo.maven.apache.org`, Maven Central is rate-limiting this machine. Stop
  and ask the user how to proceed, as `CLAUDE.md` says. Do not route around it.

### 4. Check the built file, not the source

Use the `build-tools` folder of the local SDK:

```bash
export PATH="$ANDROID_HOME/build-tools/36.0.0:$PATH"
A=fuel-log-1.6.1.apk

apksigner verify --print-certs $A | grep "certificate DN"
# must contain CN=Android Debug, or the phone refuses the update

aapt2 dump badging $A | head -1
# must show package name='com.semyonsw.fuellog' versionCode='8' versionName='1.6.1'

aapt2 dump badging $A | grep permission
# compare with the expected list in CLAUDE.md; RECORD_AUDIO must not be there

unzip -p $A assets/index.android.bundle | grep -ac 'app.log.todayUsed'
# must be 1 or more: proves the 1.6.1 JS is inside the APK
```

If any of these is wrong, do not push. Tell the user what you saw.

### 5. Commit and push

`.gitignore` has `*.apk`, so the APK must be force-added:

```bash
git status --short          # only fuel-log-1.6.1.apk should be new
git add -f fuel-log-1.6.1.apk
git commit -m "Release 1.6.1 APK"
git push origin main
```

Keep the older APKs (`fuel-log-1.5.0.apk`, `fuel-log-1.6.0.apk`) on disk.
They are rollbacks. Do not delete them.

### 6. Report back to the user

In a few lines:
- the result of each check in step 4, including the certificate DN, the
  versionCode/versionName line and the bundle grep count;
- the commit hash that was pushed;
- the reminder to copy `fuel-log-1.6.1.apk` to the phone and install it over
  1.6.0 (no uninstall, since uninstalling deletes the log).

Once the release is pushed, this file has done its job. Ask the user whether
to delete `RELEASE-1.6.1.md` in a follow-up commit.
