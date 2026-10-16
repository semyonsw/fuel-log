# Prompt for Claude Code (VS Code) — build and ship Fuel Log 1.0.0

Paste everything below the line into Claude Code in VS Code.

---

Build and ship the first APK of my new app **Fuel Log** (`semyonsw/fuel-log`).
All code, tests and docs are already on `main`; the only thing missing is the
APK, because the cloud machine that wrote it was rate-limited by Maven Central.
Do NOT change app code. If something fails, stop and tell me the exact error
instead of working around it.

1. **Get the code.** Clone `https://github.com/semyonsw/fuel-log` next to my
   `momentum-app` folder (or `git pull` if it is already there), then `npm ci`.
2. **Read the docs first:** `fuel-log/CLAUDE.md` (release rules, build, verify)
   and, for THIS machine's paths and traps, the "On the Windows box" and
   "THE OTHER TRAP" sections of `momentum-app/CLAUDE.md` — Fuel Log uses the
   same JDK 17, the same Android SDK and the same signing setup as Momentum.
   (Fuel Log has no NativeWind, so the lightningcss trap does not apply.)
3. **Check before building** — all must pass, show me the output:
   `npx tsc --noEmit`, `npx vitest run` (95 tests), `npx eslint .`,
   `npx prettier --check App.tsx src`.
4. **Build** the release APK exactly like Momentum:
   `npx expo prebuild -p android`, point `android/local.properties` at my SDK,
   then `gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` with the
   `WT_STORE_FILE`/`WT_STORE_PASSWORD`/`WT_KEY_ALIAS`/`WT_KEY_PASSWORD`
   properties pointing at `android/app/debug.keystore` (password `android`,
   alias `androiddebugkey`). Run it in the background; a cold build is 10-20 min.
5. **Verify the artifact**, not the source (commands in `fuel-log/CLAUDE.md`):
   - `aapt2 dump badging` → `package: name='com.semyonsw.fuellog'
     versionCode='1' versionName='1.0.0'`
   - `apksigner verify --print-certs` → `CN=Android Debug`
   - permissions: only `VIBRATE` plus what Expo/RN add by default
     (INTERNET etc.) — tell me the full list.
   - the bundle contains the app's text:
     `unzip -p <apk> assets/index.android.bundle | grep -ac "km range left"` > 0
6. **Ship.** Copy the APK to the repo root as `fuel-log-1.0.0.apk`,
   `git add -f fuel-log-1.0.0.apk` (`*.apk` is gitignored), commit
   "Release 1.0.0 APK" and push to `main`.
7. **Report:** the check outputs, build time, the verify results, and the
   commit hash. Then tell me to copy `fuel-log-1.0.0.apk` to my phone and
   install it.
