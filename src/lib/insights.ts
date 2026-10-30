/**
 * The numbers the AI chat quotes, worked out by the app.
 *
 * ── THE MODEL READS FACTS, IT DOES NOT ADD UP ────────────────────────────
 *
 * A language model asked "how much did I spend this week?" over a JSON dump
 * adds forty prices in its head and gets close, which for money is wrong. So
 * every figure the user is likely to ask for is computed here, with the same
 * functions the Log and Summary screens use, and handed to the model as a
 * FACTS block it is told to quote. Only a period that is not in the facts
 * is left to the model, and the prompt makes it say that figure is rough.
 *
 * ── CHECKS ARE HINTS, NOT VERDICTS ───────────────────────────────────────
 *
 * "Anything odd in my log?" is answered from `findIssues`: things that are
 * usually typos (the same refuel twice, a price far above the usual) or gaps
 * (a refuel with no station). Each names the entries involved so the model
 * can point at them and propose a fix, which the user still has to approve.
 * Thresholds lean towards saying less: a dashboard re-estimating its range
 * upward by a few km is normal (see lib/entries), so only a clear jump counts.
 */

import type { Entry, FuelGrade, RefuelEntry } from '../types';
import { dayKey, drivenKm, formatTime, periodStart, sortNewestFirst, summarize } from './entries';
import { effectiveKmPerLiter } from './fuel';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Two refuels with the same litres and price this close together are probably one, typed twice. */
export const DUPLICATE_WINDOW_MS = 3 * HOUR;
/** A range rise without a refuel smaller than this is the dashboard re-estimating, not a slip. */
export const RANGE_RISE_KM = 20;
/** A price per litre this far above the usual for its grade is worth a second look. */
export const PRICEY_FACTOR = 1.15;
/** The usual needs a few refuels of that grade before it means anything. */
const PRICEY_MIN_REFUELS = 3;
/** The forecast is for when the range gets down to about this. */
export const RESERVE_KM = 50;
const MAX_ISSUES = 20;

const r1 = (n: number) => Math.round(n * 10) / 10;

export type PeriodFacts = {
  trips: number;
  kmDriven: number;
  rangeUsedKm: number;
  refuels: number;
  liters: number;
  fuelAmd: number;
  serviceAmd: number;
  expenseAmd: number;
  /** Fuel + service + expenses. */
  totalAmd: number;
  /** Fuel AMD per litre bought in the period; null with no litres. */
  avgAmdPerLiter: number | null;
};

export type Issue =
  | { type: 'duplicate-refuel'; ids: [string, string] }
  | { type: 'range-rose-without-refuel'; ids: [string, string]; fromKm: number; toKm: number }
  | { type: 'refuel-missing'; ids: [string]; missing: ('price' | 'grade' | 'station')[] }
  | { type: 'trip-without-distance-or-range'; ids: [string] }
  | {
      type: 'refuel-price-high';
      ids: [string];
      grade: FuelGrade | 'unknown';
      perLiter: number;
      usualPerLiter: number;
    };

export type Facts = {
  today: PeriodFacts & { from: string };
  thisWeek: PeriodFacts & { from: string };
  thisMonth: PeriodFacts & { month: string };
  lastMonth: PeriodFacts & { month: string };
  /** The six calendar months up to and including this one, oldest first. */
  byMonth: (PeriodFacts & { month: string })[];
  currentRangeKm: number | null;
  /** When the dashboard last said that, "YYYY-MM-DD HH:MM". */
  currentRangeAt: string | null;
  /** km of dashboard range per litre: the user's typed consumption, else from refuels. */
  kmPerLiter: number | null;
  /** AMD per litre of the latest refuel of each grade ("unknown" = no grade recorded). */
  latestPricePerLiter: Partial<Record<FuelGrade | 'unknown', number>>;
  /** Over the last 30 days (or since the log began, if later). */
  kmDrivenPerDay: number | null;
  rangeUsedPerDay: number | null;
  /** When the range should be down to about RESERVE_KM at the usual pace. */
  refuelForecast: { reserveKm: number; daysLeft: number; byDate: string } | null;
  issues: Issue[];
};

