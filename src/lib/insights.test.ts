import { describe, expect, it } from 'vitest';

import type { Entry } from '../types';
import { at, reading, realNotes, refuel, trip } from './entries.fixtures';
import { buildFacts, findIssues, periodFacts } from './insights';

// Fri 16 Oct 2026, 19:05 — the evening after the real notes.
const now = at(16, 19, 5);

describe('buildFacts on the real notes', () => {
  const f = buildFacts(realNotes, now);

  it('today: two trips, 23.5 km driven, 29 km of range used', () => {
    expect(f.today).toMatchObject({
      from: '2026-10-16',
      trips: 2,
      kmDriven: 23.5,
      rangeUsedKm: 29,
      refuels: 0,
      fuelAmd: 0,
      avgAmdPerLiter: null,
    });
  });

  it('this week (from Monday) and this month hold all four trips', () => {
    expect(f.thisWeek.from).toBe('2026-10-12');
    // 22.5 + 23 (t2 had no distance, so its range used stands in) + 14 + 9.5
    expect(f.thisWeek).toMatchObject({ trips: 4, kmDriven: 69 });
    expect(f.thisMonth).toMatchObject({ month: '2026-10', trips: 4, rangeUsedKm: 68 });
    expect(f.lastMonth).toMatchObject({ month: '2026-09', trips: 0 });
  });

  it('six months, oldest first, ending with this one', () => {
    expect(f.byMonth.map((m) => m.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
  });

  it('current range, and when it was read', () => {
    expect(f.currentRangeKm).toBe(54);
    expect(f.currentRangeAt).toBe('2026-10-16 18:40');
  });

  it('pace and forecast: 68 km of range over ~2.3 days, reserve reached in about a day', () => {
    expect(f.rangeUsedPerDay).toBeGreaterThan(0);
    expect(f.refuelForecast).not.toBeNull();
    expect(f.refuelForecast!.reserveKm).toBe(50);
    expect(f.refuelForecast!.daysLeft).toBeLessThan(1);
  });
});

describe('money facts', () => {
  const log: Entry[] = [
    { ...refuel('a', at(3, 9, 0), 20, 10000), grade: '92' },
    { ...refuel('b', at(10, 9, 0), 30, 16500), grade: '95' },
    { id: 's', at: at(11, 9, 0), kind: 'service', category: 'oil', costAmd: 25000 },
    { id: 'x', at: at(12, 9, 0), kind: 'expense', category: 'wash', amountAmd: 2000 },
    { ...refuel('old', at(20, 9, 0, 8), 10, 4800), grade: '92' },
  ];
  const f = buildFacts(log, now);

  it('totals fuel, service and expenses separately and together', () => {
    expect(f.thisMonth).toMatchObject({
      refuels: 2,
      liters: 50,
      fuelAmd: 26500,
      serviceAmd: 25000,
      expenseAmd: 2000,
      totalAmd: 53500,
      avgAmdPerLiter: 530,
    });
    expect(f.lastMonth).toMatchObject({ refuels: 1, fuelAmd: 4800 });
  });

  it('latest price per litre per grade', () => {
    expect(f.latestPricePerLiter).toEqual({ '92': 500, '95': 550 });
  });

  it('periodFacts is empty for an empty span', () => {
    expect(periodFacts(log, 0, 1)).toMatchObject({ trips: 0, totalAmd: 0 });
  });
});

describe('findIssues', () => {
  it('the same refuel twice within a short time', () => {
    const log = [refuel('a', at(15, 10, 0), 20, 10000), refuel('b', at(15, 11, 0), 20, 10000)];
    expect(findIssues(log)).toContainEqual({ type: 'duplicate-refuel', ids: ['a', 'b'] });
    // A day apart it is just a habit.
    const apart = [refuel('a', at(14, 10, 0), 20, 10000), refuel('b', at(15, 11, 0), 20, 10000)];
    expect(findIssues(apart).some((i) => i.type === 'duplicate-refuel')).toBe(false);
  });

  it('range jumping up without a refuel; a small re-estimate is not flagged', () => {
    const log = [reading('r1', at(15, 9, 0), 100), reading('r2', at(15, 10, 0), 150)];
    expect(findIssues(log)).toContainEqual({
      type: 'range-rose-without-refuel',
      ids: ['r1', 'r2'],
      fromKm: 100,
      toKm: 150,
    });
    const small = [reading('r1', at(15, 9, 0), 100), reading('r2', at(15, 10, 0), 105)];
    expect(findIssues(small)).toEqual([]);
    const filled = [
      reading('r1', at(15, 9, 0), 100),
      refuel('f', at(15, 9, 30), 20, 10000),
      reading('r2', at(15, 10, 0), 400),
    ];
    expect(findIssues(filled).some((i) => i.type === 'range-rose-without-refuel')).toBe(false);
  });

  it('refuels missing grade or station; trips with neither distance nor range', () => {
    const issues = findIssues([
      refuel('f', at(15, 9, 0), 20, 10000),
      trip('t', at(15, 10, 0), 'a', 'b'),
    ]);
    expect(issues).toContainEqual({
      type: 'refuel-missing',
      ids: ['f'],
      missing: ['grade', 'station'],
    });
    expect(issues).toContainEqual({ type: 'trip-without-distance-or-range', ids: ['t'] });
  });

  it('a price per litre far above the usual for its grade', () => {
    const g = (id: string, day: number, amd: number): Entry => ({
      ...refuel(id, at(day, 9, 0), 10, amd),
      grade: '92',
      station: 'Max',
    });
    const issues = findIssues([g('a', 1, 5000), g('b', 3, 5100), g('c', 5, 4900), g('d', 7, 6000)]);
    expect(issues).toEqual([
      { type: 'refuel-price-high', ids: ['d'], grade: '92', perLiter: 600, usualPerLiter: 505 },
    ]);
  });

  it('the real notes are clean', () => {
    expect(findIssues(realNotes)).toEqual([]);
  });
});
