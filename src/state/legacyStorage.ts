/**
 * The AsyncStorage both persisted stores read through, so the 1.7.x safety
 * copy (see `lib/legacy`) is taken before either store can overwrite its blob.
 *
 * zustand's persist writes back right after hydrating (the `hydrated` flag is
 * a setState, and every setState is written), so the copy cannot wait until
 * the app is ready. Instead the stores' first read waits for it: the raw
 * blobs are set aside under LEGACY_KEY once, and only then is the store's own
 * key read. After the copy has reached the backup folder `services/backup`
 * marks it written and drops the blobs; the marker keeps it from being taken
 * again from data 2.0 has already cleaned.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

import { hasLegacyData, type LegacyBlobs } from '../lib/legacy';

export const LOG_KEY = 'fuel-log/v1';
export const SETTINGS_KEY = 'fuel-log/settings/v1';
/** Where 1.7.x kept AI chats; no 2.0 store reads or writes it. */
const CHATS_KEY = 'fuel-log/chats/v1';
export const LEGACY_KEY = 'fuel-log/pre-2.0';

/** What LEGACY_KEY holds: the blobs until written out, then only the marker. */
export type LegacyRecord = { written: false; blobs: LegacyBlobs } | { written: true };

async function takeCopy(): Promise<void> {
  if ((await AsyncStorage.getItem(LEGACY_KEY)) !== null) return;
  const blobs: LegacyBlobs = {
    log: await AsyncStorage.getItem(LOG_KEY),
    settings: await AsyncStorage.getItem(SETTINGS_KEY),
    chats: await AsyncStorage.getItem(CHATS_KEY),
  };
  // Nothing 2.0 would drop (a fresh install, or one already on 2.0): no copy, no marker.
  if (!hasLegacyData(blobs)) return;
  const record: LegacyRecord = { written: false, blobs };
  await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(record));
}

let inFlight: Promise<void> | null = null;

/**
 * Both stores read at launch at once; they share one run, so the blobs are
 * read once, before either store writes. Later calls just re-check the marker.
 * A failure must not keep the log from loading.
 */
export function ensureLegacyCopy(): Promise<void> {
  inFlight ??= takeCopy()
    .catch(() => {})
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** The persist storage for both stores: reads wait for the copy, writes go straight through. */
export const persistStorage = createJSONStorage(() => ({
  getItem: async (key: string) => {
    await ensureLegacyCopy();
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
}));

export async function readLegacy(): Promise<LegacyRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    return raw ? (JSON.parse(raw) as LegacyRecord) : null;
  } catch {
    return null;
  }
}

/** The copy is in the backup folder: keep only the marker, free the blobs and the old chats. */
export async function markLegacyWritten(): Promise<void> {
  const record: LegacyRecord = { written: true };
  await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(record));
  await AsyncStorage.removeItem(CHATS_KEY);
}
