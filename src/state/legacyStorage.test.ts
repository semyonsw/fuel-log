import AsyncStorage from '@react-native-async-storage/async-storage';
import { describe, expect, it } from 'vitest';

import { CHATS_KEY, LEGACY_KEY, markLegacyWritten, readLegacy } from './legacyStorage';
import { useSettings } from './settings';
import { STORAGE_KEY, useLog } from './store';

/**
 * The upgrade from 1.7.x run for real against the in-memory AsyncStorage: the
 * stores rehydrate (and write back straight away), and the copy must already
 * hold the blobs exactly as 1.7.x left them.
 */

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const service = { id: 's', kind: 'service', at: 3, category: 'oil', costAmd: 20000 };
const refuel = { id: 'r', kind: 'refuel', at: 2, liters: 30, priceAmd: 15000, grade: '92' };
const reading = { id: 'g', kind: 'reading', at: 1, rangeKm: 200 };

describe('1.7.x safety copy', () => {
  it('is taken before the stores overwrite their blobs, and only once', async () => {
    const oldLog = JSON.stringify({ state: { entries: [reading, refuel, service] }, version: 1 });
    const oldSettings = JSON.stringify({
      state: { consumption: '7', onboarded: true, fuelBudget: '50000', language: 'hy' },
      version: 1,
    });
    const oldChats = JSON.stringify({ state: { chats: [{ id: 'c' }] }, version: 1 });
    await AsyncStorage.setItem(STORAGE_KEY, oldLog);
    await AsyncStorage.setItem('fuel-log/settings/v1', oldSettings);
    await AsyncStorage.setItem(CHATS_KEY, oldChats);

    await Promise.all([useLog.persist.rehydrate(), useSettings.persist.rehydrate()]);
    await flush();

    // 2.0 shows and stores only what it still has...
    expect(useLog.getState().entries.map((e) => e.id)).toEqual(['g', 'r']);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toContain('service');
    expect(useSettings.getState().consumption).toBe('7');
    // ...and the copy holds the 1.7.x blobs untouched.
    const record = await readLegacy();
    expect(record).toEqual({
      written: false,
      blobs: { log: oldLog, settings: oldSettings, chats: oldChats },
    });

    // A second launch (data already cleaned) does not replace the copy.
    await useLog.persist.rehydrate();
    expect(await readLegacy()).toEqual(record);

    // Once written to the folder: only the marker stays, and the chats stay
    // where the chats store reads them.
    await markLegacyWritten();
    expect(await readLegacy()).toEqual({ written: true });
    expect(await AsyncStorage.getItem(CHATS_KEY)).toBe(oldChats);
    await AsyncStorage.removeItem(LEGACY_KEY);
    await AsyncStorage.removeItem(CHATS_KEY);
  });
});
