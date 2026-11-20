import { describe, expect, it } from 'vitest';

import type { Entry } from '../types';
import { at, reading, realNotes, refuel, trip } from './entries.fixtures';
import { buildFacts, findIssues, HISTORY_MONTHS, periodFacts } from './insights';

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
      estDrivingAmd: null,
    });
  });

  it('this week (from Monday), this month and all time hold all four trips', () => {
    expect(f.thisWeek.from).toBe('2026-10-12');
    // 22.5 + 23 (t2 had no distance, so its range used stands in) + 14 + 9.5
    expect(f.thisWeek).toMatchObject({ trips: 4, kmDriven: 69 });
    expect(f.thisMonth).toMatchObject({ month: '2026-10', trips: 4, rangeUsedKm: 68 });
    expect(f.lastMonth).toMatchObject({ month: '2026-09', trips: 0 });
    expect(f.allTime).toMatchObject({ from: '2026-10-15', trips: 4, kmDriven: 69 });
  });

  it('twelve months of history, oldest first, ending with this one', () => {
    expect(f.byMonth).toHaveLength(HISTORY_MONTHS);
    expect(f.byMonth[0].month).toBe('2025-11');
    expect(f.byMonth[HISTORY_MONTHS - 1]).toMatchObject({ month: '2026-10', trips: 4, km: 69 });
  });

  it('top routes: one trip each, so the longest first', () => {
    // t2 had no distance: its 23 km of range used stands in, as on the tiles.
    expect(f.topRoutes[0]).toMatchObject({
      from: 'charents school',
      to: '4micro',
      trips: 1,
      km: 23,
    });
    expect(f.topRoutes).toHaveLength(4);
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

describe('money and trend facts', () => {
  const log: Entry[] = [
    reading('r0', at(3, 8, 0), 40),
    refuel('a', at(3, 9, 0), 20, 10000, 340),
    refuel('b', at(10, 9, 0), 30, 16500),
    trip('t', at(11, 9, 0), 'home', 'work', { distanceKm: 15 }),
    refuel('old', at(20, 9, 0, 8), 10, 4800),
  ];
  const f = buildFacts(log, now);

  it('totals this month, last month and all time', () => {
    expect(f.thisMonth).toMatchObject({
      refuels: 2,
      liters: 50,
      fuelAmd: 26500,
      avgAmdPerLiter: 530,
    });
    expect(f.lastMonth).toMatchObject({ refuels: 1, fuelAmd: 4800 });
    expect(f.allTime).toMatchObject({ refuels: 3, fuelAmd: 31300 });
  });

  it('latest price, km per litre, and a trend point per refuel', () => {
    expect(f.latestPricePerLiter).toBe(550);
    // (340 − 40) / 20 L
    expect(f.kmPerLiter).toBe(15);
    expect(f.refuelTrend.map((p) => p.id)).toEqual(['old', 'a', 'b']);
    expect(f.refuelTrend[1]).toMatchObject({ pricePerLiter: 500, kmPerLiter: 15, amdPerKm: 33.3 });
  });

  it("estimates the driving's cost from the trips", () => {
    // 15 km ÷ 15 km/L × 550 AMD/L
    expect(f.thisMonth.estDrivingAmd).toBe(550);
    expect(f.topRoutes).toEqual([{ from: 'home', to: 'work', trips: 1, km: 15, estAmd: 550 }]);
  });

  it('a typed consumption wins over the log', () => {
    expect(buildFacts(log, now, '10').kmPerLiter).toBe(10);
  });

  it('periodFacts is empty for an empty span', () => {
    expect(periodFacts(log, 0, 1)).toMatchObject({ trips: 0, fuelAmd: 0, estDrivingAmd: null });
  });

  it('an empty log has no figures, not zeros pretending to be data', () => {
    const e = buildFacts([], now);
    expect(e).toMatchObject({
      currentRangeKm: null,
      kmPerLiter: null,
      latestPricePerLiter: null,
      refuelForecast: null,
      issues: [],
      topRoutes: [],
      refuelTrend: [],
    });
    expect(e.allTime.from).toBeNull();
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

  it('a refuel whose range after is not above the reading before', () => {
    const log = [reading('r', at(15, 9, 0), 100), refuel('f', at(15, 9, 30), 20, 10000, 90)];
    expect(findIssues(log)).toEqual([
      { type: 'refuel-range-not-higher', ids: ['r', 'f'], fromKm: 100, toKm: 90 },
    ]);
  });

  it('trips with neither distance nor range', () => {
    expect(findIssues([trip('t', at(15, 10, 0), 'a', 'b')])).toEqual([
      { type: 'trip-without-distance-or-range', ids: ['t'] },
    ]);
  });

  it('a trip using far more range than its distance; traffic is not flagged', () => {
    const log = [
      reading('r', at(15, 9, 0), 300),
      trip('t', at(15, 10, 0), 'a', 'b', { distanceKm: 10, rangeKm: 200 }),
      trip('u', at(15, 11, 0), 'b', 'a', { distanceKm: 10, rangeKm: 180 }),
    ];
    expect(findIssues(log)).toEqual([
      { type: 'trip-range-drop-large', ids: ['t'], distanceKm: 10, rangeUsedKm: 100 },
    ]);
  });

  it('a price per litre far above or below the usual', () => {
    const r = (id: string, day: number, amd: number) => refuel(id, at(day, 9, 0), 10, amd);
    const issues = findIssues([
      r('a', 1, 5000),
      r('b', 3, 5100),
      r('c', 5, 4900),
      r('d', 7, 6000),
      r('e', 9, 500),
    ]);
    expect(issues).toEqual([
      { type: 'refuel-price-odd', ids: ['e'], perLiter: 50, usualPerLiter: 500 },
      { type: 'refuel-price-odd', ids: ['d'], perLiter: 600, usualPerLiter: 500 },
    ]);
  });

  it('the real notes are clean', () => {
    expect(findIssues(realNotes)).toEqual([]);
  });
});
