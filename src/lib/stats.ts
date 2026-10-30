/**
 * The Summary's money and trend figures: monthly budgets and the month-end
 * forecast, the spending history by month, the per-refuel trend lines, and
 * the per-station / per-grade tables. Pure functions of the log, like
 * everything in lib, so the chart and the tiles cannot disagree.
 *
 * ── MONTHS ARE LOCAL CALENDAR MONTHS ─────────────────────────────────────
 *
 * "This month" is the 1st 00:00 to the next 1st 00:00 in local time, built
 * through `Date` (as in entries.ts), so a refuel at 23:50 on the 31st counts
 * in the month the user lived it, and a DST change never moves a boundary.
 *
 * ── TWO BUDGETS, TWO KINDS OF MONEY ──────────────────────────────────────
 *
 * The fuel budget counts what was paid at refuels; the expenses budget counts
 * services and expenses. They are kept apart because they behave differently:
 * fuel is steady every month, while one insurance payment can be a year's worth
 * of "other". A budget is what the user typed in Settings; blank or 0 is none.
 *
 * ── THE FORECAST IS THE PACE SO FAR, NOTHING CLEVERER ───────────────────
 *
 *   forecast = spent so far ÷ days elapsed × days in the month
 *
 * Days elapsed counts today as a whole day (today's spending is already in),
 * so it is the date of the month. On the 1st-3rd one fill-up would be
 * multiplied by ten or more, and nothing spent says nothing about the pace, so
 * neither gets a forecast; the screen says "too early" instead of a wild number.
 */

import type { Entry, FuelGrade, RefuelEntry } from '../types';
import { entryAmd, isCost } from './entries';
import { parseNumber } from './numbers';
import { normalizePlace } from './places';

/** Local [1st 00:00, next 1st 00:00) of the month containing `now`, moved `offset` months. */
export function monthBounds(now: number, offset = 0): [number, number] {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const end = new Date(d.getFullYear(), d.getMonth() + offset + 1, 1);
  return [start.getTime(), end.getTime()];
}

/** Days in the local month containing `now`: 28-31. */
export function daysInMonth(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Fuel money and other money in `fromMs <= at < toMs`. */
export type Spending = { fuelAmd: number; otherAmd: number };

export function spendingIn(entries: Entry[], fromMs: number, toMs: number): Spending {
  // The same money `summarize` adds up, without its range-used pass: the
  // Summary asks for seven months of this on every minute's re-render.
  const out: Spending = { fuelAmd: 0, otherAmd: 0 };
  for (const e of entries) {
    if (e.at < fromMs || e.at >= toMs) continue;
    if (e.kind === 'refuel') out.fuelAmd += e.priceAmd;
    else if (isCost(e)) out.otherAmd += entryAmd(e) ?? 0;
  }
  return out;
}

/**
 * Thousands grouped with commas or dots: "50,000", "1.500.000". Elsewhere a
 * comma is a decimal point (lib/numbers), but a budget is whole dram and
 * nobody budgets 50 AMD a month, so here "50,000" (pasted, or typed from
 * habit) means fifty thousand. "1,5" is not grouped and stays a decimal.
 */
const GROUPED = /^\s*\d{1,3}([,.]\d{3})+\s*$/;

/** A budget as typed in Settings, in AMD; undefined when blank, 0 or not a number. */
export function parseBudget(text: string | undefined): number | undefined {
  if (typeof text !== 'string') return undefined;
  const n = parseNumber(GROUPED.test(text) ? text.replace(/[,.]/g, '') : text);
  return n !== undefined && n > 0 ? Math.round(n) : undefined;
}

export type BudgetStatus = {
  spentAmd: number;
  budgetAmd: number;
  /** spent ÷ budget; above 1 when over. */
  ratio: number;
  /** budget − spent; negative when over. */
  leftAmd: number;
  over: boolean;
};

/** How `spentAmd` stands against the typed budget; undefined when there is no budget. */
export function budgetStatus(
  spentAmd: number,
  budgetText: string | undefined,
): BudgetStatus | undefined {
  const budgetAmd = parseBudget(budgetText);
  if (budgetAmd === undefined) return undefined;
  return {
    spentAmd,
    budgetAmd,
    ratio: spentAmd / budgetAmd,
    leftAmd: budgetAmd - spentAmd,
    // Exactly on budget is not over.
    over: spentAmd > budgetAmd,
  };
}

/** The first day of the month that gets a forecast; the 1st-3rd are "too early". */
export const FORECAST_FROM_DAY = 4;

/**
 * Month-end spending at the current pace (see the header), whole AMD, or
 * undefined when it is too early to say: before the 4th, or nothing spent yet.
 */
export function monthForecast(spentAmd: number, now: number): number | undefined {
  const day = new Date(now).getDate();
  if (day < FORECAST_FROM_DAY || !(spentAmd > 0)) return undefined;
  return Math.round((spentAmd / day) * daysInMonth(now));
}

export type MonthSpending = Spending & {
  /** `YYYY-MM`, local. */
  key: string;
  year: number;
  /** 0-11, for the short month name. */
  month: number;
};

/**
 * Spending per calendar month for the last `months` months, the current one
 * last. A month with nothing logged is still there at 0, so the bars keep
 * their place in time rather than closing the gap.
 */
export function monthlySpending(entries: Entry[], now: number, months = 6): MonthSpending[] {
  const out: MonthSpending[] = [];
  for (let offset = 1 - months; offset <= 0; offset++) {
    const [from, to] = monthBounds(now, offset);
    const d = new Date(from);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      year: d.getFullYear(),
      month: d.getMonth(),
      ...spendingIn(entries, from, to),
    });
  }
  return out;
}

