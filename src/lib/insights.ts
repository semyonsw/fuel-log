/**
 * The numbers the AI chat quotes, worked out by the app.
 *
 * ── THE MODEL READS FACTS, IT DOES NOT ADD UP ────────────────────────────
 *
 * A language model asked "how much did I spend this week?" over a JSON dump
 * adds forty prices in its head and gets close, which for money is wrong. So
 * every figure the user is likely to ask for is computed here, with the same
 * functions the Log and Summary screens use (entries, fuel, stats), and
 * handed to the model as a FACTS block it is told to quote. Only a period
 * that is not in the facts is left to the model, and the prompt makes it say
 * that figure is rough.
 *
 * ── CHECKS ARE HINTS, NOT VERDICTS ───────────────────────────────────────
 *
 * "Anything odd in my log?" is answered from `findIssues`: things that are
 * usually typos (the same refuel twice, a price far off the usual, a refuel
 * whose range did not go up). Each names the entries involved so the model
 * can point at them and propose a fix, which the user still has to approve.
 * Thresholds lean towards saying less: a dashboard re-estimating its range
 * by a few km, or traffic burning more range than the distance, is normal
 * (see lib/entries and lib/fuel), so only a clear outlier counts.
 */

import type { Entry, RefuelEntry, TripEntry } from '../types';
import {
  dayKey,
  formatTime,
  periodStart,
  rangeUsedById,
  sortNewestFirst,
  summarize,
} from './entries';
import { effectiveKmPerLiter, latestPricePerLiter, periodFuelCost } from './fuel';
import { monthBounds, monthlyTotals, refuelTrends, topRoutes } from './stats';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Two refuels with the same litres and price this close together are probably one, typed twice. */
export const DUPLICATE_WINDOW_MS = 3 * HOUR;
/** A range rise without a refuel smaller than this is the dashboard re-estimating, not a slip. */
export const RANGE_RISE_KM = 20;
/** A price per litre this many times above (or below) the usual is worth a second look. */
export const ODD_PRICE_FACTOR = 1.15;
/** The usual needs a few refuels before it means anything. */
const ODD_PRICE_MIN_REFUELS = 3;
/**
 * A trip using more range than this many times its distance (and at least
 * TRIP_DROP_SLACK_KM more) is more likely a mistyped range than traffic.
 */
export const TRIP_DROP_FACTOR = 3;
export const TRIP_DROP_SLACK_KM = 50;
/** The forecast is for when the range gets down to about this. */
export const RESERVE_KM = 50;
/** Months of history, refuels of trend and routes the model is given. */
export const HISTORY_MONTHS = 12;
export const TREND_REFUELS = 30;
export const TOP_ROUTES = 10;
const MAX_ISSUES = 20;
const PACE_DAYS = 30;

const r1 = (n: number) => Math.round(n * 10) / 10;
const when = (at: number) => `${dayKey(at)} ${formatTime(at)}`;

export type PeriodFacts = {
  trips: number;
  kmDriven: number;
  rangeUsedKm: number;
  refuels: number;
  liters: number;
  /** Money paid at refuels in the period. */
  fuelAmd: number;
  /** Fuel AMD per litre bought in the period; null with no litres. */
  avgAmdPerLiter: number | null;
  /** The trips' own cost estimates added up (≈, see lib/fuel); null when none could be priced. */
  estDrivingAmd: number | null;
};

export type MonthFacts = {
  month: string;
  trips: number;
  km: number;
  refuels: number;
  liters: number;
  fuelAmd: number;
};

/** One refuel's efficiency; `id` becomes a ref before the model sees it. */
export type TrendFact = {
  id: string;
  when: string;
  pricePerLiter: number;
  kmPerLiter?: number;
  amdPerKm?: number;
};

export type RouteFact = { from: string; to: string; trips: number; km: number; estAmd: number };

export type Issue =
  | { type: 'duplicate-refuel'; ids: [string, string] }
  | { type: 'range-rose-without-refuel'; ids: [string, string]; fromKm: number; toKm: number }
  | { type: 'refuel-range-not-higher'; ids: [string, string]; fromKm: number; toKm: number }
  | { type: 'trip-without-distance-or-range'; ids: [string] }
  | { type: 'trip-range-drop-large'; ids: [string]; distanceKm: number; rangeUsedKm: number }
  | { type: 'refuel-price-odd'; ids: [string]; perLiter: number; usualPerLiter: number };

export type Facts = {
  today: PeriodFacts & { from: string };
  thisWeek: PeriodFacts & { from: string };
  thisMonth: PeriodFacts & { month: string };
  lastMonth: PeriodFacts & { month: string };
  allTime: PeriodFacts & { from: string | null };
  /** The last HISTORY_MONTHS calendar months, oldest first, ending with this one. */
  byMonth: MonthFacts[];
  currentRangeKm: number | null;
  /** When the dashboard last said that, "YYYY-MM-DD HH:MM". */
  currentRangeAt: string | null;
  /** km of dashboard range per litre: the user's typed consumption, else from refuels. */
  kmPerLiter: number | null;
  /** AMD per litre of the latest refuel. */
  latestPricePerLiter: number | null;
  /** The latest TREND_REFUELS refuels' price and efficiency, oldest first. */
  refuelTrend: TrendFact[];
  /** The most driven From → To pairs, most trips first. */
  topRoutes: RouteFact[];
  /** Over the last 30 days (or since the log began, if later). */
  kmDrivenPerDay: number | null;
  rangeUsedPerDay: number | null;
  /** When the range should be down to about RESERVE_KM at the usual pace. */
  refuelForecast: { reserveKm: number; daysLeft: number; byDate: string } | null;
  issues: Issue[];
};

