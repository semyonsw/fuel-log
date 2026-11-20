/**
 * The Gemini API key, kept in the Android keystore (expo-secure-store) and
 * mirrored into the settings store's memory so it can be read synchronously.
 * Never in AsyncStorage, never in git, never in the APK — only on the phone
 * and, because the user asked for a complete restore, in their backup file.
 */

import * as SecureStore from 'expo-secure-store';

import { useSettings } from '../state/settings';

const KEY = 'gemini-api-key';

/**
 * "No key" and "could not read the keystore" both leave `apiKey` blank, but
 * only the first is true. The backup needs the difference: after a failed
 * read it must not delete older backup files, which may hold the only other
 * copy of the key (see `canPruneBackups`). Cleared once a key is saved.
 */
let readFailed = false;

export function apiKeyReadFailed(): boolean {
  return readFailed;
}

export async function loadApiKey(): Promise<void> {
  try {
    const k = (await SecureStore.getItemAsync(KEY)) ?? '';
    readFailed = false;
    useSettings.getState().set({ apiKey: k });
  } catch {
    // The chat asks for the key again; the backup keeps the older files.
    readFailed = true;
  }
}

export async function saveApiKey(key: string): Promise<void> {
  const k = key.trim();
  // The user has now said what the key is (even blank), so the backup may tidy up.
  readFailed = false;
  useSettings.getState().set({ apiKey: k });
  try {
    if (k) await SecureStore.setItemAsync(KEY, k);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Kept in memory for this session even if the keystore refuses.
  }
}
