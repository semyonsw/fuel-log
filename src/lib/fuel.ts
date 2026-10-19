/**
 * Money and consumption: the calculator, per-trip cost estimates and their
 * per-period total, and the custom summary period.
 *
 * ── THE APP DOES NOT KNOW THE CAR'S CONSUMPTION ──────────────────────────
 *
 * There is no tank size and no L/100 km in the data, and a factory figure is
 * never assumed. So consumption is either what the user typed, or derived
 * from refuels that recorded "range after": the jump in range across a refuel
 * divided by the litres bought is how many km of DASHBOARD range a litre
 * buys. That is the dashboard's own estimate, not a measured figure, which is
 * why every result is shown as approximate ("≈").
 *
 * ── A TRIP'S COST IS RECOMPUTED, NEVER STORED ────────────────────────────
 *
 * Like range used, the estimate is a pure function of the whole log: edit a
 * refuel or type a consumption and every trip's figure follows. The distance
 * travelled is the trip's distance when it has one (GPS or typed), else the
 * range it used. The price is the latest refuel at or before the trip — that
 * is the fuel that was in the tank. Missing any input means no estimate,
 * never a guess.
 */

import { t } from '../i18n';
import type { Entry, RefuelEntry, TripEntry } from '../types';
import { rangeUsedById } from './entries';
import { parseNumber } from './numbers';

