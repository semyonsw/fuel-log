/**
 * The real notes, as entries — shared by the lib tests so every derived number is
 * checked against the same day the app was designed from.
 *
 *   15.10.2026  12:49 / 122km benzin
 *               13:31 / 22.5km 4micro - charents school / 107km benzin
 *               20:16 / 106km benzin
 *               21:00 / charents school - 4micro / 83km benzin
 *   16.10.2026  08:10 / 4micro - Erebuni - work / 65km benzin
 *               18:40 / work - 4micro / 54km benzin
 */

import type { Entry, ReadingEntry, RefuelEntry, TripEntry } from '../types';

export const at = (day: number, h: number, m: number, month = 9, year = 2026) =>
  new Date(year, month, day, h, m).getTime();

export const trip = (
  id: string,
  when: number,
  from: string,
  to: string,
  extra: Partial<TripEntry> = {},
): TripEntry => ({ id, at: when, kind: 'trip', from, stops: [], to, ...extra });

export const reading = (id: string, when: number, rangeKm: number): ReadingEntry => ({
  id,
  at: when,
  kind: 'reading',
  rangeKm,
});

export const refuel = (
  id: string,
  when: number,
  liters: number,
  priceAmd: number,
  rangeKm?: number,
): RefuelEntry => ({
  id,
  at: when,
  kind: 'refuel',
  liters,
  priceAmd,
  ...(rangeKm !== undefined ? { rangeKm } : {}),
});

export const realNotes: Entry[] = [
  reading('r1', at(15, 12, 49), 122),
  trip('t1', at(15, 13, 31), '4micro', 'charents school', { distanceKm: 22.5, rangeKm: 107 }),
  reading('r2', at(15, 20, 16), 106),
  trip('t2', at(15, 21, 0), 'charents school', '4micro', { rangeKm: 83 }),
  trip('t3', at(16, 8, 10), '4micro', 'work', { stops: ['Erebuni'], distanceKm: 14, rangeKm: 65 }),
  trip('t4', at(16, 18, 40), 'work', '4micro', { distanceKm: 9.5, rangeKm: 54 }),
];
