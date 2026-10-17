/**
 * One table per area of the app (`strings/<area>.ts`), English first.
 *
 * `defineStrings` takes the English table and requires the Armenian and
 * Russian ones to have exactly the same keys, so a string added in English
 * without its translations fails typecheck instead of shipping blank.
 */

export type Lang = 'en' | 'hy' | 'ru';

export type Table<K extends string = string> = Record<K, string>;

export function defineStrings<const E extends Table>(
  en: E,
  hy: Table<keyof E & string>,
  ru: Table<keyof E & string>,
): { en: E; hy: Table<keyof E & string>; ru: Table<keyof E & string> } {
  return { en, hy, ru };
}
