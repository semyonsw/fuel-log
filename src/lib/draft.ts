/**
 * The add/edit form, as data.
 *
 * Every field is the raw string a `TextInput` hands back, because the form has to
 * be able to hold "33," half-typed, or a distance the user cleared on purpose,
 * without the model rounding it away mid-keystroke. Turning that into an `Entry`
 * happens once, on save, in `validateDraft` — the single place that knows which
 * fields each kind needs.
 *
 * One draft serves all three kinds so that switching the kind toggle does not
 * throw away what was typed; validation then takes ONLY the fields that belong to
 * the chosen kind, so a trip that was briefly a refuel never saves with liters.
 *
 * Errors are keyed by field and worded as the question the field asks, because
 * they are shown under the input itself, not in a banner.
 */

import type { Entry, EntryKind } from '../types';
import { parseNumber } from './numbers';
import { normalizePlace } from './places';

export type Draft = {
  kind: EntryKind;
  at: number;
  from: string;
  stops: string[];
  to: string;
  distance: string;
  range: string;
  liters: string;
  price: string;
  note: string;
};

export type DraftErrors = Partial<
  Record<'from' | 'to' | 'distance' | 'range' | 'liters' | 'price', string>
>;

export function emptyDraft(kind: EntryKind, now: number): Draft {
  return {
    kind,
    at: now,
    from: '',
    stops: [],
    to: '',
    distance: '',
    range: '',
    liters: '',
    price: '',
    note: '',
  };
}

function str(n: number | undefined): string {
  return n === undefined ? '' : String(n);
}

/** An entry back into form strings, for editing. */
export function draftFromEntry(e: Entry): Draft {
  const draft = emptyDraft(e.kind, e.at);
  draft.range = str(e.rangeKm);
  draft.note = e.note ?? '';
  if (e.kind === 'trip') {
    draft.from = e.from;
    draft.stops = [...e.stops];
    draft.to = e.to;
    draft.distance = str(e.distanceKm);
  } else if (e.kind === 'refuel') {
    draft.liters = str(e.liters);
    draft.price = str(e.priceAmd);
  }
  return draft;
}

const NOT_A_NUMBER = 'Not a number';

type Parsed = { value?: number; error?: string };

/** Empty is fine (`required` decides); typed-but-unreadable never is. */
function optional(raw: string): Parsed {
  if (raw.trim() === '') return {};
  const value = parseNumber(raw);
  return value === undefined ? { error: NOT_A_NUMBER } : { value };
}

/** Required and strictly positive — zero liters or a free tank is a slip, not data. */
function positive(raw: string, missing: string): Parsed {
  const parsed = optional(raw);
  if (parsed.error) return parsed;
  return parsed.value === undefined || parsed.value <= 0 ? { error: missing } : parsed;
}

export function validateDraft(
  d: Draft,
  id: string,
): { ok: true; entry: Entry } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const note = d.note.trim();
  const base = { id, at: d.at, ...(note ? { note } : {}) };
  const range = optional(d.range);

  if (d.kind === 'trip') {
    const from = normalizePlace(d.from);
    const to = normalizePlace(d.to);
    const distance = optional(d.distance);
    if (!from) errors.from = 'Where did you start?';
    if (!to) errors.to = 'Where did you end?';
    if (distance.error) errors.distance = distance.error;
    if (range.error) errors.range = range.error;
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    return {
      ok: true,
      entry: {
        ...base,
        kind: 'trip',
        from,
        stops: d.stops.map(normalizePlace).filter((s) => s !== ''),
        to,
        ...(distance.value !== undefined ? { distanceKm: distance.value } : {}),
        ...(range.value !== undefined ? { rangeKm: range.value } : {}),
      },
    };
  }

  if (d.kind === 'reading') {
    if (range.error) errors.range = range.error;
    else if (range.value === undefined) errors.range = 'Enter the range left';
    if (range.value === undefined) return { ok: false, errors };
    return { ok: true, entry: { ...base, kind: 'reading', rangeKm: range.value } };
  }

  const liters = positive(d.liters, 'Enter liters');
  const price = positive(d.price, 'Enter the price');
  if (liters.error) errors.liters = liters.error;
  if (price.error) errors.price = price.error;
  if (range.error) errors.range = range.error;
  if (liters.value === undefined || price.value === undefined || range.error) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    entry: {
      ...base,
      kind: 'refuel',
      liters: liters.value,
      // Money is whole AMD throughout the model.
      priceAmd: Math.round(price.value),
      ...(range.value !== undefined ? { rangeKm: range.value } : {}),
    },
  };
}
