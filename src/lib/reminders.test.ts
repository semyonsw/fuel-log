import { afterEach, describe, expect, it } from 'vitest';

import { setLang } from '../i18n';
import type { Entry, RefuelEntry, ServiceEntry, TripEntry } from '../types';

import {
  addMonths,
  calendarDaysBetween,
  describeReminder,
  reminderStatus,
  SOON_DAYS,
  SOON_KM,
} from './reminders';

const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m, d, h, min).getTime();

const service = (id: string, when: number, extra: Partial<ServiceEntry> = {}): ServiceEntry => ({
  id,
  at: when,
  kind: 'service',
  category: 'oil',
  costAmd: 20000,
  ...extra,
});

const refuel = (id: string, when: number, odometerKm?: number): RefuelEntry => ({
  id,
  at: when,
  kind: 'refuel',
  liters: 30,
  priceAmd: 15000,
  odometerKm,
});

const trip = (id: string, when: number, distanceKm?: number): TripEntry => ({
  id,
  at: when,
  kind: 'trip',
  from: 'a',
  stops: [],
  to: 'b',
  distanceKm,
});

afterEach(() => setLang('en'));

describe('addMonths', () => {
  it('clamps to the end of a shorter month instead of overflowing', () => {
    expect(new Date(addMonths(at(2026, 0, 31), 1)).getDate()).toBe(28);
    expect(new Date(addMonths(at(2026, 0, 31), 1)).getMonth()).toBe(1);
    expect(new Date(addMonths(at(2028, 0, 31), 1)).getDate()).toBe(29); // leap year
    expect(new Date(addMonths(at(2026, 2, 31), 1)).getDate()).toBe(30);
  });
  it('keeps the day and time of day, and crosses the year', () => {
    const d = new Date(addMonths(at(2026, 10, 15, 9, 30), 12));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2027, 10, 15, 9, 30,
    ]);
    expect(new Date(addMonths(at(2026, 7, 31), 6)).getMonth()).toBe(1);
  });
});

describe('calendarDaysBetween', () => {
  it('counts calendar days, not 24-hour blocks', () => {
    expect(calendarDaysBetween(at(2026, 9, 1, 23, 59), at(2026, 9, 2, 0, 1))).toBe(1);
    expect(calendarDaysBetween(at(2026, 9, 2, 8), at(2026, 9, 2, 22))).toBe(0);
    expect(calendarDaysBetween(at(2026, 9, 5), at(2026, 9, 2))).toBe(-3);
  });
});

