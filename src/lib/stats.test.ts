import { describe, expect, it } from 'vitest';

import type { Entry, ExpenseEntry, FuelGrade, RefuelEntry, ServiceEntry } from '../types';
import { at, reading, refuel, trip } from './entries.fixtures';
import {
  budgetStatus,
  daysInMonth,
  FORECAST_FROM_DAY,
  gradeStats,
  linePoints,
  monthBounds,
  monthForecast,
  monthlySpending,
  niceCeil,
  parseBudget,
  pricePerLiterPoints,
  spendingIn,
  stationStats,
} from './stats';

/**
 * Months in local time, budgets either side of the line, the forecast's
 * "too early", stations merging like the chips do, and charts with holes.
 * Fixture months are 0-based (`at(day, h, m, month)`), October 2026 by default.
 */

const service = (id: string, when: number, costAmd: number): ServiceEntry => ({
  id,
  at: when,
  kind: 'service',
  category: 'oil',
  costAmd,
});
const expense = (id: string, when: number, amountAmd: number): ExpenseEntry => ({
  id,
  at: when,
  kind: 'expense',
  category: 'insurance',
  amountAmd,
});
const fill = (
  id: string,
  when: number,
  liters: number,
  priceAmd: number,
  extra: Partial<RefuelEntry> = {},
): RefuelEntry => ({ ...refuel(id, when, liters, priceAmd), ...extra });

describe('monthBounds', () => {
  it('is the local 1st 00:00 to the next 1st 00:00', () => {
    expect(monthBounds(at(16, 19, 0))).toEqual([at(1, 0, 0), at(1, 0, 0, 10)]);
  });

  it('moves by whole months across a year end', () => {
    expect(monthBounds(at(5, 9, 0, 0, 2027), -1)).toEqual([
      at(1, 0, 0, 11, 2026),
      at(1, 0, 0, 0, 2027),
    ]);
    expect(monthBounds(at(31, 9, 0, 11, 2026), 1)).toEqual([
      at(1, 0, 0, 0, 2027),
      at(1, 0, 0, 1, 2027),
    ]);
  });

  it('puts the last minute of a month in it and midnight in the next', () => {
    const [, end] = monthBounds(at(31, 23, 59));
    expect(at(31, 23, 59)).toBeLessThan(end);
    expect(at(1, 0, 0, 10)).toBe(end);
  });
});

describe('daysInMonth', () => {
  it('knows short months and leap years', () => {
    expect(daysInMonth(at(10, 9, 0, 1, 2026))).toBe(28);
    expect(daysInMonth(at(10, 9, 0, 1, 2028))).toBe(29);
    expect(daysInMonth(at(10, 9, 0, 3))).toBe(30);
    expect(daysInMonth(at(10, 9, 0, 9))).toBe(31);
  });
});

describe('spendingIn', () => {
  it('splits fuel from services and expenses, and stays inside the month', () => {
    const log: Entry[] = [
      refuel('f0', at(30, 23, 59, 8), 10, 5000), // 30 Sep: last month
      refuel('f1', at(1, 0, 0), 20, 10000),
      service('s', at(12, 9, 0), 25000),
      expense('x', at(31, 23, 59), 3000),
      refuel('f2', at(1, 0, 0, 10), 10, 5000), // 1 Nov: next month
      trip('t', at(12, 10, 0), 'a', 'b', { distanceKm: 10 }),
    ];
    const [from, to] = monthBounds(at(16, 9, 0));
    expect(spendingIn(log, from, to)).toEqual({ fuelAmd: 10000, otherAmd: 28000 });
  });
});

