/**
 * One table per area of the app (`strings/<area>.ts`). The app is English
 * only; `defineStrings` exists so each area keeps its literal key type (the
 * `const` parameter), which is what makes `StringKey` catch typos.
 */

export type Table<K extends string = string> = Record<K, string>;

export function defineStrings<const E extends Table>(en: E): E {
  return en;
}
