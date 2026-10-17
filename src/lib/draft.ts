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

import { t } from '../i18n';
import type { Entry, EntryKind, FuelGrade, TrackPoint } from '../types';
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
  station: string;
  address: string;
  grade?: FuelGrade;
  /** A recorded GPS route rides along untouched; only trips keep it. */
  track?: TrackPoint[];
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
    station: '',
    address: '',
    note: '',
  };
}

/**
 * The kinds a form may switch between. Refuels have their own button (the fuel
 * pump) and their own form, apart from the "+" that logs driving: a trip and a
 * range reading both say what the car did, a refuel says what was bought. So a
 * form opened for one group never offers the other, and editing an entry keeps
 * it in its group.
 */
export function formKinds(kind: EntryKind): EntryKind[] {
  return kind === 'refuel' ? ['refuel'] : ['trip', 'reading'];
}

/**
 * A new trip from a finished recording. The GPS distance is only a pre-fill:
 * it lands in the same string field the user types into, so whatever they
 * type over it is what validation reads and what gets saved.
 */
export function draftFromTrack(
  track: TrackPoint[],
  distanceKm: number,
  now: number,
  names: { from?: string; to?: string } = {},
): Draft {
  return {
    ...emptyDraft('trip', now),
    track,
    distance: track.length > 1 ? String(Math.round(distanceKm * 10) / 10) : '',
    from: names.from ?? '',
    to: names.to ?? '',
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
    if (e.track) draft.track = e.track;
  } else if (e.kind === 'refuel') {
    draft.liters = str(e.liters);
    draft.price = str(e.priceAmd);
    draft.station = e.station ?? '';
    draft.address = e.address ?? '';
    if (e.grade) draft.grade = e.grade;
  }
  return draft;
}

// A function, not a constant: the wording follows the language at call time.
const notANumber = () => t('form.err.notNumber');

type Parsed = { value?: number; error?: string };

/** Empty is fine (`required` decides); typed-but-unreadable never is. */
function optional(raw: string): Parsed {
  if (raw.trim() === '') return {};
  const value = parseNumber(raw);
  return value === undefined ? { error: notANumber() } : { value };
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
    if (!from) errors.from = t('form.err.from');
    if (!to) errors.to = t('form.err.to');
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
        ...(d.track && d.track.length > 0 ? { track: d.track } : {}),
      },
    };
  }

  if (d.kind === 'reading') {
    if (range.error) errors.range = range.error;
    else if (range.value === undefined) errors.range = t('form.err.range');
    if (range.value === undefined) return { ok: false, errors };
    return { ok: true, entry: { ...base, kind: 'reading', rangeKm: range.value } };
  }

  const liters = positive(d.liters, t('form.err.liters'));
  const price = positive(d.price, t('form.err.price'));
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
      ...(normalizePlace(d.station) ? { station: normalizePlace(d.station) } : {}),
      ...(normalizePlace(d.address) ? { address: normalizePlace(d.address) } : {}),
      ...(d.grade ? { grade: d.grade } : {}),
    },
  };
}

/** The same words as the form's labels, so the hint names what the user sees. */
const FIELD_KEYS = {
  from: 'form.from',
  to: 'form.to',
  distance: 'form.distance',
  range: 'form.rangeLeft',
  liters: 'form.liters',
  price: 'form.totalPaid',
} as const satisfies Record<keyof DraftErrors, string>;

const fieldName = (k: keyof DraftErrors) => t(FIELD_KEYS[k]);

/**
 * The one line above Save that says why it is dim: what is missing, then what
 * does not read as a number. Empty when the draft is valid.
 */
export function saveHint(errors: DraftErrors): string {
  const keys = Object.keys(errors) as (keyof DraftErrors)[];
  const nan = notANumber();
  const bad = keys.filter((k) => errors[k] === nan).map(fieldName);
  const need = keys.filter((k) => errors[k] !== nan).map(fieldName);
  return [
    need.length ? t('form.save.need', { fields: need.join(', ') }) : '',
    bad.length ? t('form.save.check', { fields: bad.join(', ') }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
