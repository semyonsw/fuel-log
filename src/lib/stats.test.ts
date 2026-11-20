import { describe, expect, it } from 'vitest';

import type { Entry } from '../types';
import { at, realNotes, reading, refuel, trip } from './entries.fixtures';
import {
  linePoints,
  monthBounds,
  monthChange,
  monthlyTotals,
  niceCeil,
  refuelTrends,
  topRoutes,
  type MonthTotal,
} from './stats';

/**
 * Months in local time, the trends' missing km/L, and routes merging like
 * the place suggestions do. Fixture months are 0-based (`at(day, h, m,
 * month)`), October 2026 by default. In the real notes the four trips drive
 * 22.5 + 23 (range used, no distance) + 14 + 9.5 = 69 km.
 */

const zero = (start: number): MonthTotal => ({
  start,
  amd: 0,
  km: 0,
  liters: 0,
  refuels: 0,
  trips: 0,
});

describe('monthBounds', () => {
  it('is the local 1st 00:00 to the next 1st 00:00', () => {
    expect(monthBounds(at(16, 19, 0))).toEqual([at(1, 0, 0), at(1, 0, 0, 10)]);
  });

  it('moves by whole months across a year end', () => {
    expect(monthBounds(at(5, 9, 0, 0, 2027), -1)).toEqual([
      at(1, 0, 0, 11, 2026),
      at(1, 0, 0, 0, 2027),
    ]);
  });
});

describe('monthlyTotals', () => {
  it('gives `months` months oldest first, empty ones at 0', () => {
    // Arrange
    const entries: Entry[] = [
      ...realNotes,
      refuel('f1', at(20, 10, 0, 8), 30, 15000),
      refuel('f2', at(17, 12, 0), 20, 10400),
    ];

    // Act
    const months = monthlyTotals(entries, at(20, 9, 0), 3);

    // Assert
    expect(months).toEqual([
      zero(at(1, 0, 0, 7)),
      { start: at(1, 0, 0, 8), amd: 15000, km: 0, liters: 30, refuels: 1, trips: 0 },
      { start: at(1, 0, 0, 9), amd: 10400, km: 69, liters: 20, refuels: 1, trips: 4 },
    ]);
  });

  it('measures the month’s first trip from last month’s reading', () => {
    const entries = [
      reading('r', at(30, 23, 0, 8), 100),
      trip('t', at(1, 8, 0), 'home', 'work', { rangeKm: 90 }),
    ];
    expect(monthlyTotals(entries, at(2, 9, 0), 1)[0].km).toBe(10);
  });

  it('crosses a year end', () => {
    expect(monthlyTotals([], at(5, 9, 0, 0, 2027), 2).map((m) => m.start)).toEqual([
      at(1, 0, 0, 11, 2026),
      at(1, 0, 0, 0, 2027),
    ]);
  });

  it('is empty for zero months', () => {
    expect(monthlyTotals(realNotes, at(20, 9, 0), 0)).toEqual([]);
  });
});

describe('monthChange', () => {
  const months = (a: number, b: number): MonthTotal[] => [
    { ...zero(0), amd: a },
    { ...zero(1), amd: b },
  ];

  it('compares this month with the last', () => {
    expect(monthChange(months(20000, 25000), (m) => m.amd)).toEqual({
      current: 25000,
      previous: 20000,
      diff: 5000,
      ratio: 0.25,
    });
  });

  it('has no ratio after an empty month', () => {
    expect(monthChange(months(0, 5000), (m) => m.amd)).toEqual({
      current: 5000,
      previous: 0,
      diff: 5000,
    });
  });

  it('needs two months', () => {
    expect(monthChange([zero(0)], (m) => m.amd)).toBeUndefined();
  });
});

describe('refuelTrends', () => {
  it('gives every priced refuel, km/L only where range rose across it', () => {
    // Arrange
    const entries: Entry[] = [
      refuel('f2', at(10, 9, 0), 10, 5200),
      refuel('f1', at(1, 10, 0), 20, 10000, 350),
      reading('r', at(1, 9, 0), 50),
      refuel('f0', at(5, 9, 0), 0, 3000),
    ];

    // Act
    const points = refuelTrends(entries);

    // Assert
    expect(points).toEqual([
      {
        at: at(1, 10, 0),
        id: 'f1',
        pricePerLiter: 500,
        kmPerLiter: 15,
        amdPerKm: 500 / 15,
      },
      { at: at(10, 9, 0), id: 'f2', pricePerLiter: 520 },
    ]);
  });

  it('is empty without refuels', () => {
    expect(refuelTrends(realNotes)).toEqual([]);
  });
});

describe('topRoutes', () => {
  const entries: Entry[] = [
    refuel('f', at(14, 9, 0), 10, 5000),
    ...realNotes,
    trip('t5', at(17, 9, 0), ' 4Micro ', 'Charents  School', { distanceKm: 20 }),
    trip('t6', at(17, 10, 0), 'work', ''),
  ];

  it('ranks by trips, then km, merging spellings to the newest', () => {
    expect(topRoutes(entries, 10, 10)).toEqual([
      // t1 priced from 15 km range used, t5 from its 20 km: 1.5 L + 2 L at 500.
      { from: '4Micro', to: 'Charents School', count: 2, km: 42.5, amd: 1750 },
      { from: 'charents school', to: '4micro', count: 1, km: 23, amd: 1150 },
      { from: '4micro', to: 'work', count: 1, km: 14, amd: 900 },
      { from: 'work', to: '4micro', count: 1, km: 9.5, amd: 550 },
    ]);
  });

  it('keeps `limit` routes', () => {
    expect(topRoutes(entries, 1, 10).map((r) => r.count)).toEqual([2]);
    expect(topRoutes(entries, 0, 10)).toEqual([]);
  });

  it('prices nothing without a consumption figure', () => {
    expect(topRoutes(entries, 1)[0].amd).toBe(0);
  });
});

describe('niceCeil', () => {
  it('rounds up to 1, 2 or 5 × 10ⁿ', () => {
    expect(niceCeil(47300)).toBe(50000);
    expect(niceCeil(15000)).toBe(20000);
    expect(niceCeil(10000)).toBe(10000);
    expect(niceCeil(101)).toBe(200);
    expect(niceCeil(0.3)).toBe(0.5);
  });

  it('is 0 for nothing', () => {
    expect(niceCeil(0)).toBe(0);
    expect(niceCeil(-5)).toBe(0);
  });
});

describe('linePoints', () => {
  const pad = { x: 10, top: 10, bottom: 10 };

  it('spreads points by order, highest value at the top', () => {
    expect(linePoints([500, 520, 510], 120, 60, pad)).toEqual([
      { x: 10, y: 50 },
      { x: 60, y: 10 },
      { x: 110, y: 30 },
    ]);
  });

  it('puts a single point in the middle and a flat series at mid-height', () => {
    expect(linePoints([500], 120, 60, pad)).toEqual([{ x: 60, y: 30 }]);
    expect(linePoints([8, 8], 120, 60, pad).map((p) => p.y)).toEqual([30, 30]);
  });

  it('is empty for no data', () => {
    expect(linePoints([], 120, 60, pad)).toEqual([]);
  });
});