function monthStart(now: number, back: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() - back);
  return d.getTime();
}

const monthKey = (at: number) => dayKey(at).slice(0, 7);

/** Totals for `fromMs <= at < toMs`, from the same functions the Summary screen uses. */
export function periodFacts(entries: Entry[], fromMs: number, toMs: number): PeriodFacts {
  const s = summarize(entries, fromMs, toMs);
  let serviceAmd = 0;
  let expenseAmd = 0;
  for (const e of entries) {
    if (e.at < fromMs || e.at >= toMs) continue;
    if (e.kind === 'service') serviceAmd += e.costAmd;
    else if (e.kind === 'expense') expenseAmd += e.amountAmd;
  }
  return {
    trips: s.trips,
    kmDriven: r1(drivenKm(entries, fromMs, toMs)),
    rangeUsedKm: r1(s.rangeUsedKm),
    refuels: s.refuels,
    liters: r1(s.liters),
    fuelAmd: s.spentAmd,
    serviceAmd,
    expenseAmd,
    totalAmd: s.spentAmd + serviceAmd + expenseAmd,
    avgAmdPerLiter: s.liters > 0 ? r1(s.spentAmd / s.liters) : null,
  };
}

const perLiter = (r: RefuelEntry) => r.priceAmd / r.liters;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function sortedAsc(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Likely slips and gaps in the log, newest first, at most MAX_ISSUES. */
export function findIssues(entries: Entry[]): Issue[] {
  const asc = sortedAsc(entries);
  const found: { at: number; issue: Issue }[] = [];
  const refuels = asc.filter((e): e is RefuelEntry => e.kind === 'refuel');

  for (let i = 1; i < refuels.length; i++) {
    const a = refuels[i - 1];
    const b = refuels[i];
    if (a.liters === b.liters && a.priceAmd === b.priceAmd && b.at - a.at <= DUPLICATE_WINDOW_MS) {
      found.push({ at: b.at, issue: { type: 'duplicate-refuel', ids: [a.id, b.id] } });
    }
  }

  // Same walk as rangeUsedById: a refuel anywhere between two readings explains a rise.
  let prev: Entry | undefined;
  let refuelSince = false;
  for (const e of asc) {
    if (e.kind === 'refuel') refuelSince = true;
    if (e.rangeKm === undefined) continue;
    if (prev?.rangeKm !== undefined && !refuelSince && e.rangeKm - prev.rangeKm >= RANGE_RISE_KM) {
      found.push({
        at: e.at,
        issue: {
          type: 'range-rose-without-refuel',
          ids: [prev.id, e.id],
          fromKm: prev.rangeKm,
          toKm: e.rangeKm,
        },
      });
    }
    prev = e;
    refuelSince = false;
  }

  for (const r of refuels) {
    const missing: ('price' | 'grade' | 'station')[] = [];
    if (!(r.priceAmd > 0)) missing.push('price');
    if (!r.grade) missing.push('grade');
    if (!r.station?.trim()) missing.push('station');
    if (missing.length)
      found.push({ at: r.at, issue: { type: 'refuel-missing', ids: [r.id], missing } });
  }

  for (const e of asc) {
    if (e.kind === 'trip' && !(e.distanceKm && e.distanceKm > 0) && e.rangeKm === undefined) {
      found.push({ at: e.at, issue: { type: 'trip-without-distance-or-range', ids: [e.id] } });
    }
  }

  const byGrade = new Map<FuelGrade | 'unknown', RefuelEntry[]>();
  for (const r of refuels) {
    if (!(r.liters > 0 && r.priceAmd > 0)) continue;
    const g = r.grade ?? 'unknown';
    byGrade.set(g, [...(byGrade.get(g) ?? []), r]);
  }
  for (const [grade, list] of byGrade) {
    if (list.length < PRICEY_MIN_REFUELS) continue;
    const usual = median(list.map(perLiter));
    for (const r of list) {
      if (perLiter(r) > usual * PRICEY_FACTOR) {
        found.push({
          at: r.at,
          issue: {
            type: 'refuel-price-high',
            ids: [r.id],
            grade,
            perLiter: r1(perLiter(r)),
            usualPerLiter: r1(usual),
          },
        });
      }
    }
  }

  return found
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_ISSUES)
    .map((f) => f.issue);
}

