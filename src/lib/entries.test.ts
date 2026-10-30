import { afterEach, describe, expect, it } from 'vitest';

import { setLang } from '../i18n';

import {
  entryAmd,
  isCost,
  drivenKm,
  todayLine,
  tripRangeUsedKm,
  currentRangeKm,
  dayKey,
  dayLabel,
  formatTime,
  groupByDay,
  periodStart,
  rangeUsedById,
  sortNewestFirst,
  summarize,
} from './entries';
import { at, reading, realNotes, refuel, trip } from './entries.fixtures';
import type { ExpenseEntry, ServiceEntry } from '../types';

const service = (id: string, when: number, costAmd: number, rangeKm?: number): ServiceEntry => ({
  id,
  at: when,
  kind: 'service',
  category: 'oil',
  costAmd,
  ...(rangeKm !== undefined ? { rangeKm } : {}),
});
const expense = (id: string, when: number, amountAmd: number, rangeKm?: number): ExpenseEntry => ({
  id,
  at: when,
  kind: 'expense',
  category: 'parking',
  amountAmd,
  ...(rangeKm !== undefined ? { rangeKm } : {}),
});

/**
 * The derived numbers, checked against the real notes first and then against the
 * cases that would make them lie: a refuel in between, a dashboard that ticks up.
 */

describe('sortNewestFirst', () => {
  it('orders by time, newest first, without touching the input', () => {
    const input = [...realNotes];
    const sorted = sortNewestFirst(input);
    expect(sorted.map((e) => e.id)).toEqual(['t4', 't3', 't2', 'r2', 't1', 'r1']);
    expect(input).toEqual(realNotes);
    expect(sorted).not.toBe(input);
  });

  it('breaks ties by id, so the order is stable', () => {
    const when = at(15, 9, 0);
    const a = sortNewestFirst([
      reading('a', when, 1),
      reading('c', when, 1),
      reading('b', when, 1),
    ]);
    const b = sortNewestFirst([
      reading('b', when, 1),
      reading('a', when, 1),
      reading('c', when, 1),
    ]);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });
});

describe('rangeUsedById', () => {
  it('reproduces the real notes: 15, 1, 23, 18, 11', () => {
    const used = rangeUsedById(realNotes);
    expect(Object.fromEntries(used)).toEqual({ t1: 15, r2: 1, t2: 23, t3: 18, t4: 11 });
  });

  it('does not depend on input order', () => {
    expect(rangeUsedById([...realNotes].reverse())).toEqual(rangeUsedById(realNotes));
  });

  it('ignores services and expenses, even one that carries a range', () => {
    const withCosts = [
      ...realNotes,
      service('s', at(15, 14, 0), 20000, 999),
      expense('x', at(16, 9, 0), 500, 0),
      expense('y', at(16, 10, 0), 300),
    ];
    expect(rangeUsedById(withCosts)).toEqual(rangeUsedById(realNotes));
    expect(currentRangeKm([...realNotes, expense('z', at(17, 9, 0), 1, 5)])).toBe(54);
  });

  it('has no baseline for the first reading', () => {
    expect(rangeUsedById([reading('r', at(15, 9, 0), 100)]).size).toBe(0);
  });

  it('skips entries without a range, and measures past them', () => {
    const used = rangeUsedById([
      reading('a', at(15, 9, 0), 100),
      trip('b', at(15, 10, 0), 'x', 'y'),
      trip('c', at(15, 11, 0), 'y', 'z', { rangeKm: 90 }),
    ]);
    expect(used.has('b')).toBe(false);
    expect(used.get('c')).toBe(10);
  });

  it('skips a drop that is negative — the dashboard re-estimated upward', () => {
    const used = rangeUsedById([
      reading('a', at(15, 9, 0), 100),
      reading('b', at(15, 10, 0), 104),
      trip('c', at(15, 11, 0), 'x', 'y', { rangeKm: 94 }),
    ]);
    expect(used.has('b')).toBe(false);
    // But the higher reading is still the baseline for the next one.
    expect(used.get('c')).toBe(10);
  });

  it('records a zero drop', () => {
    const used = rangeUsedById([reading('a', at(15, 9, 0), 100), reading('b', at(15, 9, 5), 100)]);
    expect(used.get('b')).toBe(0);
  });

  it('skips the first reading after a refuel with no range', () => {
    const used = rangeUsedById([
      reading('a', at(15, 9, 0), 60),
      refuel('f', at(15, 10, 0), 30, 15000),
      trip('b', at(15, 11, 0), 'x', 'y', { rangeKm: 40 }),
      trip('c', at(15, 12, 0), 'y', 'x', { rangeKm: 30 }),
    ]);
    expect(used.has('f')).toBe(false);
    expect(used.has('b')).toBe(false);
    expect(used.get('c')).toBe(10);
  });

  it('uses a refuel that recorded its range as the new baseline, with no drop of its own', () => {
    const used = rangeUsedById([
      reading('a', at(15, 9, 0), 60),
      refuel('f', at(15, 10, 0), 30, 15000, 400),
      trip('b', at(15, 11, 0), 'x', 'y', { rangeKm: 380 }),
    ]);
    expect(used.has('f')).toBe(false);
    expect(used.get('b')).toBe(20);
  });

  it('never gives a refuel a drop, even when range went down', () => {
    const used = rangeUsedById([
      reading('a', at(15, 9, 0), 60),
      refuel('f', at(15, 10, 0), 2, 1000, 55),
    ]);
    expect(used.size).toBe(0);
  });
});

