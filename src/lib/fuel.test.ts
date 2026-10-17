import { afterEach, describe, expect, it } from 'vitest';

import { setLang } from '../i18n';

import { at, reading, refuel, trip } from './entries.fixtures';
import { rangeUsedById } from './entries';
import {
  calculate,
  clampCustomRange,
  customPeriod,
  effectiveKmPerLiter,
  fuelCost,
  kmForMoney,
  kmPerLiterFromRefuels,
  latestPricePerLiter,
  shiftDay,
  tripEstimates,
  tripFuelEstimate,
} from './fuel';
import { formatAmd } from './numbers';

describe('latestPricePerLiter', () => {
  it('is undefined with no refuels', () => {
    expect(latestPricePerLiter([reading('r', 0, 100)])).toBeUndefined();
  });

  it('takes the most recent refuel', () => {
    const log = [refuel('a', at(10, 9, 0), 30, 15000), refuel('b', at(12, 9, 0), 20, 10400)];
    expect(latestPricePerLiter(log)).toBe(520);
  });

  it('can be limited to refuels at or before a time', () => {
    const log = [refuel('a', at(10, 9, 0), 30, 15000), refuel('b', at(12, 9, 0), 20, 10400)];
    expect(latestPricePerLiter(log, at(11, 9, 0))).toBe(500);
    expect(latestPricePerLiter(log, at(12, 9, 0))).toBe(520);
    expect(latestPricePerLiter(log, at(9, 9, 0))).toBeUndefined();
  });
});

describe('kmPerLiterFromRefuels', () => {
  it('range gained / litres, from the latest reading before the refuel', () => {
    const log = [reading('r', at(10, 8, 0), 50), refuel('f', at(10, 9, 0), 30, 15000, 290)];
    expect(kmPerLiterFromRefuels(log)).toBe(8);
  });

  it('averages several refuels', () => {
    const log = [
      reading('r1', at(10, 8, 0), 50),
      refuel('f1', at(10, 9, 0), 30, 15000, 290), // 8 km/L
      reading('r2', at(12, 8, 0), 100),
      refuel('f2', at(12, 9, 0), 20, 10000, 300), // 10 km/L
    ];
    expect(kmPerLiterFromRefuels(log)).toBe(9);
  });

  it('skips a refuel without "range after"', () => {
    const log = [reading('r', at(10, 8, 0), 50), refuel('f', at(10, 9, 0), 30, 15000)];
    expect(kmPerLiterFromRefuels(log)).toBeUndefined();
  });

  it('skips a refuel with no reading before it (a reading after does not count)', () => {
    const log = [refuel('f', at(10, 9, 0), 30, 15000, 290), reading('r', at(10, 10, 0), 280)];
    expect(kmPerLiterFromRefuels(log)).toBeUndefined();
  });

  it('skips a refuel the range did not rise across', () => {
    const log = [reading('r', at(10, 8, 0), 300), refuel('f', at(10, 9, 0), 5, 2500, 290)];
    expect(kmPerLiterFromRefuels(log)).toBeUndefined();
  });
});

describe('effectiveKmPerLiter', () => {
  const log = [reading('r', at(10, 8, 0), 50), refuel('f', at(10, 9, 0), 30, 15000, 290)];

  it('typed L/100 km wins over the log', () => {
    expect(effectiveKmPerLiter(log, '8')).toBe(12.5);
    expect(effectiveKmPerLiter(log, '7,5')).toBeCloseTo(13.333, 3);
  });

  it('falls back to the log when blank, zero or unreadable', () => {
    expect(effectiveKmPerLiter(log, '')).toBe(8);
    expect(effectiveKmPerLiter(log, '0')).toBe(8);
    expect(effectiveKmPerLiter(log, 'abc')).toBe(8);
    expect(effectiveKmPerLiter(log, undefined)).toBe(8);
  });

  it('is undefined with neither', () => {
    expect(effectiveKmPerLiter([], '')).toBeUndefined();
  });
});

