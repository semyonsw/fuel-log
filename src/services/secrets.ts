/**
 * The Gemini API key, kept in the Android keystore (expo-secure-store) and
 * mirrored into the settings store's memory so it can be read synchronously.
 * Never in AsyncStorage, never in git, never in the APK — only on the phone
 * and, because the user asked for a complete restore, in their backup file.
 */

import * as SecureStore from 'expo-secure-store';

import { useSettings } from '../state/settings';

const KEY = 'gemini-api-key';

export async function loadApiKey(): Promise<void> {
  try {
    const k = (await SecureStore.getItemAsync(KEY)) ?? '';
    useSettings.getState().set({ apiKey: k });
  } catch {
    // An unreadable keystore just means the chat asks for the key again.
  }
}

export async function saveApiKey(key: string): Promise<void> {
  const k = key.trim();
  useSettings.getState().set({ apiKey: k });
  try {
    if (k) await SecureStore.setItemAsync(KEY, k);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Kept in memory for this session even if the keystore refuses.
  }
}
