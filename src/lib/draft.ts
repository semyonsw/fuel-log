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

import { t, type StringKey } from '../i18n';
import type {
  Entry,
  EntryKind,
  ExpenseCategory,
  FuelGrade,
  ServiceCategory,
  TrackPoint,
} from '../types';
import { isExpenseCategory, isServiceCategory } from './categories';
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
  /** Service or expense category; which list depends on `kind`. */
  category?: ServiceCategory | ExpenseCategory;
  /** Refuel (optional) and service odometer, km. */
  odometer: string;
  /** Service only: workshop or place. */
  place: string;
  /** Service only: remind after this many km / months. */
  remindKm: string;
  remindMonths: string;
  /** A recorded GPS route rides along untouched; only trips keep it. */
  track?: TrackPoint[];
  note: string;
};

export type DraftErrors = Partial<
  Record<
    | 'from'
    | 'to'
    | 'distance'
    | 'range'
    | 'liters'
    | 'price'
    | 'category'
    | 'odometer'
    | 'remindKm'
    | 'remindMonths',
    string
  >
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
    odometer: '',
    place: '',
    remindKm: '',
    remindMonths: '',
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
  return kind === 'trip' || kind === 'reading' ? ['trip', 'reading'] : [kind];
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
    draft.odometer = str(e.odometerKm);
  } else if (e.kind === 'service') {
    draft.category = e.category;
    draft.price = str(e.costAmd);
    draft.odometer = str(e.odometerKm);
    draft.place = e.place ?? '';
    draft.remindKm = str(e.remindKm);
    draft.remindMonths = str(e.remindMonths);
  } else if (e.kind === 'expense') {
    draft.category = e.category;
    draft.price = str(e.amountAmd);
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

  if (d.kind === 'service') return validateService(d, base, range);
  if (d.kind === 'expense') {
    // Dram are whole: an amount that rounds to 0 ("0.4") is a slip, not a free expense.
    const typed = positive(d.price, t('kinds.err.amount'));
    const amount =
      typed.value !== undefined && Math.round(typed.value) <= 0
        ? { error: t('kinds.err.amount') }
        : typed;
    if (!isExpenseCategory(d.category)) errors.category = t('kinds.err.category');
    if (amount.error) errors.price = amount.error;
    if (amount.value === undefined || !isExpenseCategory(d.category)) return { ok: false, errors };
    return {
      ok: true,
      entry: {
        ...base,
        kind: 'expense',
        category: d.category,
        amountAmd: Math.round(amount.value),
      },
    };
  }

  const liters = positive(d.liters, t('form.err.liters'));
  const odometer = optional(d.odometer);
  const price = positive(d.price, t('form.err.price'));
  if (liters.error) errors.liters = liters.error;
  if (price.error) errors.price = price.error;
  if (range.error) errors.range = range.error;
  if (odometer.error) errors.odometer = odometer.error;
  if (liters.value === undefined || price.value === undefined || range.error || odometer.error) {
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
      ...(odometer.value !== undefined ? { odometerKm: odometer.value } : {}),
    },
  };
}

/**
 * A service: category and cost (0 allowed: warranty work is still worth a
 * record), optional odometer, place and reminder. A km reminder counts from
 * the odometer, so it needs one; a month reminder counts from the date.
 */
function validateService(
  d: Draft,
  base: { id: string; at: number; note?: string },
  range: Parsed,
): { ok: true; entry: Entry } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const cost = optional(d.price);
  const odometer = optional(d.odometer);
  const remindKm = optional(d.remindKm);
  const remindMonths = optional(d.remindMonths);
  if (!isServiceCategory(d.category)) errors.category = t('kinds.err.category');
  if (cost.error) errors.price = cost.error;
  else if (cost.value === undefined) errors.price = t('kinds.err.cost');
  if (odometer.error) errors.odometer = odometer.error;
  if (remindKm.error) errors.remindKm = remindKm.error;
  else if (Math.round(remindKm.value ?? 0) > 0 && odometer.value === undefined && !odometer.error) {
    errors.odometer = t('kinds.err.remindKmNeedsOdometer');
  }
  if (remindMonths.error) errors.remindMonths = remindMonths.error;
  if (range.error) errors.range = range.error;
  if (Object.keys(errors).length > 0 || !isServiceCategory(d.category)) {
    return { ok: false, errors };
  }
  const place = normalizePlace(d.place);
  // Rounded before the "is it set" test: "0.4" months would otherwise store a
  // 0 rule, which no reminder reads and the next load's sanitizer drops.
  const everyKm = Math.round(remindKm.value ?? 0);
  const everyMonths = Math.round(remindMonths.value ?? 0);
  return {
    ok: true,
    entry: {
      ...base,
      kind: 'service',
      category: d.category,
      costAmd: Math.round(cost.value ?? 0),
      ...(odometer.value !== undefined ? { odometerKm: odometer.value } : {}),
      ...(place ? { place } : {}),
      ...(everyKm > 0 ? { remindKm: everyKm } : {}),
      ...(everyMonths > 0 ? { remindMonths: everyMonths } : {}),
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
  category: 'kinds.field.category',
  odometer: 'kinds.field.odometer',
  remindKm: 'kinds.field.remindKm',
  remindMonths: 'kinds.field.remindMonths',
} as const satisfies Record<keyof DraftErrors, string>;

/** Service and expense keep their money in `price` too, but label it differently. */
const PRICE_KEYS: Partial<Record<EntryKind, StringKey>> = {
  service: 'kinds.field.cost',
  expense: 'kinds.field.amount',
};

/**
 * The one line above Save that says why it is dim: what is missing, then what
 * does not read as a number. Empty when the draft is valid. `kind` picks the
 * money field's label, so a service hint says "Cost", not "Total paid".
 */
export function saveHint(errors: DraftErrors, kind?: EntryKind): string {
  const keys = Object.keys(errors) as (keyof DraftErrors)[];
  const priceKey = (kind && PRICE_KEYS[kind]) ?? FIELD_KEYS.price;
  const fieldName = (k: keyof DraftErrors) => t(k === 'price' ? priceKey : FIELD_KEYS[k]);
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
