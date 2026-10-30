import { describe, expect, it } from 'vitest';

import { reading, refuel, trip } from './entries.fixtures';
import { sanitizeEntries } from './sanitize';

/**
 * What survives a read-back: rows the app wrote come through unchanged; rows
 * that would put NaN into a summary or crash a string method do not.
 */

const service = (extra: Record<string, unknown> = {}) => ({
  id: 's',
  at: 1,
  kind: 'service',
  category: 'oil',
  costAmd: 25000,
  ...extra,
});

const expense = (extra: Record<string, unknown> = {}) => ({
  id: 'x',
  at: 1,
  kind: 'expense',
  category: 'wash',
  amountAmd: 3000,
  ...extra,
});

describe('sanitizeEntries', () => {
  it('passes well-formed rows of every kind through unchanged', () => {
    const rows = [
      reading('r', 1, 100),
      { ...refuel('f', 2, 30, 15000, 400), station: 'Max', grade: '95', odometerKm: 81000 },
      trip('t', 3, 'a', 'b', { stops: ['c'], distanceKm: 5, track: [{ lat: 1, lon: 2, t: 3 }] }),
      service({ odometerKm: 81000, place: 'Garage', remindKm: 10000, remindMonths: 12 }),
      service({ id: 's0', costAmd: 0 }),
      expense(),
      // The form rounds to whole AMD, so "0.4" is stored as 0; it must not vanish on load.
      expense({ id: 'x0', amountAmd: 0 }),
    ];
    expect(sanitizeEntries(JSON.parse(JSON.stringify(rows)))).toEqual(rows);
  });

  it('keeps every row shape that versions 1.0-1.6 wrote, as written', () => {
    // As JSON from AsyncStorage / a 1.x backup: no services, no expenses, no
    // odometer; optional fields simply absent; a refuel with its price rounded
    // to 0 and a trip with nothing but its places.
    const old = [
      { id: 'r1', at: 1, kind: 'reading', rangeKm: 0 },
      { id: 't1', at: 2, kind: 'trip', from: '', stops: [], to: '' },
      {
        id: 't2',
        at: 3,
        kind: 'trip',
        from: 'a',
        stops: ['b'],
        to: 'c',
        distanceKm: 0,
        rangeKm: 90,
        note: 'n',
      },
      { id: 'f1', at: 4, kind: 'refuel', liters: 0.5, priceAmd: 0 },
      {
        id: 'f2',
        at: 5,
        kind: 'refuel',
        liters: 30,
        priceAmd: 15000,
        rangeKm: 400,
        station: 'Max',
        address: 'Komitas',
        grade: 'diesel',
      },
    ];
    expect(sanitizeEntries(JSON.parse(JSON.stringify(old)))).toEqual(old);
  });

  it('drops rows without an id, a finite time or a known kind', () => {
    expect(
      sanitizeEntries([
        null,
        'x',
        [],
        { id: 1, at: 0, kind: 'reading', rangeKm: 5 },
        { id: 'a', at: null, kind: 'reading', rangeKm: 5 },
        { id: 'b', at: 0, kind: 'boat', rangeKm: 5 },
      ]),
    ).toEqual([]);
  });

  it('drops a refuel whose liters or price would break the sums', () => {
    expect(
      sanitizeEntries([
        { id: 'a', at: 0, kind: 'refuel', liters: '30', priceAmd: 15000 },
        { id: 'b', at: 0, kind: 'refuel', liters: 0, priceAmd: 15000 },
        { id: 'c', at: 0, kind: 'refuel', liters: 30 },
        { id: 'd', at: 0, kind: 'refuel', liters: 30, priceAmd: -1 },
      ]),
    ).toEqual([]);
  });

  it('drops a reading without a range', () => {
    expect(sanitizeEntries([{ id: 'a', at: 0, kind: 'reading', rangeKm: 'full' }])).toEqual([]);
  });

  it('drops a service or expense with an unknown category or a bad amount', () => {
    expect(
      sanitizeEntries([
        service({ category: 'wash' }),
        service({ costAmd: -5 }),
        service({ costAmd: undefined }),
        expense({ category: 'oil' }),
        expense({ amountAmd: -5 }),
        expense({ amountAmd: 'lots' }),
      ]),
    ).toEqual([]);
  });

  it('keeps a row but drops an optional field of the wrong type', () => {
    expect(
      sanitizeEntries([
        { ...reading('r', 0, 100), note: 5 },
        { ...refuel('f', 0, 30, 15000), rangeKm: 'x', station: 7, grade: '80', odometerKm: NaN },
        service({ remindKm: 0, remindMonths: 'soon', place: {} }),
      ]),
    ).toEqual([reading('r', 0, 100), refuel('f', 0, 30, 15000), service()]);
  });

  it('repairs a trip with missing places or stops instead of losing it', () => {
    expect(
      sanitizeEntries([
        { id: 't', at: 0, kind: 'trip', to: 'b', stops: ['x', 3], distanceKm: 'x' },
      ]),
    ).toEqual([trip('t', 0, '', 'b', { stops: ['x'] })]);
  });

  it('drops a malformed track but keeps the trip', () => {
    const bad = { ...trip('t', 0, 'a', 'b'), track: [{ lat: 1, lon: 'x', t: 0 }] };
    expect(sanitizeEntries([bad])).toEqual([trip('t', 0, 'a', 'b')]);
  });

  it('turns anything that is not an array into []', () => {
    expect(sanitizeEntries(undefined)).toEqual([]);
    expect(sanitizeEntries({})).toEqual([]);
  });
});
