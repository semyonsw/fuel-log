import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_MODEL } from '../lib/models';
import { SETTINGS_KEY, useSettings } from './settings';

/**
 * The settings store against the in-memory AsyncStorage stub: what it writes
 * out, what it reads back, and that a 1.7.x blob (language, budgets, Gemini
 * model) hydrates to the keys this build knows (the model among them) and
 * nothing else.
 */

/** Let the persist middleware's async write land. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const stored = (state: unknown) =>
  AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, state }));

beforeEach(async () => {
  await flush();
  useSettings.setState({
    consumption: '',
    geminiModel: DEFAULT_MODEL,
    apiKey: '',
    onboarded: false,
    backupDirUri: undefined,
    lastBackup: undefined,
    hydrated: false,
  });
  await AsyncStorage.removeItem(SETTINGS_KEY);
});

afterEach(async () => {
  await flush();
  await AsyncStorage.removeItem(SETTINGS_KEY);
});

describe('settings', () => {
  it('starts blank and not onboarded', () => {
    const s = useSettings.getState();
    expect(s.consumption).toBe('');
    expect(s.onboarded).toBe(false);
    expect(s.backupDirUri).toBeUndefined();
    expect(s.geminiModel).toBe(DEFAULT_MODEL);
    expect(s.apiKey).toBe('');
  });

  it('persists only the known keys', async () => {
    useSettings.getState().set({ consumption: '7.5', onboarded: true, apiKey: 'AIza-secret' });
    await flush();
    const raw = (await AsyncStorage.getItem(SETTINGS_KEY))!;
    expect(JSON.parse(raw).state).toEqual({
      consumption: '7.5',
      geminiModel: DEFAULT_MODEL,
      onboarded: true,
    });
    // The key lives in the keystore, never in AsyncStorage.
    expect(raw).not.toContain('AIza-secret');
  });

  it('reads back after a relaunch', async () => {
    const lastBackup = { at: 5, ok: true as const, file: 'fuel-log-backup.json' };
    await stored({ consumption: '7', onboarded: true, backupDirUri: 'content://tree', lastBackup });
    await useSettings.persist.rehydrate();
    const s = useSettings.getState();
    expect(s).toMatchObject({
      consumption: '7',
      onboarded: true,
      backupDirUri: 'content://tree',
      lastBackup,
      hydrated: true,
    });
  });

  it('a 1.7.x blob keeps consumption, model, onboarded and the folder, and drops the rest', async () => {
    await stored({
      consumption: '7.5',
      onboarded: true,
      backupDirUri: 'content://tree',
      language: 'ru',
      fuelBudget: '60000',
      expenseBudget: '20000',
      geminiModel: 'gemini-3.8-flash',
    });
    await useSettings.persist.rehydrate();
    const s = useSettings.getState() as unknown as Record<string, unknown>;
    expect(s).toMatchObject({
      consumption: '7.5',
      geminiModel: 'gemini-3.8-flash',
      onboarded: true,
      backupDirUri: 'content://tree',
    });
    for (const k of ['language', 'fuelBudget', 'expenseBudget']) {
      expect(s).not.toHaveProperty(k);
    }
  });

  it('the next write leaves the retired keys behind', async () => {
    await stored({ consumption: '7', onboarded: true, language: 'hy', fuelBudget: '1' });
    await useSettings.persist.rehydrate();
    useSettings.getState().set({ consumption: '8' });
    await flush();
    const blob = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY))!);
    expect(blob.state).toEqual({ consumption: '8', geminiModel: DEFAULT_MODEL, onboarded: true });
  });

  it('a stored model this build no longer offers reads back as the default', async () => {
    await stored({ consumption: '7', geminiModel: 'gemini-2.0-flash', onboarded: true });
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().geminiModel).toBe(DEFAULT_MODEL);
  });

  it('a stored value of the wrong type is ignored, the default kept', async () => {
    await stored({ consumption: 7, onboarded: 'yes', backupDirUri: null, geminiModel: 3 });
    await useSettings.persist.rehydrate();
    const s = useSettings.getState();
    expect(s.consumption).toBe('');
    expect(s.onboarded).toBe(false);
    expect(s.backupDirUri).toBeUndefined();
    expect(s.geminiModel).toBe(DEFAULT_MODEL);
  });
});