describe('fuelCost / kmForMoney', () => {
  it('cost = km ÷ kmPerL × price, whole dram', () => {
    expect(fuelCost(100, 8, 500)).toEqual({ liters: 12.5, amd: 6250 });
    expect(fuelCost(22.5, 7.9, 497)!.amd).toBe(Math.round((22.5 / 7.9) * 497));
  });

  it('km = AMD ÷ price × kmPerL, whole km', () => {
    expect(kmForMoney(10000, 8, 500)).toEqual({ liters: 20, km: 160 });
    expect(kmForMoney(1000, 7.9, 497)!.km).toBe(16);
  });

  it('missing or zero inputs give no answer', () => {
    expect(fuelCost(undefined, 8, 500)).toBeUndefined();
    expect(fuelCost(100, undefined, 500)).toBeUndefined();
    expect(fuelCost(100, 8, undefined)).toBeUndefined();
    expect(fuelCost(0, 8, 500)).toBeUndefined();
    expect(kmForMoney(1000, 0, 500)).toBeUndefined();
    expect(kmForMoney(1000, 8, 0)).toBeUndefined();
  });

  it('formats big sums with spaces', () => {
    expect(formatAmd(fuelCost(19920, 8, 500)!.amd)).toBe('1 245 000 AMD');
  });
});

describe('tripFuelEstimate', () => {
  const base = [
    reading('r0', at(10, 8, 0), 50),
    refuel('f', at(10, 9, 0), 30, 15000, 290), // 500 AMD/L, 8 km/L
  ];

  it('uses the trip distance when it has one', () => {
    const t = trip('t', at(11, 9, 0), 'a', 'b', { distanceKm: 16, rangeKm: 270 });
    const log = [...base, t];
    const est = tripFuelEstimate(t, log, rangeUsedById(log).get('t'), 8);
    expect(est).toEqual({ liters: 2, amd: 1000 });
  });

  it('falls back to range used without a distance', () => {
    const t = trip('t', at(11, 9, 0), 'a', 'b', { rangeKm: 274 });
    const log = [...base, t];
    expect(tripFuelEstimate(t, log, rangeUsedById(log).get('t'), 8)).toEqual({
      liters: 2,
      amd: 1000,
    });
  });

  it('is absent with neither distance nor range used', () => {
    const t = trip('t', at(11, 9, 0), 'a', 'b');
    expect(tripFuelEstimate(t, [...base, t], undefined, 8)).toBeUndefined();
  });

  it('is absent before any refuel (no price yet)', () => {
    const t = trip('t', at(9, 9, 0), 'a', 'b', { distanceKm: 10 });
    expect(tripFuelEstimate(t, [...base, t], undefined, 8)).toBeUndefined();
  });

  it('uses the price of the fuel in the tank at the time, not a later one', () => {
    const t = trip('t', at(11, 9, 0), 'a', 'b', { distanceKm: 16 });
    const later = refuel('g', at(12, 9, 0), 10, 6000);
    expect(tripFuelEstimate(t, [...base, t, later], undefined, 8)!.amd).toBe(1000);
  });

  it('is absent without consumption', () => {
    const t = trip('t', at(11, 9, 0), 'a', 'b', { distanceKm: 16 });
    expect(tripFuelEstimate(t, [...base, t], undefined, undefined)).toBeUndefined();
  });
});

describe('customPeriod', () => {
  it('one day is [midnight, next midnight)', () => {
    const [s, e] = customPeriod(at(16, 15, 0), at(16, 15, 0));
    expect(s).toBe(at(16, 0, 0));
    expect(e).toBe(at(17, 0, 0));
  });

  it('spans months', () => {
    const [s, e] = customPeriod(at(28, 12, 0, 8), at(3, 12, 0, 9));
    expect(s).toBe(at(28, 0, 0, 8));
    expect(e).toBe(at(4, 0, 0, 9));
  });

  it('swapped ends still make a valid range', () => {
    const [s, e] = customPeriod(at(5, 0, 0), at(1, 0, 0));
    expect(s).toBe(at(1, 0, 0));
    expect(e).toBe(at(6, 0, 0));
  });

  it('shiftDay crosses month ends by calendar, not by 24 h', () => {
    expect(shiftDay(at(31, 23, 0, 9), 1)).toBe(at(1, 0, 0, 10));
    expect(shiftDay(at(1, 5, 0, 2), -1)).toBe(at(28, 0, 0, 1));
  });
});

