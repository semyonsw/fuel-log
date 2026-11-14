/**
 * Whatever is read back — from AsyncStorage or from a backup file someone
 * picked — is trusted only this far. One bad row is dropped, not the whole log.
 *
 * Two levels of "bad":
 *
 *  - A row missing what its kind is *about* is dropped: a refuel without
 *    positive liters, a reading without a range. Keeping it would put NaN into
 *    every summary that adds it up, which is worse than losing one row. Rows
 *    of kinds this build no longer has (services and expenses, written by
 *    1.7.x) are dropped the same way: the app no longer shows or counts them.
 *  - An optional field of the wrong type is dropped from its row and the row
 *    kept (the rest was typed and is still worth having): a malformed GPS
 *    track, a range that is not a number. The
 *    screens call string methods and do arithmetic on these without checking,
 *    because everything written by the app itself is already well-formed.
 */

import type { Entry, TrackPoint } from '../types';

/** Refuel fields 1.7.x recorded and this build dropped; stripped so they do not ride along forever. */
const RETIRED_REFUEL_KEYS = ['station', 'address', 'grade', 'odometerKm'];

type Row = Record<string, unknown>;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isPoint(p: unknown): p is TrackPoint {
  const q = p as TrackPoint;
  return typeof q === 'object' && q !== null && finite(q.lat) && finite(q.lon) && finite(q.t);
}

/** Drops each listed key whose value fails `ok`; absent keys stay absent. */
function keepIf(r: Row, keys: string[], ok: (v: unknown) => boolean): void {
  for (const k of keys) if (k in r && !ok(r[k])) delete r[k];
}

const isString = (v: unknown) => typeof v === 'string';
const nonNegative = (v: unknown) => finite(v) && v >= 0;

function sanitizeEntry(raw: unknown): Entry | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r: Row = { ...(raw as Row) };
  if (typeof r.id !== 'string' || !finite(r.at)) return undefined;
  keepIf(r, ['rangeKm'], nonNegative);
  keepIf(r, ['note'], isString);

  switch (r.kind) {
    case 'trip':
      r.from = typeof r.from === 'string' ? r.from : '';
      r.to = typeof r.to === 'string' ? r.to : '';
      r.stops = Array.isArray(r.stops) ? r.stops.filter(isString) : [];
      keepIf(r, ['distanceKm'], nonNegative);
      keepIf(r, ['track'], (t) => Array.isArray(t) && t.every(isPoint));
      return r as unknown as Entry;
    case 'reading':
      return nonNegative(r.rangeKm) ? (r as unknown as Entry) : undefined;
    case 'refuel':
      // Zero liters would make price-per-litre infinite in every summary.
      if (!finite(r.liters) || r.liters <= 0 || !nonNegative(r.priceAmd)) return undefined;
      for (const k of RETIRED_REFUEL_KEYS) delete r[k];
      return r as unknown as Entry;
    default:
      return undefined;
  }
}

export function sanitizeEntries(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return [];
  const out: Entry[] = [];
  for (const x of raw) {
    const e = sanitizeEntry(x);
    if (e) out.push(e);
  }
  return out;
}