function latestPrices(entries: Entry[]): Facts['latestPricePerLiter'] {
  const out: Facts['latestPricePerLiter'] = {};
  for (const e of sortedAsc(entries)) {
    if (e.kind === 'refuel' && e.liters > 0 && e.priceAmd > 0) {
      out[e.grade ?? 'unknown'] = r1(perLiter(e));
    }
  }
  return out;
}

/**
 * The usual daily pace over the last 30 days. A log younger than that is
 * averaged over the days it covers, so a first week is not diluted to a
 * month; at least one day, so a log started this morning is not a sprint.
 */
function dailyPace(entries: Entry[], now: number) {
  if (entries.length === 0) return { kmDriven: null, rangeUsed: null };
  const first = Math.min(...entries.map((e) => e.at));
  const from = Math.max(now - 30 * DAY, new Date(first).setHours(0, 0, 0, 0));
  const days = Math.max(1, (now - from) / DAY);
  const p = periodFacts(entries, from, now + 1);
  return { kmDriven: r1(p.kmDriven / days), rangeUsed: r1(p.rangeUsedKm / days) };
}

/**
 * Days until the range is down to RESERVE_KM, counted from the last reading
 * at the usual pace of RANGE used per day (what the dashboard counts down);
 * km driven stands in when no range drop is on record.
 */
function forecast(
  last: Entry | undefined,
  now: number,
  pace: { kmDriven: number | null; rangeUsed: number | null },
): Facts['refuelForecast'] {
  const perDay = pace.rangeUsed || pace.kmDriven;
  if (last?.rangeKm === undefined || !perDay) return null;
  const due = last.at + (Math.max(0, last.rangeKm - RESERVE_KM) / perDay) * DAY;
  return {
    reserveKm: RESERVE_KM,
    daysLeft: Math.max(0, r1((due - now) / DAY)),
    byDate: dayKey(Math.max(due, now)),
  };
}

export function buildFacts(entries: Entry[], now: number, typedConsumption?: string): Facts {
  const end = now + 1;
  const today = periodStart('today', now);
  const week = periodStart('week', now);
  const month = monthStart(now, 0);
  const prevMonth = monthStart(now, 1);
  const byMonth = [5, 4, 3, 2, 1, 0].map((back) => {
    const from = monthStart(now, back);
    const to = back === 0 ? end : monthStart(now, back - 1);
    return { month: monthKey(from), ...periodFacts(entries, from, to) };
  });
  // The same "latest range" as currentRangeKm, kept whole for its time.
  const last = sortNewestFirst(entries).find((e) => e.rangeKm !== undefined);
  const kmPerL = effectiveKmPerLiter(entries, typedConsumption);
  const pace = dailyPace(entries, now);
  return {
    today: { from: dayKey(today), ...periodFacts(entries, today, end) },
    thisWeek: { from: dayKey(week), ...periodFacts(entries, week, end) },
    thisMonth: { month: monthKey(month), ...periodFacts(entries, month, end) },
    lastMonth: { month: monthKey(prevMonth), ...periodFacts(entries, prevMonth, month) },
    byMonth,
    currentRangeKm: last?.rangeKm ?? null,
    currentRangeAt: last ? `${dayKey(last.at)} ${formatTime(last.at)}` : null,
    kmPerLiter: kmPerL === undefined ? null : r1(kmPerL),
    latestPricePerLiter: latestPrices(entries),
    kmDrivenPerDay: pace.kmDriven,
    rangeUsedPerDay: pace.rangeUsed,
    refuelForecast: forecast(last, now, pace),
    issues: findIssues(entries),
  };
}
