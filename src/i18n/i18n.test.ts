import { describe, expect, it } from 'vitest';

import { plural, t } from './index';
import { STRINGS } from './strings';

describe('tables', () => {
  it('has no empty strings', () => {
    for (const [key, value] of Object.entries(STRINGS)) expect(value.trim(), key).not.toBe('');
  });
});

describe('t', () => {
  it('reads the English table', () => {
    expect(t('common.today')).toBe('Today');
  });

  it('fills {placeholders} and leaves unknown ones alone', () => {
    expect(t('summary.data.entries.other', { n: 3 })).toBe('3 entries');
    expect(t('summary.data.entries.other')).toBe('{n} entries');
  });
});

describe('plural', () => {
  it('uses .one for exactly 1 and .other otherwise', () => {
    expect(plural('summary.data.entries', 1)).toBe('1 entry');
    expect(plural('summary.data.entries', 0)).toBe('0 entries');
    expect(plural('summary.data.entries', 5)).toBe('5 entries');
    expect(plural('summary.data.entries', 1.5)).toBe('1.5 entries');
  });
});
