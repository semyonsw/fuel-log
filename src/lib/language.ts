/**
 * The UI languages the user can pick in Settings.
 *
 * Each is labelled in its own language, so someone who cannot read the current
 * UI can still find theirs. App.tsx hands the stored choice to `i18n.setLang`.
 */

export type Language = 'en' | 'hy' | 'ru';

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'hy', label: 'Հայերեն' },
  { value: 'ru', label: 'Русский' },
];

export const DEFAULT_LANGUAGE: Language = 'en';

/**
 * What a stored value means. Settings written before the chooser existed have
 * no language, and a blob from a future build could name one this build does
 * not know; both fall back to English rather than a blank UI.
 */
export function toLanguage(value: unknown): Language {
  return LANGUAGES.some((l) => l.value === value) ? (value as Language) : DEFAULT_LANGUAGE;
}
