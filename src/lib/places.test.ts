import { describe, expect, it } from 'vitest';

import { at, reading, realNotes, trip } from './entries.fixtures';
import { normalizePlace, suggestPlaces } from './places';

/**
 * Suggestions come from the trips already logged: most used first, the latest
 * spelling wins, and nothing already on the form is offered again.
 */

describe('normalizePlace', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normalizePlace('  charents   school ')).toBe('charents school');
    expect(normalizePlace('\t4micro\n')).toBe('4micro');
    expect(normalizePlace('   ')).toBe('');
  });
});

describe('suggestPlaces', () => {
  it('ranks the real notes by use, then by most recent use', () => {
    // 4micro ×4; work ×2; charents school ×2 but last used earlier; Erebuni ×1.
    expect(suggestPlaces(realNotes, '')).toEqual(['4micro', 'work', 'charents school', 'Erebuni']);
  });

  it('ignores readings and refuels', () => {
    expect(suggestPlaces([reading('r', 0, 100)], '')).toEqual([]);
  });

  it('merges case and spacing, keeping the most recent spelling', () => {
    const entries = [
      trip('a', at(15, 9, 0), 'charents School', 'home'),
      trip('b', at(15, 10, 0), 'home', ' Charents  school '),
      trip('c', at(14, 9, 0), 'CHARENTS SCHOOL', 'home'),
    ];
    expect(suggestPlaces(entries, '')).toEqual(['Charents school', 'home']);
  });

  it('keeps substring matches, prefix matches first, case-insensitively', () => {
    const entries = [
      trip('a', at(15, 9, 0), 'Mall', 'Small park'),
      trip('b', at(15, 10, 0), 'Small park', 'Mall'),
      trip('c', at(15, 11, 0), 'Small park', 'home'),
    ];
    // "Small park" is used more, but "Mall" starts with the query.
    expect(suggestPlaces(entries, 'MAL')).toEqual(['Mall', 'Small park']);
    expect(suggestPlaces(entries, 'park')).toEqual(['Small park']);
    expect(suggestPlaces(entries, 'zzz')).toEqual([]);
  });

  it('drops excluded places, case-insensitively', () => {
    expect(suggestPlaces(realNotes, '', ['4MICRO', ' work '])).toEqual([
      'charents school',
      'Erebuni',
    ]);
  });

  it('counts a place as From, stop and To alike, most used first', () => {
    const entries = [
      trip('a', 1, 'Home', 'Gym'),
      trip('b', 2, 'Gym', 'Office', { stops: ['Market'] }),
      trip('c', 3, 'Office', 'Gym'),
      trip('d', 4, 'Market', 'Office'),
      trip('e', 5, 'Office', 'Home'),
    ];
    // Office 4 (From 2, To 2), Gym 3, Market 2 (stop 1, From 1), Home 2 (newer use wins the tie).
    expect(suggestPlaces(entries, '')).toEqual(['Office', 'Gym', 'Home', 'Market']);
  });

  it('while typing, prefix matches stay first and each group is most used first', () => {
    const entries = [
      trip('a', 1, 'Mall', 'Small park'),
      trip('b', 2, 'Small park', 'Malatia'),
      trip('c', 3, 'Small park', 'Malatia'),
      trip('d', 4, 'Small park', 'Home'),
    ];
    expect(suggestPlaces(entries, 'mal')).toEqual(['Malatia', 'Mall', 'Small park']);
  });

  it('respects the limit', () => {
    expect(suggestPlaces(realNotes, '', [], 2)).toEqual(['4micro', 'work']);
    expect(suggestPlaces(realNotes, '', [], 0)).toEqual([]);
  });

  it('skips empty place names', () => {
    expect(suggestPlaces([trip('a', 0, ' ', 'home', { stops: [''] })], '')).toEqual(['home']);
  });
});