const monthKey = (at: number) => dayKey(at).slice(0, 7);

/** Totals for `fromMs <= at < toMs`, from the same functions the Summary screen uses. */
export function periodFacts(
  entries: Entry[],
  fromMs: number,
  toMs: number,
  kmPerL?: number,
): PeriodFacts {
  const s = summarize(entries, fromMs, toMs);
  const cost = periodFuelCost(entries, fromMs, toMs, kmPerL);
  return {
    trips: s.trips,
    kmDriven: r1(s.distanceKm),
    rangeUsedKm: r1(s.rangeUsedKm),
    refuels: s.refuels,
    liters: r1(s.liters),
    fuelAmd: s.spentAmd,
    avgAmdPerLiter: s.liters > 0 ? r1(s.spentAmd / s.liters) : null,
    estDrivingAmd: cost ? cost.amd : null,
  };
}

function sortedAsc(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const perLiter = (r: RefuelEntry) => r.priceAmd / r.liters;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Found = { at: number; issue: Issue };

function duplicateRefuels(refuels: RefuelEntry[]): Found[] {
  return refuels.slice(1).flatMap((b, i) => {
    const a = refuels[i];
    const same = a.liters === b.liters && a.priceAmd === b.priceAmd;
    return same && b.at - a.at <= DUPLICATE_WINDOW_MS
      ? [{ at: b.at, issue: { type: 'duplicate-refuel', ids: [a.id, b.id] } as Issue }]
      : [];
  });
}

/**
 * Walks the range readings in time order (as rangeUsedById does). Without a
 * refuel in between, a clear rise is a slip; a refuel that recorded range
 * after must show more than the reading before it, or one of them is wrong.
 */
function rangeSlips(asc: Entry[]): Found[] {
  const found: Found[] = [];
  let prev: Entry | undefined;
  let refuelSince = false;
  for (const e of asc) {
    if (e.kind === 'refuel') refuelSince = true;
    if (e.rangeKm === undefined) continue;
    const fromKm = prev?.rangeKm;
    if (prev && fromKm !== undefined) {
      const pair: [string, string] = [prev.id, e.id];
      if (e.kind === 'refuel' && e.rangeKm <= fromKm) {
        const issue: Issue = {
          type: 'refuel-range-not-higher',
          ids: pair,
          fromKm,
          toKm: e.rangeKm,
        };
        found.push({ at: e.at, issue });
      } else if (!refuelSince && e.rangeKm - fromKm >= RANGE_RISE_KM) {
        const issue: Issue = {
          type: 'range-rose-without-refuel',
          ids: pair,
          fromKm,
          toKm: e.rangeKm,
        };
        found.push({ at: e.at, issue });
      }
    }
    prev = e;
    refuelSince = false;
  }
  return found;
}

function tripSlips(asc: Entry[]): Found[] {
  const used = rangeUsedById(asc);
  return asc
    .filter((e): e is TripEntry => e.kind === 'trip')
    .flatMap((e): Found[] => {
      const dist = e.distanceKm;
      if (!(dist && dist > 0) && e.rangeKm === undefined) {
        return [{ at: e.at, issue: { type: 'trip-without-distance-or-range', ids: [e.id] } }];
      }
      const drop = used.get(e.id);
      const tooBig =
        dist &&
        dist > 0 &&
        drop !== undefined &&
        drop > Math.max(dist * TRIP_DROP_FACTOR, dist + TRIP_DROP_SLACK_KM);
      return tooBig
        ? [
            {
              at: e.at,
              issue: {
                type: 'trip-range-drop-large',
                ids: [e.id],
                distanceKm: dist,
                rangeUsedKm: drop,
              },
            },
          ]
        : [];
    });
}

/** Price per litre far above or below the median of all refuels. */
function oddPrices(refuels: RefuelEntry[]): Found[] {
  const priced = refuels.filter((r) => r.liters > 0 && r.priceAmd > 0);
  if (priced.length < ODD_PRICE_MIN_REFUELS) return [];
  const usual = median(priced.map(perLiter));
  return priced
    .filter((r) => perLiter(r) > usual * ODD_PRICE_FACTOR || perLiter(r) < usual / ODD_PRICE_FACTOR)
    .map((r) => ({
      at: r.at,
      issue: {
        type: 'refuel-price-odd',
        ids: [r.id],
        perLiter: r1(perLiter(r)),
        usualPerLiter: r1(usual),
      },
    }));
}

/** Likely slips in the log, newest first, at most MAX_ISSUES. */
export function findIssues(entries: Entry[]): Issue[] {
  const asc = sortedAsc(entries);
  const refuels = asc.filter((e): e is RefuelEntry => e.kind === 'refuel');
  return [
    ...duplicateRefuels(refuels),
    ...rangeSlips(asc),
    ...tripSlips(asc),
    ...oddPrices(refuels),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_ISSUES)
    .map((f) => f.issue);
}

type Pace = { kmDriven: number | null; rangeUsed: number | null };

/**
 * The usual daily pace over the last 30 days. A log younger than that is
 * averaged over the days it covers, so a first week is not diluted to a
 * month; at least one day, so a log started this morning is not a sprint.
 */
function dailyPace(entries: Entry[], now: number): Pace {
  if (entries.length === 0) return { kmDriven: null, rangeUsed: null };
  const first = Math.min(...entries.map((e) => e.at));
  const from = Math.max(now - PACE_DAYS * DAY, new Date(first).setHours(0, 0, 0, 0));
  const days = Math.max(1, (now - from) / DAY);
  const s = summarize(entries, from, now + 1);
  return { kmDriven: r1(s.distanceKm / days), rangeUsed: r1(s.rangeUsedKm / days) };
}

/**
 * Days until the range is down to RESERVE_KM, counted from the last reading
 * at the usual pace of RANGE used per day (what the dashboard counts down);
 * km driven stands in when no range drop is on record.
 */
function forecast(last: Entry | undefined, now: number, pace: Pace): Facts['refuelForecast'] {
  const perDay = pace.rangeUsed || pace.kmDriven;
  if (last?.rangeKm === undefined || !perDay) return null;
  const due = last.at + (Math.max(0, last.rangeKm - RESERVE_KM) / perDay) * DAY;
  return {
    reserveKm: RESERVE_KM,
    daysLeft: Math.max(0, r1((due - now) / DAY)),
    byDate: dayKey(Math.max(due, now)),
  };
}

function monthHistory(entries: Entry[], now: number): MonthFacts[] {
  return monthlyTotals(entries, now, HISTORY_MONTHS).map((m) => ({
    month: monthKey(m.start),
    trips: m.trips,
    km: r1(m.km),
    refuels: m.refuels,
    liters: r1(m.liters),
    fuelAmd: m.amd,
  }));
}

function trend(entries: Entry[]): TrendFact[] {
  return refuelTrends(entries)
    .slice(-TREND_REFUELS)
    .map((p) => ({
      id: p.id,
      when: when(p.at),
      pricePerLiter: r1(p.pricePerLiter),
      ...(p.kmPerLiter !== undefined ? { kmPerLiter: r1(p.kmPerLiter) } : {}),
      ...(p.amdPerKm !== undefined ? { amdPerKm: r1(p.amdPerKm) } : {}),
    }));
}

function routes(entries: Entry[], kmPerL: number | undefined): RouteFact[] {
  return topRoutes(entries, TOP_ROUTES, kmPerL).map((r) => ({
    from: r.from,
    to: r.to,
    trips: r.count,
    km: r1(r.km),
    estAmd: r.amd,
  }));
}

/**
 * The four calendar periods and all time, each as `periodFacts`. Open-ended
 * like the Summary tiles and month charts, so an entry dated later today (or
 * later this month) counts the same everywhere the user can read a total.
 */
function periods(entries: Entry[], now: number, kmPerL: number | undefined) {
  const end = Infinity;
  const p = (from: number, to: number) => periodFacts(entries, from, to, kmPerL);
  const today = periodStart('today', now);
  const week = periodStart('week', now);
  const [month] = monthBounds(now, 0);
  const [prevMonth] = monthBounds(now, -1);
  const first = entries.length ? Math.min(...entries.map((e) => e.at)) : undefined;
  return {
    today: { from: dayKey(today), ...p(today, end) },
    thisWeek: { from: dayKey(week), ...p(week, end) },
    thisMonth: { month: monthKey(month), ...p(month, end) },
    lastMonth: { month: monthKey(prevMonth), ...p(prevMonth, month) },
    allTime: { from: first === undefined ? null : dayKey(first), ...p(0, end) },
  };
}

export function buildFacts(entries: Entry[], now: number, typedConsumption?: string): Facts {
  // The same "latest range" as currentRangeKm, kept whole for its time.
  const last = sortNewestFirst(entries).find((e) => e.rangeKm !== undefined);
  const kmPerL = effectiveKmPerLiter(entries, typedConsumption);
  const pace = dailyPace(entries, now);
  const price = latestPricePerLiter(entries);
  return {
    ...periods(entries, now, kmPerL),
    byMonth: monthHistory(entries, now),
    currentRangeKm: last?.rangeKm ?? null,
    currentRangeAt: last ? when(last.at) : null,
    kmPerLiter: kmPerL === undefined ? null : r1(kmPerL),
    latestPricePerLiter: price === undefined ? null : r1(price),
    refuelTrend: trend(entries),
    topRoutes: routes(entries, kmPerL),
    kmDrivenPerDay: pace.kmDriven,
    rangeUsedPerDay: pace.rangeUsed,
    refuelForecast: forecast(last, now, pace),
    issues: findIssues(entries),
  };
}
