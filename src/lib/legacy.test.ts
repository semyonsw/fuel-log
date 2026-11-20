import { describe, expect, it } from 'vitest';

import { parseBackup } from './backup';
import { hasLegacyData, legacyBackup, type LegacyBlobs } from './legacy';

const blob = (state: unknown) => JSON.stringify({ state, version: 1 });

const trip = { id: 't', kind: 'trip', at: 1, from: 'A', stops: [], to: 'B', rangeKm: 100 };
const refuel = { id: 'r', kind: 'refuel', at: 2, liters: 30, priceAmd: 15000 };
const service = { id: 's', kind: 'service', at: 3, category: 'oil', costAmd: 20000 };

const none: LegacyBlobs = { log: null, settings: null, chats: null };

describe('hasLegacyData', () => {
  it('a fresh install or a 2.0 log has nothing to keep', () => {
    expect(hasLegacyData(none)).toBe(false);
    expect(hasLegacyData({ ...none, log: blob({ entries: [trip, refuel] }) })).toBe(false);
    expect(
      hasLegacyData({
        log: blob({ entries: [trip] }),
        settings: blob({ consumption: '7', onboarded: true }),
        chats: blob({ chats: [] }),
      }),
    ).toBe(false);
  });

  it('chats alone are not: the chats store keeps them, and a fresh install chats too', () => {
    expect(hasLegacyData({ ...none, chats: blob({ chats: [{ id: 'c' }] }) })).toBe(false);
    expect(
      hasLegacyData({
        log: blob({ entries: [trip] }),
        settings: blob({ consumption: '7', geminiModel: 'gemini-3.8-flash' }),
        chats: blob({ chats: [{ id: 'c', messages: [] }] }),
      }),
    ).toBe(false);
  });

  it('services, expenses, refuel extras and budgets are worth a copy', () => {
    expect(hasLegacyData({ ...none, log: blob({ entries: [trip, service] }) })).toBe(true);
    const expense = { id: 'e', kind: 'expense', at: 4, category: 'wash', amountAmd: 2000 };
    expect(hasLegacyData({ ...none, log: blob({ entries: [expense] }) })).toBe(true);
    expect(hasLegacyData({ ...none, log: blob({ entries: [{ ...refuel, grade: '92' }] }) })).toBe(
      true,
    );
    expect(hasLegacyData({ ...none, settings: blob({ fuelBudget: '50000' }) })).toBe(true);
  });

  it('garbage blobs are not data and do not throw', () => {
    expect(hasLegacyData({ log: '{', settings: 'null', chats: '[]' })).toBe(false);
  });
});

describe('legacyBackup', () => {
  const blobs: LegacyBlobs = {
    log: blob({ entries: [trip, { ...refuel, station: 'Max Petrol' }, service] }),
    settings: blob({ consumption: '8', fuelBudget: '50000', geminiModel: 'm', language: 'hy' }),
    chats: blob({ chats: [{ id: 'c', messages: [] }] }),
  };

  it('keeps every row and field exactly as 1.7.x stored them', () => {
    const file = JSON.parse(legacyBackup(blobs, Date.UTC(2026, 10, 14)));
    expect(file.app).toBe('fuel-log');
    expect(file.format).toBe(1);
    expect(file.appVersion).toBe('1.7.0');
    expect(file.exportedAt).toBe('2026-11-14T00:00:00.000Z');
    expect(file.entries).toEqual([trip, { ...refuel, station: 'Max Petrol' }, service]);
    expect(file.chats).toEqual([{ id: 'c', messages: [] }]);
    expect(file.settings).toEqual({
      consumption: '8',
      geminiModel: 'm',
      fuelBudget: '50000',
      expenseBudget: '',
    });
  });

  it('this build can import it, keeping the kinds it still has and the chats', () => {
    const chat = { id: 'c', title: 'Range', createdAt: 1, updatedAt: 2, messages: [] };
    const r = parseBackup(legacyBackup({ ...blobs, chats: blob({ chats: [chat] }) }, 0));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.entries).toEqual([trip, refuel]);
    expect(r.backup.chats?.map((c) => c.id)).toEqual(['c']);
    expect(r.backup.settings).toEqual({ consumption: '8', geminiModel: 'm' });
  });
});