describe('parseBudget / budgetStatus', () => {
  it('reads a budget the way amounts are typed, and treats blank or 0 as none', () => {
    expect(parseBudget('60 000')).toBe(60000);
    expect(parseBudget('60000 amd')).toBe(60000);
    expect(parseBudget('')).toBeUndefined();
    expect(parseBudget(undefined)).toBeUndefined();
    expect(parseBudget('0')).toBeUndefined();
    expect(parseBudget('lots')).toBeUndefined();
  });

  it('reads thousands grouped with commas or dots as whole dram, not decimals', () => {
    expect(parseBudget('50,000')).toBe(50000);
    expect(parseBudget('50.000')).toBe(50000);
    expect(parseBudget('1,500,000')).toBe(1500000);
    expect(parseBudget(' 60 000 ')).toBe(60000);
    // Not a grouping: still the usual decimal comma, rounded to whole AMD.
    expect(parseBudget('1,5')).toBe(2);
    expect(parseBudget('50,00')).toBe(50);
  });

  it('is under budget, with what is left', () => {
    expect(budgetStatus(15000, '60000')).toEqual({
      spentAmd: 15000,
      budgetAmd: 60000,
      ratio: 0.25,
      leftAmd: 45000,
      over: false,
    });
  });

  it('is exactly on budget without being over', () => {
    expect(budgetStatus(60000, '60000')?.over).toBe(false);
  });

  it('is over budget, with a negative remainder', () => {
    const s = budgetStatus(75000, '60000');
    expect(s?.over).toBe(true);
    expect(s?.leftAmd).toBe(-15000);
    expect(s?.ratio).toBe(1.25);
  });

  it('is undefined with no budget, however much was spent', () => {
    expect(budgetStatus(75000, '')).toBeUndefined();
  });
});

describe('monthForecast', () => {
  it('is too early on the 1st-3rd', () => {
    expect(FORECAST_FROM_DAY).toBe(4);
    expect(monthForecast(20000, at(1, 20, 0))).toBeUndefined();
    expect(monthForecast(20000, at(3, 23, 59))).toBeUndefined();
  });

  it('is too early with nothing spent', () => {
    expect(monthForecast(0, at(20, 9, 0))).toBeUndefined();
  });

  it('extends the pace so far to the end of the month', () => {
    // 10 000 AMD over 10 days of a 31-day October.
    expect(monthForecast(10000, at(10, 9, 0))).toBe(31000);
    // 4th of a 30-day November: 12 000 / 4 × 30.
    expect(monthForecast(12000, at(4, 0, 0, 10))).toBe(90000);
  });

  it('on the last day is what was spent', () => {
    expect(monthForecast(45678, at(31, 22, 0))).toBe(45678);
  });

  it('rounds to whole dram', () => {
    expect(monthForecast(1000, at(7, 9, 0))).toBe(Math.round((1000 / 7) * 31));
  });
});

