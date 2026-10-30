/**
 * Whatever is read back — from AsyncStorage or from a backup file someone
 * picked — is trusted only this far. One bad row is dropped, not the whole log.
 *
 * Two levels of "bad":
 *
 *  - A row missing what its kind is *about* is dropped: a refuel without
 *    positive liters, a reading without a range, a service or expense without
 *    a known category and an amount. Keeping it would put NaN into every
 *    summary that adds it up, which is worse than losing one row.
 *  - An optional field of the wrong type is dropped from its row and the row
 *    kept (the rest was typed and is still worth having): a malformed GPS
 *    track, a range that is not a number, a station that is not text. The
 *    screens call string methods and do arithmetic on these without checking,
 *    because everything written by the app itself is already well-formed.
 */

import type { Entry, TrackPoint } from '../types';
import { isExpenseCategory, isServiceCategory } from './categories';

const GRADES = new Set(['92', '95', '98', 'diesel']);

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
      keepIf(r, ['station', 'address'], isString);
      keepIf(r, ['grade'], (g) => GRADES.has(g as string));
      keepIf(r, ['odometerKm'], nonNegative);
      return r as unknown as Entry;
    case 'service':
      if (!isServiceCategory(r.category) || !nonNegative(r.costAmd)) return undefined;
      keepIf(r, ['place'], isString);
      keepIf(r, ['odometerKm'], nonNegative);
      keepIf(r, ['remindKm', 'remindMonths'], (v) => finite(v) && v > 0);
      return r as unknown as Entry;
    case 'expense':
      // 0 is kept, not dropped: the form rounds to whole AMD, so a typed "0.4"
      // is stored as 0, and a load must never delete what the app itself wrote.
      if (!isExpenseCategory(r.category) || !nonNegative(r.amountAmd)) return undefined;
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
