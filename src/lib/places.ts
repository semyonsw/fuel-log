/**
 * Place names, and the suggestions the trip form offers while typing one.
 *
 * The same dozen places recur — "4micro", "charents school", home — so after a
 * week of use most trips should be two taps. The list is derived from the trips
 * already logged rather than kept as its own table: deleting the only trip that
 * mentioned a typo also deletes the typo.
 *
 * Names merge case-insensitively because the notes were typed on a phone
 * keyboard that capitalises at random. The spelling shown is the most RECENT one,
 * so when the user fixes "charents School" to "Charents school" once, the fix
 * sticks without a rename screen.
 */

import type { Entry } from '../types';
import { sortNewestFirst } from './entries';

/** Trimmed, with runs of whitespace collapsed — so "4micro " and "4micro" are one place. */
export function normalizePlace(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

interface PlaceUse {
  name: string;
  count: number;
  lastAt: number;
}

/**
 * Up to `limit` places, most used first (then most recently used). A query keeps
 * substring matches, prefix matches ahead of the rest; `exclude` drops places
 * already on the form, so "from" is never suggested again as "to".
 */
export function suggestPlaces(
  entries: Entry[],
  query: string,
  exclude: string[] = [],
  limit = 8,
): string[] {
  const uses = new Map<string, PlaceUse>();
  // Newest first, so the first spelling seen for a key is the one to keep.
  for (const entry of sortNewestFirst(entries)) {
    if (entry.kind !== 'trip') continue;
    for (const raw of [entry.from, ...entry.stops, entry.to]) {
      const name = normalizePlace(raw);
      if (name === '') continue;
      const key = name.toLowerCase();
      const use = uses.get(key);
      if (use) use.count += 1;
      else uses.set(key, { name, count: 1, lastAt: entry.at });
    }
  }

  const excluded = new Set(exclude.map((s) => normalizePlace(s).toLowerCase()));
  const q = normalizePlace(query).toLowerCase();

  const ranked = [...uses.entries()]
    .filter(([key]) => !excluded.has(key) && key.includes(q))
    .sort(
      ([ka, a], [kb, b]) =>
        Number(kb.startsWith(q)) - Number(ka.startsWith(q)) ||
        b.count - a.count ||
        b.lastAt - a.lastAt ||
        (ka < kb ? -1 : ka > kb ? 1 : 0),
    );
  return ranked.slice(0, Math.max(0, limit)).map(([, use]) => use.name);
}
