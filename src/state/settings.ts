/**
 * The few things the app remembers that are not the log.
 *
 *   consumption   the calculator's typed L/100 km. Remembered because the
 *                 per-trip cost estimate uses it too; blank = derive from log.
 *   geminiModel   the chat's chosen model.
 *   backupDirUri  the folder the user granted once for auto-backup (an SAF
 *                 tree URI; Android keeps the grant across app updates).
 *   onboarded     the welcome/permissions screen has been answered.
 *   language      the UI language chosen in Settings. Settings saved before
 *                 it existed have none and read back as English (`merge`).
 *
 * The Gemini API key is NOT persisted here: it lives in the Android keystore
 * via expo-secure-store and is only mirrored in memory (`apiKey`) so screens
 * and the backup can read it synchronously.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_LANGUAGE, toLanguage, type Language } from '../lib/language';
import { DEFAULT_MODEL } from '../lib/models';

export const SETTINGS_KEY = 'fuel-log/settings/v1';

export type BackupStatus =
  { at: number; ok: true; file: string } | { at: number; ok: false; error: string };

interface SettingsState {
  consumption: string;
  geminiModel: string;
  backupDirUri?: string;
  onboarded: boolean;
  language: Language;
  lastBackup?: BackupStatus;
  apiKey: string;
  hydrated: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'hydrated'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      consumption: '',
      geminiModel: DEFAULT_MODEL,
      onboarded: false,
      language: DEFAULT_LANGUAGE,
      apiKey: '',
      hydrated: false,
      set: (patch) => set(patch),
    }),
    {
      name: SETTINGS_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        consumption: s.consumption,
        geminiModel: s.geminiModel,
        backupDirUri: s.backupDirUri,
        onboarded: s.onboarded,
        language: s.language,
        lastBackup: s.lastBackup,
      }),
      // The default shallow merge already keeps 'en' when the key is missing;
      // this also turns a value this build does not know into 'en'.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return { ...current, ...p, language: toLanguage(p.language) };
      },
      onRehydrateStorage: () => () => {
        useSettings.setState({ hydrated: true });
      },
    },
  ),
);
