/**
 * The app's strings. English only: the Armenian and Russian translations and
 * the language chooser were removed, but the strings stay in tables behind
 * `t` so the copy lives in one place rather than scattered through screens.
 *
 * Strings are `{name}`-templated; plurals pick `<base>.one` or `<base>.other`,
 * see `plural`.
 */

import { STRINGS } from './strings';

export type StringKey = keyof typeof STRINGS;

/** The string for `key`, with `{name}` filled from `vars`. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const raw = STRINGS[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/**
 * Picks `<base>.one` for exactly 1 and `<base>.other` for everything else
 * (0, fractions, many), with `{n}` filled in. A family without `.one` uses
 * `.other` for 1 too.
 */
export function plural(base: string, n: number, vars?: Record<string, string | number>): string {
  const one = `${base}.one`;
  const key = (n === 1 && one in STRINGS ? one : `${base}.other`) as StringKey;
  return t(key, { n, ...vars });
}
