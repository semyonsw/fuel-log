/**
 * Fuel stations: the remembered-chip list for the Refuel form, and the
 * address that comes with a station.
 *
 * Same idea as places: the user fills up at the same two or three stations,
 * so after the first time a station is one tap. The list is derived from the
 * refuels already logged — no separate table to drift out of date — and
 * names merge case-insensitively with the most recent spelling shown.
 *
 * Picking a station also fills the address it had LAST time, because a chain
 * like "Max Petrol" has many pumps and the most recent one is the likeliest.
 */

import type { Entry, FuelGrade, RefuelEntry } from '../types';
import { sortNewestFirst } from './entries';
import { normalizePlace } from './places';

export const FUEL_GRADES: { value: FuelGrade; label: string }[] = [
  { value: '92', label: 'Regular 92' },
  { value: '95', label: 'Premium 95' },
  { value: '98', label: 'Super 98' },
  { value: 'diesel', label: 'Diesel' },
];

export function gradeLabel(g: FuelGrade): string {
  return FUEL_GRADES.find((x) => x.value === g)?.label ?? g;
}

function refuelsNewest(entries: Entry[]): RefuelEntry[] {
  return sortNewestFirst(entries).filter((e): e is RefuelEntry => e.kind === 'refuel');
}

/** Up to `limit` station names, most used first; a query keeps substring matches, prefixes first. */
export function suggestStations(entries: Entry[], query: string, limit = 8): string[] {
  const uses = new Map<string, { name: string; count: number; lastAt: number }>();
  for (const r of refuelsNewest(entries)) {
    const name = normalizePlace(r.station ?? '');
    if (!name) continue;
    const key = name.toLowerCase();
    const u = uses.get(key);
    if (u) u.count += 1;
    else uses.set(key, { name, count: 1, lastAt: r.at });
  }
  const q = normalizePlace(query).toLowerCase();
  return [...uses.entries()]
    .filter(([key]) => key.includes(q) && key !== q)
    .sort(
      ([ka, a], [kb, b]) =>
        Number(kb.startsWith(q)) - Number(ka.startsWith(q)) ||
        b.count - a.count ||
        b.lastAt - a.lastAt,
    )
    .slice(0, limit)
    .map(([, u]) => u.name);
}

/** The address recorded with this station most recently, if any. */
export function lastAddressFor(entries: Entry[], station: string): string | undefined {
  const key = normalizePlace(station).toLowerCase();
  if (!key) return undefined;
  for (const r of refuelsNewest(entries)) {
    if (normalizePlace(r.station ?? '').toLowerCase() === key && r.address?.trim()) {
      return r.address.trim();
    }
  }
  return undefined;
}

/** "Max Petrol · Komitas 5 · Regular 92" — the parts that exist. */
export function stationLine(r: RefuelEntry): string {
  return [r.station, r.address, r.grade ? gradeLabel(r.grade) : undefined]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' · ');
}