describe('monthlySpending', () => {
  const now = at(16, 9, 0); // October 2026

  it('lists the last N months oldest first, keeping empty months at 0', () => {
    const log: Entry[] = [
      refuel('a', at(5, 9, 0, 5), 20, 10000), // June
      expense('b', at(20, 9, 0, 7), 4000), // August
      refuel('c', at(2, 9, 0), 30, 15000), // October
      service('d', at(3, 9, 0), 8000), // October
      refuel('old', at(5, 9, 0, 2), 10, 5000), // March: outside 6 months
    ];
    const months = monthlySpending(log, now);
    expect(months.map((m) => m.key)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(months.map((m) => [m.fuelAmd, m.otherAmd])).toEqual([
      [0, 0],
      [10000, 0],
      [0, 0],
      [0, 4000],
      [0, 0],
      [15000, 8000],
    ]);
    expect(months[5]).toMatchObject({ year: 2026, month: 9 });
  });

  it('crosses a year end', () => {
    const months = monthlySpending([], at(10, 9, 0, 1, 2027), 3);
    expect(months.map((m) => m.key)).toEqual(['2026-12', '2027-01', '2027-02']);
    expect(months.every((m) => m.fuelAmd === 0 && m.otherAmd === 0)).toBe(true);
  });
});

describe('pricePerLiterPoints', () => {
  it('is AMD/L per refuel, oldest first, skipping refuels with no litres', () => {
    const log: Entry[] = [
      refuel('b', at(12, 9, 0), 20, 10400),
      reading('r', at(11, 9, 0), 100),
      refuel('a', at(10, 9, 0), 30, 15000),
      refuel('z', at(13, 9, 0), 0, 1000),
    ];
    expect(pricePerLiterPoints(log)).toEqual([
      { id: 'a', at: at(10, 9, 0), amdPerL: 500 },
      { id: 'b', at: at(12, 9, 0), amdPerL: 520 },
    ]);
  });

  it('is empty with no refuels', () => {
    expect(pricePerLiterPoints([service('s', 0, 100)])).toEqual([]);
  });
});

describe('stationStats', () => {
  const log: Entry[] = [
    fill('a', at(2, 9, 0), 20, 10000, { station: 'max petrol' }),
    fill('b', at(5, 9, 0), 30, 15600, { station: '  Max  Petrol ' }),
    fill('c', at(7, 9, 0), 40, 20400, { station: 'Flash' }),
    fill('d', at(8, 9, 0), 10, 5000),
    fill('e', at(9, 9, 0), 2, 1000, { station: 'Tiny' }),
    fill('old', at(9, 9, 0, 8), 50, 25000, { station: 'Flash' }), // September
  ];
  const [from, to] = monthBounds(at(16, 9, 0));

  it('merges names case-insensitively, showing the latest spelling', () => {
    const max = stationStats(log, from, to).find((s) => s.name === 'Max Petrol');
    expect(max).toEqual({
      name: 'Max Petrol',
      refuels: 2,
      liters: 50,
      amd: 25600,
      amdPerL: 512,
      lastAt: at(5, 9, 0),
    });
  });

  it('sorts by money, keeps to the period, and puts the unnamed group last', () => {
    const stats = stationStats(log, from, to);
    expect(stats.map((s) => s.name)).toEqual(['Max Petrol', 'Flash', 'Tiny', undefined]);
    expect(stats[1].amd).toBe(20400);
    expect(stats[3]).toMatchObject({ refuels: 1, amd: 5000 });
  });

  it('breaks a money tie by the more recent', () => {
    const tie = [
      fill('a', at(2, 9, 0), 10, 5000, { station: 'A' }),
      fill('b', at(3, 9, 0), 10, 5000, { station: 'B' }),
    ];
    expect(stationStats(tie, 0, Infinity).map((s) => s.name)).toEqual(['B', 'A']);
  });

  it('is empty without refuels in the period', () => {
    expect(stationStats(log, at(20, 0, 0), at(21, 0, 0))).toEqual([]);
  });
});

describe('gradeStats', () => {
  const g = (id: string, day: number, liters: number, amd: number, grade?: FuelGrade) =>
    fill(id, at(day, 9, 0), liters, amd, grade ? { grade } : {});

  it('groups by grade with totals and AMD/L, unknown grade last', () => {
    const stats = gradeStats(
      [
        g('a', 2, 20, 10000, '92'),
        g('b', 4, 20, 10400, '92'),
        g('c', 6, 30, 16500, '95'),
        g('d', 8, 100, 60000),
      ],
      0,
      Infinity,
    );
    expect(stats.map((s) => s.grade)).toEqual(['92', '95', undefined]);
    expect(stats[0]).toEqual({
      grade: '92',
      refuels: 2,
      liters: 40,
      amd: 20400,
      amdPerL: 510,
      lastAt: at(4, 9, 0),
    });
    expect(stats[2]).toMatchObject({ refuels: 1, amd: 60000, amdPerL: 600 });
  });

  it('has no AMD/L when no litres were recorded', () => {
    expect(gradeStats([g('a', 2, 0, 1000, '95')], 0, Infinity)[0].amdPerL).toBeUndefined();
  });
});

describe('niceCeil', () => {
  it('rounds up to 1, 2 or 5 × 10ⁿ', () => {
    expect(niceCeil(47300)).toBe(50000);
    expect(niceCeil(15000)).toBe(20000);
    expect(niceCeil(10000)).toBe(10000);
    expect(niceCeil(101)).toBe(200);
    expect(niceCeil(7)).toBe(10);
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

  it('puts a single point in the middle', () => {
    expect(linePoints([500], 120, 60, pad)).toEqual([{ x: 60, y: 30 }]);
  });

  it('draws a flat series at mid-height', () => {
    expect(linePoints([8, 8], 120, 60, pad).map((p) => p.y)).toEqual([30, 30]);
  });

  it('is empty for no data', () => {
    expect(linePoints([], 120, 60, pad)).toEqual([]);
  });
});
