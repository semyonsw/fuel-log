/**
 * Reading the log: ordering, the derived "range used", days, and totals.
 *
 * Everything here is a pure function of the entry list, so the screens never hold
 * a second copy of anything that could disagree with the store.
 *
 * ── RANGE USED IS DERIVED, NEVER TYPED ───────────────────────────────────
 *
 * A note said "107km benzin" — the dashboard's estimate of what is left. What a
 * trip COST is the drop from the reading before it, so it is computed here and
 * not stored: edit an earlier entry and every later figure follows. Two things
 * make a drop meaningless, and both are skipped rather than shown as nonsense:
 *
 *  - A refuel between the two readings. Range went up somewhere in between, so
 *    the difference mixes driving with filling. A refuel that recorded its own
 *    range is the clean new starting point instead.
 *  - A negative drop. The dashboard re-estimates from recent consumption and can
 *    tick UP after a gentle stretch; that is not "negative fuel used".
 *
 * ── DAYS ARE LOCAL ───────────────────────────────────────────────────────
 *
 * A drive at 23:40 belongs to the evening the user lived, so day keys, labels and
 * period starts are all local time, and day arithmetic goes through `Date`
 * rather than 86,400,000 ms so a DST night does not shift a week boundary.
 * Names are written out by hand because Hermes' `Intl` is incomplete on Android,
 * one table per language in `i18n/strings/lib.ts`, read at call time so a
 * language switch is picked up by the next render.
 */

import { t, type StringKey } from '../i18n';
import type { Entry, TripEntry } from '../types';

/** Newest first; equal times fall back to id so a list never reshuffles on re-render. */
export function sortNewestFirst(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => b.at - a.at || compareIds(b.id, a.id));
}

function sortOldestFirst(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => a.at - b.at || compareIds(a.id, b.id));
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Entry id → km of range used since the previous reading. Only meaningful drops appear. */
export function rangeUsedById(entries: Entry[]): Map<string, number> {
  const used = new Map<string, number>();
  let baseline: number | undefined;
  let refuelSinceBaseline = false;

  for (const entry of sortOldestFirst(entries)) {
    if (entry.rangeKm === undefined) {
      if (entry.kind === 'refuel') refuelSinceBaseline = true;
      continue;
    }
    if (entry.kind !== 'refuel' && baseline !== undefined && !refuelSinceBaseline) {
      const drop = baseline - entry.rangeKm;
      if (drop >= 0) used.set(entry.id, drop);
    }
    // Any reading — a refuel's included — is the best estimate from here on.
    baseline = entry.rangeKm;
    refuelSinceBaseline = false;
  }
  return used;
}

/** What the dashboard said most recently, if anything ever recorded it. */
export function currentRangeKm(entries: Entry[]): number | undefined {
  return sortNewestFirst(entries).find((e) => e.rangeKm !== undefined)?.rangeKm;
}

/** "4micro → Charents school". Empty parts are skipped so a half-filled trip still reads. */
export function routeLabel(trip: TripEntry): string {
  return [trip.from, ...trip.stops, trip.to]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(' → ');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` in LOCAL time — sortable, comparable, usable as a key. */
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * "Today", "Yesterday", "Thu, 15 Oct", or "Thu, 15 Oct 2025" for another year,
 * in the current language ("Чт, 15 окт", "Հնգ, 15 հոկ").
 */
export function dayLabel(key: string, now: number): string {
  if (key === dayKey(now)) return t('common.today');
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday.getTime())) return t('common.yesterday');

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return key;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const label = t('lib.date.day', {
    weekday: t(`lib.weekday.${date.getDay()}` as StringKey),
    date: date.getDate(),
    month: t(`lib.month.${date.getMonth()}` as StringKey),
  });
  return date.getFullYear() === new Date(now).getFullYear()
    ? label
    : `${label} ${date.getFullYear()}`;
}

/** "13:31" — 24-hour, as the notes were written. */
export function formatTime(at: number): string {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface DayGroup {
  key: string;
  label: string;
  entries: Entry[];
}

/** The log as the list shows it: newest day first, newest entry first inside it. */
export function groupByDay(entries: Entry[], now: number): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const entry of sortNewestFirst(entries)) {
    const key = dayKey(entry.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, label: dayLabel(key, now), entries: [entry] });
  }
  return groups;
}

export type Summary = {
  trips: number;
  distanceKm: number;
  rangeUsedKm: number;
  refuels: number;
  liters: number;
  spentAmd: number;
};

/** Totals for `fromMs <= at < toMs`. */
export function summarize(entries: Entry[], fromMs: number, toMs: number): Summary {
  // Over the FULL list: the first trip of the week still used fuel even though
  // the reading it is measured from was taken last Sunday.
  const used = rangeUsedById(entries);
  const summary: Summary = {
    trips: 0,
    distanceKm: 0,
    rangeUsedKm: 0,
    refuels: 0,
    liters: 0,
    spentAmd: 0,
  };
  for (const entry of entries) {
    if (entry.at < fromMs || entry.at >= toMs) continue;
    summary.rangeUsedKm += used.get(entry.id) ?? 0;
    if (entry.kind === 'trip') {
      summary.trips += 1;
      summary.distanceKm += entry.distanceKm ?? 0;
    } else if (entry.kind === 'refuel') {
      summary.refuels += 1;
      summary.liters += entry.liters;
      summary.spentAmd += entry.priceAmd;
    }
  }
  return summary;
}

/**
 * Local start of the period containing `now`: today 00:00, Monday 00:00, the
 * 1st 00:00, or 0 for all time.
 */
export function periodStart(period: 'today' | 'week' | 'month' | 'all', now: number): number {
  if (period === 'all') return 0;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'today') return d.getTime();
  if (period === 'month') d.setDate(1);
  // Weeks start on Monday, as they do in Armenia; getDay() counts from Sunday.
  else d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
