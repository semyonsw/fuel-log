/**
 * The Summary's statistics: money and km per calendar month, the per-refuel
 * efficiency trends, and the most driven routes. Pure functions of the log,
 * like everything in lib, so the charts, the tiles and the AI's answers
 * cannot disagree.
 *
 * ── NOTHING HERE COUNTS ON ITS OWN ───────────────────────────────────────
 *
 * Every figure is one the app already computes somewhere else, regrouped:
 * a month's totals are `summarize` with that month's bounds (so km is trip
 * distance, or range used when a trip has none, exactly as the tiles count
 * it), km/L is `kmPerLiterPoints`, and a route's cost is the sum of the same
 * per-trip estimates the Log shows (`tripEstimates`). A second way of
 * counting would sooner or later disagree with the first.
 *
 * ── MONTHS ARE LOCAL CALENDAR MONTHS ─────────────────────────────────────
 *
 * The 1st 00:00 to the next 1st 00:00 in local time, built through `Date`
 * (as in entries.ts), so a refuel at 23:50 on the 31st counts in the month
 * the user lived it, and a DST change never moves a boundary.
 */

import type { Entry, RefuelEntry } from '../types';
import { rangeUsedById, summarize, tripKm } from './entries';
import { kmPerLiterFromRefuels, kmPerLiterPoints, tripEstimates } from './fuel';
import { normalizePlace } from './places';

/** Local [1st 00:00, next 1st 00:00) of the month containing `now`, moved `offset` months. */
export function monthBounds(now: number, offset = 0): [number, number] {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const end = new Date(d.getFullYear(), d.getMonth() + offset + 1, 1);
  return [start.getTime(), end.getTime()];
}

/** One calendar month. `start` is its local 1st 00:00; `amd` is money paid at refuels. */
export type MonthTotal = {
  start: number;
  amd: number;
  km: number;
  liters: number;
  refuels: number;
  trips: number;
};

/**
 * Totals for the last `months` calendar months, oldest first, the month
 * containing `now` last. A month with nothing logged is still there at 0, so
 * the bars keep their place in time rather than closing the gap.
 */
export function monthlyTotals(entries: Entry[], now: number, months: number): MonthTotal[] {
  const out: MonthTotal[] = [];
  for (let offset = 1 - Math.max(0, Math.floor(months)); offset <= 0; offset++) {
    const [from, to] = monthBounds(now, offset);
    // Over the FULL list, like the tiles: a month's first trip is measured
    // from a reading taken the month before.
    const s = summarize(entries, from, to);
    out.push({
      start: from,
      amd: s.spentAmd,
      km: s.distanceKm,
      liters: s.liters,
      refuels: s.refuels,
      trips: s.trips,
    });
  }
  return out;
}

export type MonthChange = { current: number; previous: number; diff: number; ratio?: number };

/**
 * This month against the one before, for one figure of `monthlyTotals`.
 * `ratio` is diff ÷ previous, left out when last month was 0 (any rise from
 * nothing is "infinitely" more, which says nothing). Undefined with fewer
 * than two months.
 */
export function monthChange(
  months: MonthTotal[],
  pick: (m: MonthTotal) => number,
): MonthChange | undefined {
  if (months.length < 2) return undefined;
  const current = pick(months[months.length - 1]);
  const previous = pick(months[months.length - 2]);
  const diff = current - previous;
  return previous > 0
    ? { current, previous, diff, ratio: diff / previous }
    : { current, previous, diff };
}

/**
 * One refuel's efficiency. `kmPerLiter` is the dashboard range one litre
 * bought (see lib/fuel), so it is there only when the refuel recorded range
 * after and a reading came before it; `amdPerKm` needs it too.
 */
export type TrendPoint = {
  at: number;
  id: string;
  pricePerLiter: number;
  kmPerLiter?: number;
  amdPerKm?: number;
};

/**
 * One point per refuel with litres and a price, oldest first. A refuel
 * without either has no price per litre and is left out, not drawn as 0.
 */
