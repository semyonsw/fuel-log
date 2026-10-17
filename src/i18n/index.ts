/**
 * The app's three languages: English (source), Armenian and Russian.
 *
 * The current language is module state, not a parameter, because the pure
 * formatters in src/lib (day labels, save hints, durations) are called from
 * dozens of places; threading a `lang` argument through all of them would
 * touch every call site for no gain. App.tsx sets it from the persisted
 * setting and remounts the screens when it changes, so everything re-renders
 * in the new language at once. Tests set it explicitly.
 *
 * Strings are `{name}`-templated. Plurals follow each language's own rules
 * (Russian has three forms after a number; Armenian keeps the noun singular
 * after a number), see `plural`.
 */

import type { Lang } from './define';
import { STRINGS } from './strings';

export type { Lang } from './define';
export type StringKey = keyof (typeof STRINGS)['en'];

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'hy', label: 'Հայերեն' },
  { value: 'ru', label: 'Русский' },
];

let current: Lang = 'en';

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/** The string for `key` in the current language, with `{name}` filled from `vars`. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const raw = STRINGS[current][key] ?? STRINGS.en[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export type PluralForm = 'one' | 'few' | 'many' | 'other';

/** CLDR cardinal category of `n` for `lang` (integers; fractions are "other"). */
export function pluralForm(n: number, lang: Lang = current): PluralForm {
  if (!Number.isInteger(n)) return 'other';
  if (lang === 'ru') {
    const d = Math.abs(n) % 10;
    const h = Math.abs(n) % 100;
    if (d === 1 && h !== 11) return 'one';
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'few';
    return 'many';
  }
  if (lang === 'hy') return n === 0 || n === 1 ? 'one' : 'other';
  return n === 1 ? 'one' : 'other';
}

/**
 * Picks the form for `n`. Keys come as a family: `<base>.one`, `.few`,
 * `.many`, `.other`; a form a language does not use falls back to `.other`.
 */
export function plural(base: string, n: number, vars?: Record<string, string | number>): string {
  const form = pluralForm(n);
  const table = STRINGS[current] as Record<string, string>;
  const key = (
    table[`${base}.${form}`] !== undefined ? `${base}.${form}` : `${base}.other`
  ) as StringKey;
  return t(key, { n, ...vars });
}
