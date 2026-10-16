import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { at, reading, realNotes, trip } from '../lib/entries.fixtures';
import { STORAGE_KEY, sanitizeEntries, useLog } from './store';

/**
 * The log store, run for real against the in-memory AsyncStorage stub: the three
 * edits, a write and read back across a "relaunch", and the blobs a phone can
 * actually have on disk — nothing, garbage, or a half-valid list.
 */

/** Let the persist middleware's async write land. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const stored = (state: unknown) =>
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, state }));

beforeEach(async () => {
  await flush();
  useLog.setState({ entries: [], hydrated: false });
  await AsyncStorage.removeItem(STORAGE_KEY);
});

afterEach(async () => {
  await flush();
  await AsyncStorage.removeItem(STORAGE_KEY);
});

describe('edits', () => {
  it('adds', () => {
    useLog.getState().add(reading('r1', at(15, 12, 49), 122));
    useLog.getState().add(reading('r2', at(15, 20, 16), 106));
    expect(useLog.getState().entries.map((e) => e.id)).toEqual(['r2', 'r1']);
  });

  it('adding an existing id replaces it rather than duplicating', () => {
    useLog.getState().add(reading('r1', 0, 122));
    useLog.getState().add(reading('r1', 0, 120));
    expect(useLog.getState().entries).toEqual([reading('r1', 0, 120)]);
  });

  it('updates in place by id', () => {
    useLog.getState().add(reading('r1', 0, 122));
    useLog.getState().add(trip('t1', 1, 'a', 'b'));
    useLog.getState().update(trip('t1', 1, 'a', 'c', { rangeKm: 107 }));
    expect(useLog.getState().entries).toEqual([
      trip('t1', 1, 'a', 'c', { rangeKm: 107 }),
      reading('r1', 0, 122),
    ]);
  });

  it('ignores an update for an unknown id, without a new array', () => {
    useLog.getState().add(reading('r1', 0, 122));
    const before = useLog.getState().entries;
    useLog.getState().update(reading('nope', 0, 1));
    expect(useLog.getState().entries).toBe(before);
  });

  it('removes by id', () => {
    useLog.getState().add(reading('r1', 0, 122));
    useLog.getState().add(reading('r2', 1, 106));
    useLog.getState().remove('r1');
    useLog.getState().remove('missing');
    expect(useLog.getState().entries.map((e) => e.id)).toEqual(['r2']);
  });
});

describe('persistence', () => {
  it('writes only the entries, under fuel-log/v1, version 1', async () => {
    useLog.getState().add(reading('r1', 0, 122));
    await flush();
    const blob = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
    expect(blob).toEqual({ version: 1, state: { entries: [reading('r1', 0, 122)] } });
  });

  it('reads the real notes back after a relaunch', async () => {
    for (const e of realNotes) useLog.getState().add(e);
    await flush();
    const written = useLog.getState().entries;

    // A relaunch: memory is empty, the disk is not. Resetting memory goes through
    // the persist middleware and would overwrite the disk, so put the blob back.
    const blob = (await AsyncStorage.getItem(STORAGE_KEY))!;
    useLog.setState({ entries: [], hydrated: false });
    await flush();
    await AsyncStorage.setItem(STORAGE_KEY, blob);
    await useLog.persist.rehydrate();
    expect(useLog.getState().entries).toEqual(written);
    expect(useLog.getState().hydrated).toBe(true);
  });

  it('is hydrated with nothing stored, keeping what is in memory', async () => {
    useLog.setState({ entries: [reading('r1', 0, 1)], hydrated: false });
    await AsyncStorage.removeItem(STORAGE_KEY);
    await useLog.persist.rehydrate();
    expect(useLog.getState().hydrated).toBe(true);
    expect(useLog.getState().entries).toEqual([reading('r1', 0, 1)]);
  });

  it('recovers to an empty log when entries is not an array', async () => {
    useLog.setState({ entries: [reading('r1', 0, 1)] });
    await stored({ entries: 'oops' });
    await useLog.persist.rehydrate();
    expect(useLog.getState().entries).toEqual([]);
    expect(useLog.getState().hydrated).toBe(true);
  });

  it('recovers from a blob that is not JSON at all', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{"version":1,"state":{"entr');
    await useLog.persist.rehydrate();
    expect(useLog.getState().hydrated).toBe(true);
    expect(Array.isArray(useLog.getState().entries)).toBe(true);
  });

  it('keeps the valid rows of a half-valid list', async () => {
    await stored({
      entries: [reading('ok', 0, 5), null, { id: 1 }, { id: 'x', at: 0, kind: 'boat' }],
    });
    await useLog.persist.rehydrate();
    expect(useLog.getState().entries).toEqual([reading('ok', 0, 5)]);
  });
});

describe('sanitizeEntries', () => {
  it('turns anything that is not an array into []', () => {
    expect(sanitizeEntries(undefined)).toEqual([]);
    expect(sanitizeEntries({})).toEqual([]);
    expect(sanitizeEntries('[]')).toEqual([]);
  });
});