export function refuelTrends(entries: Entry[]): TrendPoint[] {
  const kmPerL = new Map(kmPerLiterPoints(entries).map((p) => [p.id, p.kmPerL]));
  return entries
    .filter((e): e is RefuelEntry => e.kind === 'refuel' && e.liters > 0 && e.priceAmd > 0)
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((e) => {
      const pricePerLiter = e.priceAmd / e.liters;
      const kmPerLiter = kmPerL.get(e.id);
      return kmPerLiter !== undefined && kmPerLiter > 0
        ? { at: e.at, id: e.id, pricePerLiter, kmPerLiter, amdPerKm: pricePerLiter / kmPerLiter }
        : { at: e.at, id: e.id, pricePerLiter };
    });
}

/**
 * A From → To pair. `km` counts like the tiles (distance, else range used);
 * `amd` is the sum of the trips' cost estimates, 0 when none could be priced.
 */
export type RouteStat = { from: string; to: string; count: number; km: number; amd: number };

type RouteAcc = RouteStat & { lastAt: number };

/**
 * The `limit` most driven routes, most trips first, then most km, then most
 * recent. Names merge case-insensitively with the most recent spelling shown,
 * the same rule as the place suggestions, so "4micro" and "4Micro " are one
 * place. Stops are ignored: home → work via the shop is still home → work.
 * A trip missing either end is not a route and is left out.
 *
 * `kmPerL` prices the trips; it defaults to the log's own figure, so pass
 * `effectiveKmPerLiter(entries, consumption)` to honour the Settings figure.
 */
export function topRoutes(
  entries: Entry[],
  limit: number,
  kmPerL: number | undefined = kmPerLiterFromRefuels(entries),
): RouteStat[] {
  const used = rangeUsedById(entries);
  const estimates = tripEstimates(entries, used, kmPerL);
  const routes = new Map<string, RouteAcc>();
  for (const e of entries) {
    if (e.kind !== 'trip') continue;
    const from = normalizePlace(e.from);
    const to = normalizePlace(e.to);
    if (from === '' || to === '') continue;
    const key = `${from.toLowerCase()}\u0000${to.toLowerCase()}`;
    const prev = routes.get(key);
    const newer = !prev || e.at >= prev.lastAt;
    routes.set(key, {
      from: newer ? from : prev.from,
      to: newer ? to : prev.to,
      count: (prev?.count ?? 0) + 1,
      km: (prev?.km ?? 0) + tripKm(e, used),
      amd: (prev?.amd ?? 0) + (estimates.get(e.id)?.amd ?? 0),
      lastAt: newer ? e.at : prev.lastAt,
    });
  }
  return [...routes.values()]
    .sort((a, b) => b.count - a.count || b.km - a.km || b.lastAt - a.lastAt)
    .slice(0, Math.max(0, Math.floor(limit)))
    .map(({ from, to, count, km, amd }) => ({ from, to, count, km, amd }));
}

/**
 * The smallest 1, 2 or 5 × 10ⁿ at or above `n`, so a bar chart's top line
 * reads as a round number ("50 000", not "47 300"). 0 for nothing to show.
 */
export function niceCeil(n: number): number {
  if (!(n > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}

export type LinePoint = { x: number; y: number };

/**
 * Points of a line chart in a `width` × `height` box. Like the range
 * sparkline, points are spaced by ORDER, not time: refuels come in bursts and
 * a quiet month should not squash the rest into a corner. One point sits in
 * the middle; a flat series sits at mid-height rather than on an edge.
 */
export function linePoints(
  values: number[],
  width: number,
  height: number,
  pad = { x: 8, top: 8, bottom: 8 },
): LinePoint[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = height - pad.top - pad.bottom;
  const inner = width - 2 * pad.x;
  return values.map((v, i) => ({
    x: values.length === 1 ? width / 2 : pad.x + (i * inner) / (values.length - 1),
    y: pad.top + (max === min ? span / 2 : ((max - v) / (max - min)) * span),
  }));
}
