import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SETTINGS_KEY, useSettings } from './settings';

/**
 * The settings store against the in-memory AsyncStorage stub: the language
 * choice is written out, and settings saved by a build from before the chooser
 * read back as English without losing anything else.
 */

/** Let the persist middleware's async write land. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const stored = (state: unknown) =>
  AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, state }));

beforeEach(async () => {
  await flush();
  useSettings.setState({ language: 'en', consumption: '', onboarded: false, hydrated: false });
  await AsyncStorage.removeItem(SETTINGS_KEY);
});

afterEach(async () => {
  await flush();
  await AsyncStorage.removeItem(SETTINGS_KEY);
});

describe('language', () => {
  it('defaults to English', () => {
    expect(useSettings.getState().language).toBe('en');
  });

  it('is persisted with the other settings', async () => {
    useSettings.getState().set({ language: 'hy' });
    await flush();
    const blob = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY))!);
    expect(blob.state.language).toBe('hy');
  });

  it('reads back after a relaunch', async () => {
    await stored({ consumption: '7', onboarded: true, language: 'ru' });
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().language).toBe('ru');
    expect(useSettings.getState().hydrated).toBe(true);
  });

  it('settings saved before the chooser existed hydrate to English, the rest intact', async () => {
    useSettings.setState({ language: 'ru' });
    await flush();
    await stored({ consumption: '7.5', onboarded: true, backupDirUri: 'content://tree' });
    await useSettings.persist.rehydrate();
    const s = useSettings.getState();
    expect(s.language).toBe('en');
    expect(s.consumption).toBe('7.5');
    expect(s.onboarded).toBe(true);
    expect(s.backupDirUri).toBe('content://tree');
  });

  it('an unknown stored language reads as English', async () => {
    await stored({ language: 'de', onboarded: true });
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().language).toBe('en');
  });
});
