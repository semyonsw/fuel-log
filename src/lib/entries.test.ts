import { afterEach, describe, expect, it } from 'vitest';

import { setLang } from '../i18n';

import {
  currentRangeKm,
  dayKey,
  dayLabel,
  formatTime,
  groupByDay,
  periodStart,
  rangeUsedById,
  routeLabel,
  sortNewestFirst,
  summarize,
} from './entries';
import { at, reading, realNotes, refuel, trip } from './entries.fixtures';

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

describe('routeLabel', () => {
  it('joins from, stops and to', () => {
    expect(routeLabel(trip('t', 0, '4micro', 'work', { stops: ['Erebuni', 'Center'] }))).toBe(
      '4micro → Erebuni → Center → work',
    );
  });

  it('skips empty parts', () => {
    expect(routeLabel(trip('t', 0, '', 'work', { stops: [' ', 'Erebuni'] }))).toBe(
      'Erebuni → work',
    );
    expect(routeLabel(trip('t', 0, '', ''))).toBe('');
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
    });
  });

  it('includes the start of the window and excludes the end', () => {
    const entries = [trip('a', 100, 'x', 'y', { distanceKm: 1 }), trip('b', 200, 'y', 'x')];
    expect(summarize(entries, 100, 200).trips).toBe(1);
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
