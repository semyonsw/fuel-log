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

import { t } from '../i18n';
import type { Entry, FuelGrade, RefuelEntry } from '../types';
import { sortNewestFirst } from './entries';
import { normalizePlace } from './places';

/**
 * Each label is a getter, so it is read in the current language whenever a
 * list renders, while `value` (what is stored) never changes.
 */
const grade = (value: FuelGrade) => ({
  value,
  get label() {
    return t(`form.fuel.${value}`);
  },
});

export const FUEL_GRADES: { value: FuelGrade; label: string }[] = [
  grade('92'),
  grade('95'),
  grade('98'),
  grade('diesel'),
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

/**
 * The address to show after the station changes. An address that was only
 * filled in for the previous station (from its history, or the pre-filled last
 * refuel) belongs to that station, so it is replaced by the new station's own
 * last address, or cleared; keeping it would save one pump's name with another
 * pump's address. An address the user typed themselves is kept.
 */
export function addressForStation(
  entries: Entry[],
  prevStation: string,
  nextStation: string,
  address: string,
): string {
  const typed = address.trim();
  const auto = lastAddressFor(entries, prevStation);
  if (typed !== '' && typed !== auto) return address;
  return lastAddressFor(entries, nextStation) ?? '';
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

/**
 * Up to `limit` addresses already used for refuels, for the address dropdown.
 * When a station is chosen its own addresses come first — "Max Petrol" has
 * pumps all over town, and the user's ones are the ones they have used — then
 * the rest, so a station typed for the first time can still reuse a known
 * address. Otherwise ranked like suggestStations.
 */
export function suggestAddresses(
  entries: Entry[],
  query: string,
  station?: string,
  limit = 8,
): string[] {
  const own = normalizePlace(station ?? '').toLowerCase();
  const uses = new Map<string, { name: string; count: number; lastAt: number; ours: boolean }>();
  for (const r of refuelsNewest(entries)) {
    const name = normalizePlace(r.address ?? '');
    if (!name) continue;
    const key = name.toLowerCase();
    const ours = own !== '' && normalizePlace(r.station ?? '').toLowerCase() === own;
    const u = uses.get(key);
    if (u) {
      u.count += 1;
      u.ours ||= ours;
    } else uses.set(key, { name, count: 1, lastAt: r.at, ours });
  }
  const q = normalizePlace(query).toLowerCase();
  return [...uses.entries()]
    .filter(([key]) => key.includes(q) && key !== q)
    .sort(
      ([ka, a], [kb, b]) =>
        Number(b.ours) - Number(a.ours) ||
        Number(kb.startsWith(q)) - Number(ka.startsWith(q)) ||
        b.count - a.count ||
        b.lastAt - a.lastAt,
    )
    .slice(0, limit)
    .map(([, u]) => u.name);
}

/**
 * What a NEW refuel opens with: the station, address and grade of the last
 * fill-up, because the user mostly buys the same fuel at the same pump and
 * changing one field beats typing three. Taken together from one refuel (the
 * newest that recorded any of them) so a station never pairs with another
 * pump's address. Amounts are never carried over: they differ every time.
 */
export function refuelDefaults(entries: Entry[]): {
  station?: string;
  address?: string;
  grade?: FuelGrade;
} {
  const last = refuelsNewest(entries).find(
    (r) => normalizePlace(r.station ?? '') || normalizePlace(r.address ?? '') || r.grade,
  );
  if (!last) return {};
  const station = normalizePlace(last.station ?? '');
  const address = normalizePlace(last.address ?? '');
  return {
    ...(station ? { station } : {}),
    ...(address ? { address } : {}),
    ...(last.grade ? { grade: last.grade } : {}),
  };
}