export type PricePoint = { id: string; at: number; amdPerL: number };

/**
 * AMD per litre of every refuel, oldest first. A refuel without litres or
 * price has no price per litre and is left out, not drawn as 0.
 */
export function pricePerLiterPoints(entries: Entry[]): PricePoint[] {
  return refuelsAsc(entries)
    .filter((r) => r.liters > 0 && r.priceAmd > 0)
    .map((r) => ({ id: r.id, at: r.at, amdPerL: r.priceAmd / r.liters }));
}

function refuelsAsc(entries: Entry[]): RefuelEntry[] {
  return entries
    .filter((e): e is RefuelEntry => e.kind === 'refuel')
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export type RefuelGroup = {
  refuels: number;
  liters: number;
  amd: number;
  /** amd ÷ liters; undefined when no litres were recorded. */
  amdPerL?: number;
  lastAt: number;
};

export type StationStat = RefuelGroup & {
  /** The most recent spelling; undefined for refuels that named no station. */
  name?: string;
};

export type GradeStat = RefuelGroup & {
  /** Undefined for refuels that recorded no grade. */
  grade?: FuelGrade;
};

/**
 * Most money first: the table answers "where does my fuel money go?". Ties
 * fall to the more recent, so a new favourite rises. The "unnamed" group
 * goes last whatever its size, because it is not a place you can choose.
 */
function byMoney<T extends RefuelGroup>(named: (g: T) => boolean) {
  return (a: T, b: T) =>
    Number(named(b)) - Number(named(a)) || b.amd - a.amd || b.lastAt - a.lastAt;
}

function groupRefuels<K>(
  entries: Entry[],
  fromMs: number,
  toMs: number,
  keyOf: (r: RefuelEntry) => K,
): Map<K, RefuelGroup & { newest: RefuelEntry }> {
  const groups = new Map<K, RefuelGroup & { newest: RefuelEntry }>();
  for (const r of refuelsAsc(entries)) {
    if (r.at < fromMs || r.at >= toMs) continue;
    const key = keyOf(r);
    const g = groups.get(key) ?? { refuels: 0, liters: 0, amd: 0, lastAt: r.at, newest: r };
    g.refuels += 1;
    g.liters += r.liters;
    g.amd += r.priceAmd;
    // Ascending order, so the last one seen is the newest.
    g.lastAt = r.at;
    g.newest = r;
    groups.set(key, g);
  }
  for (const g of groups.values()) if (g.liters > 0) g.amdPerL = g.amd / g.liters;
  return groups;
}

function totals(g: RefuelGroup): RefuelGroup {
  return {
    refuels: g.refuels,
    liters: g.liters,
    amd: g.amd,
    ...(g.amdPerL !== undefined ? { amdPerL: g.amdPerL } : {}),
    lastAt: g.lastAt,
  };
}

/**
 * Refuels in `fromMs <= at < toMs` per station. Names merge case-insensitively
 * with the most recent spelling shown, the same rule as lib/stations' chips,
 * so "max petrol" and "Max Petrol" are one row.
 */
export function stationStats(entries: Entry[], fromMs: number, toMs: number): StationStat[] {
  const groups = groupRefuels(entries, fromMs, toMs, (r) =>
    normalizePlace(r.station ?? '').toLowerCase(),
  );
  return [...groups.entries()]
    .map(([key, g]) => ({
      ...totals(g),
      ...(key ? { name: normalizePlace(g.newest.station ?? '') } : {}),
    }))
    .sort(byMoney<StationStat>((g) => g.name !== undefined));
}

/** Refuels in `fromMs <= at < toMs` per fuel grade. */
export function gradeStats(entries: Entry[], fromMs: number, toMs: number): GradeStat[] {
  const groups = groupRefuels(entries, fromMs, toMs, (r) => r.grade);
  return [...groups.entries()]
    .map(([grade, g]) => ({ ...totals(g), ...(grade ? { grade } : {}) }))
    .sort(byMoney<GradeStat>((g) => g.grade !== undefined));
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