describe('currentRangeKm', () => {
  it('is the newest recorded range', () => {
    expect(currentRangeKm(realNotes)).toBe(54);
  });

  it('looks past newer entries without one', () => {
    expect(currentRangeKm([...realNotes, trip('x', at(17, 9, 0), 'a', 'b')])).toBe(54);
  });

  it('is undefined for an empty log or one without ranges', () => {
    expect(currentRangeKm([])).toBeUndefined();
    expect(currentRangeKm([trip('x', at(17, 9, 0), 'a', 'b')])).toBeUndefined();
  });
});

describe('days and times', () => {
  const now = at(16, 19, 0);

  it('keys by local day', () => {
    expect(dayKey(at(15, 0, 0))).toBe('2026-10-15');
    expect(dayKey(at(15, 23, 59))).toBe('2026-10-15');
    expect(dayKey(at(5, 8, 0, 0, 2027))).toBe('2027-01-05');
  });

  it('labels today, yesterday, and older days', () => {
    expect(dayLabel('2026-10-16', now)).toBe('Today');
    expect(dayLabel('2026-10-15', now)).toBe('Yesterday');
    expect(dayLabel('2026-10-14', now)).toBe('Wed, 14 Oct');
    expect(dayLabel('2026-01-01', now)).toBe('Thu, 1 Jan');
    expect(dayLabel('2025-10-15', now)).toBe('Wed, 15 Oct 2025');
  });

  it('knows yesterday across a month and a year boundary', () => {
    expect(dayLabel('2026-09-30', at(1, 8, 0))).toBe('Yesterday');
    expect(dayLabel('2025-12-31', at(1, 8, 0, 0))).toBe('Yesterday');
  });

  it('formats 24-hour time, zero-padded', () => {
    expect(formatTime(at(15, 13, 31))).toBe('13:31');
    expect(formatTime(at(15, 0, 5))).toBe('00:05');
    expect(formatTime(at(15, 9, 0))).toBe('09:00');
  });
});

describe('groupByDay', () => {
  it('groups newest day first, newest entry first', () => {
    const groups = groupByDay([...realNotes].reverse(), at(16, 19, 0));
    expect(groups.map((g) => [g.key, g.label])).toEqual([
      ['2026-10-16', 'Today'],
      ['2026-10-15', 'Yesterday'],
    ]);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(['t4', 't3']);
    expect(groups[1]!.entries.map((e) => e.id)).toEqual(['t2', 'r2', 't1', 'r1']);
  });

  it('is empty for an empty log', () => {
    expect(groupByDay([], 0)).toEqual([]);
  });
});