function sortedAsc(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function refuelsAsc(entries: Entry[]): RefuelEntry[] {
  return sortedAsc(entries).filter((e): e is RefuelEntry => e.kind === 'refuel' && e.liters > 0);
}

/** AMD per litre of the most recent refuel (optionally: at or before `atOrBefore`). */
export function latestPricePerLiter(entries: Entry[], atOrBefore = Infinity): number | undefined {
  const r = refuelsAsc(entries).filter((e) => e.at <= atOrBefore);
  const last = r[r.length - 1];
  return last ? last.priceAmd / last.liters : undefined;
}

/**
 * km of dashboard range per litre, averaged over refuels that recorded range
 * after AND have a range reading before them. A refuel the range did not rise
 * across tells nothing and is skipped. Undefined when no refuel qualifies.
 */
export function kmPerLiterFromRefuels(entries: Entry[]): number | undefined {
  const asc = sortedAsc(entries);
  const gains: number[] = [];
  asc.forEach((e, i) => {
    if (e.kind !== 'refuel' || e.liters <= 0 || e.rangeKm === undefined) return;
    let before: number | undefined;
    for (let j = i - 1; j >= 0; j--) {
      const r = asc[j].rangeKm;
      if (r !== undefined) {
        before = r;
        break;
      }
    }
    if (before === undefined) return;
    const gained = e.rangeKm - before;
    if (gained > 0) gains.push(gained / e.liters);
  });
  return gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : undefined;
}

/** Typed L/100 km wins; otherwise the log's figure. Returns km per litre. */
export function effectiveKmPerLiter(
  entries: Entry[],
  typedConsumption: string | undefined,
): number | undefined {
  const typed = typedConsumption ? parseNumber(typedConsumption) : undefined;
  if (typed !== undefined && typed > 0) return 100 / typed;
  return kmPerLiterFromRefuels(entries);
}

const ok = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n > 0;

export type FuelResult = { liters: number; amd: number };

/** What `km` costs. Whole dram. */
export function fuelCost(
  km: number | undefined,
  kmPerL: number | undefined,
  price: number | undefined,
): FuelResult | undefined {
  if (!ok(km) || !ok(kmPerL) || !ok(price)) return undefined;
  const liters = km / kmPerL;
  return { liters, amd: Math.round(liters * price) };
}

/** How far `amd` takes the car. Whole km. */
export function kmForMoney(
  amd: number | undefined,
  kmPerL: number | undefined,
  price: number | undefined,
): { liters: number; km: number } | undefined {
  if (!ok(amd) || !ok(kmPerL) || !ok(price)) return undefined;
  const liters = amd / price;
  return { liters, km: Math.round(liters * kmPerL) };
}

/** The approximate fuel and money a trip used, or undefined when any input is missing. */
export function tripFuelEstimate(
  trip: TripEntry,
  entries: Entry[],
  rangeUsed: number | undefined,
  kmPerL: number | undefined,
): FuelResult | undefined {
  const km = trip.distanceKm !== undefined && trip.distanceKm > 0 ? trip.distanceKm : rangeUsed;
  return fuelCost(km, kmPerL, latestPricePerLiter(entries, trip.at));
}

/**
 * Every trip's estimate at once, for the Log: one pass in time order keeps
 * the price of the latest refuel so far, instead of re-sorting the log per row.
 * Same rules as `tripFuelEstimate`.
 */
export function tripEstimates(
  entries: Entry[],
  used: Map<string, number>,
  kmPerL: number | undefined,
): Map<string, FuelResult> {
  const out = new Map<string, FuelResult>();
  let price: number | undefined;
  // Refuels sort before trips at the same instant, matching `at <= trip.at`.
  const asc = [...entries].sort(
    (a, b) => a.at - b.at || Number(b.kind === 'refuel') - Number(a.kind === 'refuel'),
  );
  for (const e of asc) {
    if (e.kind === 'refuel' && e.liters > 0) price = e.priceAmd / e.liters;
    if (e.kind !== 'trip') continue;
    const km = e.distanceKm !== undefined && e.distanceKm > 0 ? e.distanceKm : used.get(e.id);
    const r = fuelCost(km, kmPerL, price);
    if (r) out.set(e.id, r);
  }
  return out;
}

export type PeriodCost = { amd: number; liters: number; trips: number };

/**
 * What the driving in `fromMs <= at < toMs` cost: the sum of the trips' own
 * estimates (`tripEstimates`), so the Summary total always equals the figures
 * the Log shows per trip. A trip without an estimate (no price before it, no
 * distance or range used) adds nothing rather than a guess; undefined when no
 * trip in the period has one, so the tile can say "—" instead of 0 AMD.
 */
export function periodFuelCost(
  entries: Entry[],
  fromMs: number,
  toMs: number,
  kmPerL: number | undefined,
): PeriodCost | undefined {
  // Over the FULL list, like `summarize`: price and range used come from earlier entries.
  const estimates = tripEstimates(entries, rangeUsedById(entries), kmPerL);
  let cost: PeriodCost | undefined;
  for (const e of entries) {
    if (e.kind !== 'trip' || e.at < fromMs || e.at >= toMs) continue;
    const est = estimates.get(e.id);
    if (!est) continue;
    cost ??= { amd: 0, liters: 0, trips: 0 };
    cost.amd += est.amd;
    cost.liters += est.liters;
    cost.trips += 1;
  }
  return cost;
}

/** Local midnight of the day containing `at`, moved `days` days, via Date so DST stays whole. */
export function shiftDay(at: number, days: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** [start of FROM, start of the day after TO) — both inclusive days, in local time. */
export function customPeriod(fromDay: number, toDay: number): [number, number] {
  const a = shiftDay(Math.min(fromDay, toDay), 0);
  const b = shiftDay(Math.max(fromDay, toDay), 1);
  return [a, b];
}

/** The custom range's stepper rules: FROM ≤ TO ≤ today. Returns the clamped pair. */
export function clampCustomRange(fromDay: number, toDay: number, now: number): [number, number] {
  const today = shiftDay(now, 0);
  const to = Math.min(shiftDay(toDay, 0), today);
  const from = Math.min(shiftDay(fromDay, 0), to);
  return [from, to];
}

export type CalcMode = 'km' | 'amd';

export type CalcOutcome =
  | { ok: true; result: number; unit: 'AMD' | 'km'; liters: number; price: number }
  | { ok: false; missing: string };

/**
 * The Summary calculator. Blank price = the latest refuel's AMD/L; blank
 * consumption = the log's figure. The first missing input is named, in the
 * order the user would fill them, in the current language (it is shown as is).
 */
export function calculate(input: {
  mode: CalcMode;
  amount: string;
  price: string;
  consumption: string;
  entries: Entry[];
}): CalcOutcome {
  const amount = parseNumber(input.amount);
  const typedPrice = parseNumber(input.price);
  const price =
    typedPrice !== undefined && typedPrice > 0 ? typedPrice : latestPricePerLiter(input.entries);
  const kmPerL = effectiveKmPerLiter(input.entries, input.consumption);
  if (!ok(amount))
    return {
      ok: false,
      missing: t(input.mode === 'km' ? 'summary.calc.enterDistance' : 'summary.calc.enterAmount'),
    };
  if (!ok(price)) return { ok: false, missing: t('summary.calc.enterPrice') };
  // Consumption is set on the Settings screen now, so the prompt sends the user there.
  if (!ok(kmPerL)) return { ok: false, missing: t('summary.calc.setConsumption') };
  // Inputs are all present here, so both always produce a result.
  const cost = fuelCost(amount, kmPerL, price);
  const reach = kmForMoney(amount, kmPerL, price);
  if (input.mode === 'km' && cost) {
    return { ok: true, result: cost.amd, unit: 'AMD', liters: cost.liters, price };
  }
  if (input.mode === 'amd' && reach) {
    return { ok: true, result: reach.km, unit: 'km', liters: reach.liters, price };
  }
  return { ok: false, missing: t('summary.calc.setConsumption') };
}
