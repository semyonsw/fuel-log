/**
 * The few things the app remembers that are not the log.
 *
 *   consumption   the typed L/100 km. The per-trip cost estimate and the
 *                 calculator use it; blank = derive from the log.
 *   backupDirUri  the folder the user granted once for auto-backup (an SAF
 *                 tree URI; Android keeps the grant across app updates).
 *   onboarded     the welcome/permissions screen has been answered.
 *
 * Keys 1.7.x stored (budgets, language, Gemini model) are left out of
 * `partialize`, so the next write drops them.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage, SETTINGS_KEY } from './legacyStorage';

export { SETTINGS_KEY };

export type BackupStatus =
  { at: number; ok: true; file: string } | { at: number; ok: false; error: string };

interface SettingsState {
  consumption: string;
  backupDirUri?: string;
  onboarded: boolean;
  lastBackup?: BackupStatus;
  hydrated: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'hydrated'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      consumption: '',
      onboarded: false,
      hydrated: false,
      set: (patch) => set(patch),
    }),
    {
      name: SETTINGS_KEY,
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({
        consumption: s.consumption,
        backupDirUri: s.backupDirUri,
        onboarded: s.onboarded,
        lastBackup: s.lastBackup,
      }),
      // Only known keys are taken, so a 1.7.x blob's budgets/language/model
      // never reach the state.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...(typeof p.consumption === 'string' ? { consumption: p.consumption } : {}),
          ...(typeof p.backupDirUri === 'string' ? { backupDirUri: p.backupDirUri } : {}),
          ...(typeof p.onboarded === 'boolean' ? { onboarded: p.onboarded } : {}),
          ...(typeof p.lastBackup === 'object' &&
          p.lastBackup !== null &&
          typeof p.lastBackup.at === 'number'
            ? { lastBackup: p.lastBackup }
            : {}),
        };
      },
      onRehydrateStorage: () => () => {
        useSettings.setState({ hydrated: true });
      },
    },
  ),
);
