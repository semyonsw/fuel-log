import { describe, expect, it } from 'vitest';

import { formatAmd, formatKm, formatLiters, parseNumber } from './numbers';

/**
 * Parsing as the notes were typed ("33,4km", "15 000 amd"), and printing that is
 * the same on every phone because it never touches `Intl`.
 */

describe('parseNumber', () => {
  it.each([
    ['33,4', 33.4],
    ['33.4km', 33.4],
    [' 22.5 km ', 22.5],
    ['15 000', 15000],
    ['15000 amd', 15000],
    ['15 000 AMD', 15000],
    ['1,5', 1.5],
    ['107KM', 107],
    ['30 L', 30],
    ['30l', 30],
    ['12000֏', 12000],
    ['0', 0],
    ['.5', 0.5],
    ['5.', 5],
    ['15 000', 15000],
  ])('%j → %s', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });

  it.each(['', '   ', 'km', 'abc', '-5', '1.2.3', '1,2,3', 'NaN', 'Infinity', '1e5', '12 km l'])(
    '%j → undefined',
    (input) => {
      expect(parseNumber(input)).toBeUndefined();
    },
  );
});

describe('formatting', () => {
  it('prints km with at most one decimal', () => {
    expect(formatKm(22.5)).toBe('22.5 km');
    expect(formatKm(107)).toBe('107 km');
    expect(formatKm(100)).toBe('100 km');
    expect(formatKm(22.46)).toBe('22.5 km');
    expect(formatKm(22.04)).toBe('22 km');
    expect(formatKm(0)).toBe('0 km');
  });

  it('prints liters', () => {
    expect(formatLiters(30)).toBe('30 L');
    expect(formatLiters(32.5)).toBe('32.5 L');
    expect(formatLiters(32.47)).toBe('32.47 L');
  });

  it('groups AMD with spaces and rounds to whole dram', () => {
    expect(formatAmd(15000)).toBe('15 000 AMD');
    expect(formatAmd(999)).toBe('999 AMD');
    expect(formatAmd(1234567)).toBe('1 234 567 AMD');
    expect(formatAmd(14999.6)).toBe('15 000 AMD');
    expect(formatAmd(0)).toBe('0 AMD');
    expect(formatAmd(-2500)).toBe('-2 500 AMD');
  });
});