describe('summarize', () => {
  it('totals a window, counting range used from a baseline before it', () => {
    // Only the 16th: t3 is measured from t2 on the 15th.
    const s = summarize(realNotes, at(16, 0, 0), at(17, 0, 0));
    expect(s).toEqual({
      trips: 2,
      distanceKm: 23.5,
      rangeUsedKm: 29,
      refuels: 0,
      liters: 0,
      spentAmd: 0,
      services: 0,
      expenses: 0,
      otherAmd: 0,
    });
  });

  it('totals everything', () => {
    const entries = [...realNotes, refuel('f', at(16, 19, 0), 30, 15000, 400)];
    expect(summarize(entries, 0, Infinity)).toEqual({
      trips: 4,
      distanceKm: 46,
      rangeUsedKm: 68,
      refuels: 1,
      liters: 30,
      spentAmd: 15000,
      services: 0,
      expenses: 0,
      otherAmd: 0,
    });
  });

  it('counts services and expenses as other spending, never as fuel', () => {
    const entries = [
      ...realNotes,
      refuel('f', at(16, 19, 0), 30, 15000, 400),
      service('s', at(16, 9, 0), 25000),
      expense('x', at(16, 10, 0), 500),
    ];
    const s = summarize(entries, 0, Infinity);
    expect(s.spentAmd).toBe(15000);
    expect(s.liters).toBe(30);
    expect(s.services).toBe(1);
    expect(s.expenses).toBe(1);
    expect(s.otherAmd).toBe(25500);
    // Nothing about driving moved.
    expect(s.rangeUsedKm).toBe(68);
    expect(s.trips).toBe(4);
  });

  it('includes the start of the window and excludes the end', () => {
    const entries = [trip('a', 100, 'x', 'y', { distanceKm: 1 }), trip('b', 200, 'y', 'x')];
    expect(summarize(entries, 100, 200).trips).toBe(1);
  });
});

describe('drivenKm', () => {
  // Fri 16 Oct 2026.
  const today = at(16, 0, 0);

  it("uses a trip's own distance", () => {
    const log = [trip('a', at(16, 8, 0), 'x', 'y', { distanceKm: 12.5 })];
    expect(drivenKm(log, today, Infinity)).toBe(12.5);
  });

  it('falls back to range used for a trip with no distance', () => {
    const log = [
      reading('r', at(16, 7, 0), 100),
      trip('a', at(16, 8, 0), 'x', 'y', { rangeKm: 85 }),
      trip('b', at(16, 9, 0), 'y', 'x', { distanceKm: 10, rangeKm: 70 }), // distance wins over 15
    ];
    expect(drivenKm(log, today, Infinity)).toBe(25);
  });

  it('measures range used from a reading on an earlier day', () => {
    const log = [
      reading('r', at(15, 21, 0), 100),
      trip('a', at(16, 8, 0), 'x', 'y', { rangeKm: 90 }),
    ];
    expect(drivenKm(log, today, Infinity)).toBe(10);
  });

  it('leaves out other days, readings and refuels', () => {
    const log = [
      trip('y', at(15, 18, 0), 'x', 'y', { distanceKm: 40 }),
      reading('r', at(16, 7, 0), 100),
      refuel('f', at(16, 8, 0), 20, 10000, 300),
    ];
    expect(drivenKm(log, today, Infinity)).toBe(0);
  });

  it('is 0 for a trip with neither distance nor range used', () => {
    expect(drivenKm([trip('a', at(16, 8, 0), 'x', 'y')], today, Infinity)).toBe(0);
  });

  it('reads the real notes of the 15th: 22.5 km typed + 23 km of range (106 → 83)', () => {
    expect(drivenKm(realNotes, at(15, 0, 0), today)).toBe(45.5);
  });
});

describe('tripRangeUsedKm', () => {
  // Fri 16 Oct 2026.
  const today = at(16, 0, 0);

  it("sums today's trips' range used, whatever their length", () => {
    const log = [
      reading('r', at(16, 7, 0), 100),
      trip('a', at(16, 8, 0), 'x', 'y', { distanceKm: 10, rangeKm: 85 }), // 15
      trip('b', at(16, 9, 0), 'y', 'x', { rangeKm: 70 }), // 15
    ];
    expect(tripRangeUsedKm(log, today, Infinity)).toBe(30);
  });

  it("measures from yesterday's reading and leaves out yesterday's trips", () => {
    const log = [
      reading('r', at(15, 7, 0), 120),
      trip('y', at(15, 21, 0), 'x', 'y', { rangeKm: 100 }),
      trip('a', at(16, 8, 0), 'x', 'y', { rangeKm: 90 }),
    ];
    expect(tripRangeUsedKm(log, today, Infinity)).toBe(10);
  });

  it("leaves out a reading's drop and trips with no range", () => {
    const log = [
      reading('r0', at(16, 7, 0), 100),
      reading('r1', at(16, 8, 0), 95),
      trip('a', at(16, 9, 0), 'x', 'y', { distanceKm: 12 }),
    ];
    expect(tripRangeUsedKm(log, today, Infinity)).toBe(0);
  });
});