describe('clampCustomRange', () => {
  const now = at(16, 19, 5);
  it('TO never passes today, FROM never passes TO', () => {
    expect(clampCustomRange(at(1, 0, 0), at(20, 0, 0), now)).toEqual([at(1, 0, 0), at(16, 0, 0)]);
    expect(clampCustomRange(at(15, 0, 0), at(10, 0, 0), now)).toEqual([at(10, 0, 0), at(10, 0, 0)]);
  });
});

describe('calculate', () => {
  const log = [reading('r', at(10, 8, 0), 50), refuel('f', at(10, 9, 0), 30, 15000, 290)]; // 500 AMD/L, 8 km/L
  const base = { mode: 'km' as const, amount: '100', price: '', consumption: '', entries: log };

  it('cost of km with price and consumption from the log', () => {
    expect(calculate(base)).toEqual({
      ok: true,
      result: 6250,
      unit: 'AMD',
      liters: 12.5,
      price: 500,
    });
  });

  it('km for AMD', () => {
    expect(calculate({ ...base, mode: 'amd', amount: '10 000' })).toMatchObject({
      result: 160,
      unit: 'km',
    });
  });

  it('typed price and consumption win', () => {
    expect(calculate({ ...base, price: '520', consumption: '10' })).toMatchObject({
      result: 5200,
      price: 520,
    });
  });

  it('names the first missing input', () => {
    expect(calculate({ ...base, amount: '' })).toEqual({ ok: false, missing: 'Enter a distance' });
    expect(calculate({ ...base, mode: 'amd', amount: 'x' })).toEqual({
      ok: false,
      missing: 'Enter an amount',
    });
    expect(calculate({ ...base, entries: [] })).toEqual({
      ok: false,
      missing: 'Enter the price per litre',
    });
    expect(calculate({ ...base, entries: [refuel('f', 0, 30, 15000)] })).toEqual({
      ok: false,
      missing: 'Set consumption in Settings to calculate',
    });
    expect(
      calculate({ ...base, entries: [refuel('f', 0, 30, 15000)], consumption: '8' }),
    ).toMatchObject({ ok: true, result: 4000 });
  });
});

describe('tripEstimates', () => {
  it('matches tripFuelEstimate for every trip', () => {
    const log = [
      reading('r0', at(10, 8, 0), 50),
      refuel('f', at(10, 9, 0), 30, 15000, 290),
      trip('a', at(9, 9, 0), 'x', 'y', { distanceKm: 10 }), // before any refuel
      trip('b', at(11, 9, 0), 'x', 'y', { distanceKm: 16, rangeKm: 270 }),
      trip('c', at(11, 10, 0), 'y', 'x', { rangeKm: 262 }), // range used only
      refuel('g', at(12, 9, 0), 10, 6000),
      trip('d', at(12, 9, 0), 'x', 'z', { distanceKm: 8 }), // same instant as refuel g
    ];
    const used = rangeUsedById(log);
    const all = tripEstimates(log, used, 8);
    for (const t of log) {
      if (t.kind !== 'trip') continue;
      expect(all.get(t.id)).toEqual(tripFuelEstimate(t, log, used.get(t.id), 8));
    }
    expect(all.has('a')).toBe(false);
    expect(all.get('d')!.amd).toBe(600);
  });
});

describe('calculate in Russian', () => {
  afterEach(() => setLang('en'));

  it('names the missing input in the current language', () => {
    setLang('ru');
    expect(
      calculate({
        mode: 'km',
        amount: '100',
        price: '',
        consumption: '',
        entries: [refuel('f', 0, 30, 15000)],
      }),
    ).toEqual({
      ok: false,
      missing: 'Укажите расход в Настройках для расчёта',
    });
  });
});