describe('reminderStatus', () => {
  it('ignores services without a rule, and other kinds entirely', () => {
    const entries: Entry[] = [service('s', at(2026, 0, 1)), refuel('r', at(2026, 0, 2), 50000)];
    expect(reminderStatus(entries, at(2026, 5, 1))).toEqual([]);
  });

  it('date rule: ok, then soon within SOON_DAYS, then due on the day', () => {
    const s = service('s', at(2026, 0, 31), { remindMonths: 1 }); // due Feb 28
    const [ok] = reminderStatus([s], at(2026, 0, 1));
    expect(ok.state).toBe('ok');
    expect(ok.daysLeft).toBe(58);
    const [soon] = reminderStatus([s], at(2026, 1, 28 - SOON_DAYS + 2));
    expect(soon.state).toBe('soon');
    const [today] = reminderStatus([s], at(2026, 1, 28, 8));
    expect(today.state).toBe('due');
    expect(today.daysLeft).toBe(0);
    const [late] = reminderStatus([s], at(2026, 2, 3));
    expect(late.daysLeft).toBe(-3);
    expect(late.state).toBe('due');
    expect(late.kmLeft).toBeUndefined();
  });

  it('only the newest service of a category counts', () => {
    const old = service('old', at(2025, 0, 1), { remindMonths: 6 });
    const fresh = service('new', at(2026, 0, 1), { remindMonths: 12 });
    const rs = reminderStatus([fresh, old], at(2026, 1, 1));
    expect(rs).toHaveLength(1);
    expect(rs[0].serviceId).toBe('new');
    expect(rs[0].state).toBe('ok');
  });

  it('a newer service with no rule clears the category', () => {
    const old = service('old', at(2025, 0, 1), { remindMonths: 6 });
    const fresh = service('new', at(2026, 0, 1));
    expect(reminderStatus([old, fresh], at(2026, 1, 1))).toEqual([]);
  });

  it('categories are independent', () => {
    const oil = service('oil', at(2026, 0, 1), { remindMonths: 6 });
    const tires = service('tires', at(2026, 1, 1), { category: 'tires', remindMonths: 6 });
    expect(reminderStatus([oil, tires], at(2026, 1, 2)).map((r) => r.category)).toEqual([
      'oil',
      'tires',
    ]);
  });

  it('km rule uses the newest odometer reading, exact when no trips follow it', () => {
    const s = service('s', at(2026, 0, 1), { odometerKm: 50000, remindKm: 10000 });
    const [r] = reminderStatus([s, refuel('f', at(2026, 3, 1), 59200)], at(2026, 3, 2));
    expect(r.dueKm).toBe(60000);
    expect(r.odometerNowKm).toBe(59200);
    expect(r.kmLeft).toBe(800);
    expect(r.estimated).toBe(false);
    expect(r.state).toBe('soon');
    expect(r.daysLeft).toBeUndefined();
  });

  it('estimates km since the last reading from trip distances, missing distance as 0', () => {
    const s = service('s', at(2026, 0, 1), { odometerKm: 50000, remindKm: 10000 });
    const entries: Entry[] = [
      s,
      trip('before', at(2025, 11, 31), 999), // before the anchor: already in the odometer
      refuel('f', at(2026, 3, 1), 58000),
      trip('t1', at(2026, 3, 2), 500),
      trip('t2', at(2026, 3, 3)),
      trip('t3', at(2026, 3, 4), 700.5),
    ];
    const [r] = reminderStatus(entries, at(2026, 3, 5));
    expect(r.odometerNowKm).toBe(59200.5);
    expect(r.estimated).toBe(true);
    expect(r.state).toBe('soon');
  });

  it('never lets a lower later reading put the car behind its service odometer', () => {
    const s = service('s', at(2026, 0, 1), { odometerKm: 50000, remindKm: 10000 });
    const [r] = reminderStatus([s, refuel('typo', at(2026, 1, 1), 5000)], at(2026, 1, 2));
    expect(r.odometerNowKm).toBe(50000);
    expect(r.kmLeft).toBe(10000);
  });

  it('with no odometer on the service, a km rule cannot apply', () => {
    const s = service('s', at(2026, 0, 1), { remindKm: 10000 });
    expect(reminderStatus([s, refuel('f', at(2026, 1, 1), 70000)], at(2026, 1, 2))).toEqual([]);
    const both = service('b', at(2026, 0, 1), { remindKm: 10000, remindMonths: 6 });
    const [r] = reminderStatus([both], at(2026, 1, 2));
    expect(r.dueKm).toBeUndefined();
    expect(r.dueAt).toBeDefined();
  });

  it('with both rules, whichever comes first decides', () => {
    const s = service('s', at(2026, 0, 1), {
      odometerKm: 50000,
      remindKm: 10000,
      remindMonths: 12,
    });
    // km due long before the year is up
    const [byKm] = reminderStatus([s, refuel('f', at(2026, 2, 1), 60100)], at(2026, 2, 2));
    expect(byKm.kmState).toBe('due');
    expect(byKm.dateState).toBe('ok');
    expect(byKm.state).toBe('due');
    // the year runs out with hardly any driving
    const [byDate] = reminderStatus([s, trip('t', at(2026, 5, 1), 300)], at(2027, 0, 5));
    expect(byDate.kmState).toBe('ok');
    expect(byDate.dateState).toBe('due');
    expect(byDate.state).toBe('due');
  });

  it('km soon threshold is SOON_KM inclusive, due at zero left', () => {
    const s = service('s', at(2026, 0, 1), { odometerKm: 0, remindKm: 5000 });
    const st = (odo: number) =>
      reminderStatus([s, refuel('f', at(2026, 0, 2), odo)], at(2026, 0, 3))[0];
    expect(st(5000 - SOON_KM - 1).state).toBe('ok');
    expect(st(5000 - SOON_KM).state).toBe('soon');
    expect(st(5000).state).toBe('due');
  });

  it('sorts due before soon before ok', () => {
    const now = at(2026, 5, 1);
    const ok = service('ok', at(2026, 4, 1), { category: 'tires', remindMonths: 12 });
    const soon = service('soon', at(2025, 11, 20), { category: 'inspection', remindMonths: 6 });
    const due = service('due', at(2025, 0, 1), { remindMonths: 6 });
    expect(reminderStatus([ok, soon, due], now).map((r) => r.state)).toEqual(['due', 'soon', 'ok']);
  });
});

describe('describeReminder', () => {
  const now = at(2026, 5, 1);
  it('says days ahead, and km with ≈ when estimated', () => {
    const s = service('s', at(2025, 11, 13), { remindMonths: 6 });
    expect(describeReminder(reminderStatus([s], now)[0])).toBe('in 12 days');
    const k = service('k', at(2026, 0, 1), { odometerKm: 0, remindKm: 10000 });
    const r = reminderStatus(
      [k, refuel('f', at(2026, 4, 1), 9000), trip('t', at(2026, 4, 2), 200)],
      now,
    )[0];
    expect(describeReminder(r)).toBe('in ≈ 800 km');
  });
  it('lists every overdue clock', () => {
    const s = service('s', at(2025, 11, 1, 9), {
      odometerKm: 0,
      remindKm: 10000,
      remindMonths: 6,
    });
    const r = reminderStatus([s, refuel('f', at(2026, 5, 1, 8), 10200)], at(2026, 5, 4))[0];
    expect(describeReminder(r)).toBe('overdue by 3 days / 200 km');
  });
  it('due exactly today reads "due now"', () => {
    const s = service('s', at(2025, 11, 1, 9), { remindMonths: 6 });
    expect(describeReminder(reminderStatus([s], at(2026, 5, 1, 20))[0])).toBe('due now');
  });
  it('is translated with plurals', () => {
    setLang('ru');
    const s = service('s', at(2025, 11, 3), { remindMonths: 6 });
    expect(describeReminder(reminderStatus([s], now)[0])).toBe('через 2 дня');
  });
});