describe('todayLine', () => {
  afterEach(() => setLang('en'));

  it('shows length, range used and the cost from range', () => {
    expect(todayLine({ driven: 38.9, used: 45, amd: 2160 })).toBe(
      'Today: 38.9 km driven · 45 km range used · ≈ 2 160 AMD',
    );
  });

  it('leaves out range used when the range did not drop', () => {
    expect(todayLine({ driven: 12, used: 0, amd: 600 })).toBe('Today: 12 km driven · ≈ 600 AMD');
  });

  it('leaves out the cost when there is no estimate', () => {
    expect(todayLine({ driven: 12, used: 15 })).toBe('Today: 12 km driven · 15 km range used');
    expect(todayLine({ driven: 0, used: 0 })).toBe('Today: 0 km driven');
  });

  it('speaks the current language', () => {
    setLang('ru');
    expect(todayLine({ driven: 38.9, used: 45, amd: 2160 })).toBe(
      'Сегодня: проехано 38.9 км · расход запаса 45 км · ≈ 2 160 AMD',
    );
  });
});

describe('periodStart', () => {
  // Fri 16 Oct 2026.
  const now = at(16, 19, 0);

  it('starts today at local midnight', () => {
    expect(periodStart('today', now)).toBe(at(16, 0, 0));
    expect(periodStart('today', at(16, 0, 0))).toBe(at(16, 0, 0));
    expect(periodStart('today', at(16, 23, 59))).toBe(at(16, 0, 0));
  });

  it('puts a drive just before midnight on the day it started', () => {
    const entries = [
      trip('late', at(15, 23, 40), 'x', 'y', { distanceKm: 12 }),
      trip('early', at(16, 0, 10), 'y', 'x', { distanceKm: 5 }),
    ];
    const today = summarize(entries, periodStart('today', now), Infinity);
    expect(today.trips).toBe(1);
    expect(today.distanceKm).toBe(5);
  });

  it('starts the week on Monday at local midnight', () => {
    expect(periodStart('week', now)).toBe(at(12, 0, 0));
  });

  it('treats Sunday as the end of the week, and Monday as its own start', () => {
    expect(periodStart('week', at(18, 23, 0))).toBe(at(12, 0, 0));
    expect(periodStart('week', at(19, 0, 0))).toBe(at(19, 0, 0));
  });

  it('crosses a month boundary', () => {
    // Thu 1 Oct 2026 → Mon 28 Sep.
    expect(periodStart('week', at(1, 10, 0))).toBe(at(28, 0, 0, 8));
  });

  it('starts the month on the 1st', () => {
    expect(periodStart('month', now)).toBe(at(1, 0, 0));
  });

  it('is 0 for all time', () => {
    expect(periodStart('all', now)).toBe(0);
  });
});

describe('dayLabel in other languages', () => {
  const now = at(16, 19, 0);
  afterEach(() => setLang('en'));

  it('Russian: short weekday, genitive month', () => {
    setLang('ru');
    expect(dayLabel('2026-10-16', now)).toBe('Сегодня');
    expect(dayLabel('2026-10-15', now)).toBe('Вчера');
    expect(dayLabel('2026-10-15', at(17, 8, 0))).toBe('Чт, 15 окт');
    expect(dayLabel('2026-05-09', now)).toBe('Сб, 9 мая');
    expect(dayLabel('2025-10-15', now)).toBe('Ср, 15 окт 2025');
  });

  it('Armenian', () => {
    setLang('hy');
    expect(dayLabel('2026-10-16', now)).toBe('Այսօր');
    expect(dayLabel('2026-10-15', now)).toBe('Երեկ');
    expect(dayLabel('2026-10-15', at(17, 8, 0))).toBe('Հնգ, 15 հոկ');
    expect(groupByDay(realNotes, now).map((g) => g.label)).toEqual(['Այսօր', 'Երեկ']);
  });
});

describe('entryAmd / isCost', () => {
  it('reads the money field of each kind', () => {
    expect(entryAmd(refuel('f', 0, 10, 5000))).toBe(5000);
    expect(entryAmd(service('s', 0, 0))).toBe(0);
    expect(entryAmd(expense('x', 0, 700))).toBe(700);
    expect(entryAmd(reading('r', 0, 100))).toBeUndefined();
    expect(entryAmd(trip('t', 0, 'a', 'b'))).toBeUndefined();
  });

  it('marks only services and expenses as costs', () => {
    expect(isCost(service('s', 0, 1))).toBe(true);
    expect(isCost(expense('x', 0, 1))).toBe(true);
    expect(isCost(refuel('f', 0, 10, 5000))).toBe(false);
    expect(isCost(trip('t', 0, 'a', 'b'))).toBe(false);
  });
});
