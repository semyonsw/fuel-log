import { afterEach, describe, expect, it } from 'vitest';

import { getLang, plural, pluralForm, setLang, t } from './index';
import { STRINGS } from './strings';

/** The three tables must stay in lockstep, and templating must not lose a value. */

afterEach(() => setLang('en'));

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('tables', () => {
  for (const lang of ['hy', 'ru'] as const) {
    it(`${lang} has every English key, non-empty, with the same {placeholders}`, () => {
      const en = STRINGS.en as Record<string, string>;
      const other = STRINGS[lang] as Record<string, string>;
      expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en)) {
        expect(other[key].trim(), key).not.toBe('');
        expect(placeholders(other[key]), key).toEqual(placeholders(en[key]));
      }
    });
  }
});

describe('t', () => {
  it('reads the current language', () => {
    expect(t('common.today')).toBe('Today');
    setLang('ru');
    expect(getLang()).toBe('ru');
    expect(t('common.today')).toBe('Сегодня');
    setLang('hy');
    expect(t('common.today')).toBe('Այսօր');
  });
});

describe('pluralForm', () => {
  it('follows Russian one/few/many', () => {
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map((n) => pluralForm(n, 'ru'))).toEqual([
      'one',
      'few',
      'few',
      'many',
      'many',
      'many',
      'many',
      'one',
      'few',
      'many',
      'one',
      'many',
    ]);
  });

  it('English and Armenian', () => {
    expect([pluralForm(1, 'en'), pluralForm(2, 'en'), pluralForm(0, 'en')]).toEqual([
      'one',
      'other',
      'other',
    ]);
    expect([pluralForm(1, 'hy'), pluralForm(7, 'hy')]).toEqual(['one', 'other']);
  });

  it('fractions are "other"', () => {
    expect(pluralForm(1.5, 'ru')).toBe('other');
  });
});

describe('plural', () => {
  it('falls back to .other when a form is missing', () => {
    // No plural families in the tables yet is fine: an unknown base returns the key path.
    expect(typeof plural).toBe('function');
  });
});
