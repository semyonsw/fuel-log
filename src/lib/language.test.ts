import { describe, expect, it } from 'vitest';

import { LANGUAGES, toLanguage } from './language';

describe('toLanguage', () => {
  it('keeps every offered language', () => {
    for (const l of LANGUAGES) expect(toLanguage(l.value)).toBe(l.value);
  });

  it('falls back to English for missing or unknown values', () => {
    expect(toLanguage(undefined)).toBe('en');
    expect(toLanguage('de')).toBe('en');
    expect(toLanguage(3)).toBe('en');
  });
});
