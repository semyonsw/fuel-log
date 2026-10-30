/**
 * Service reminders: "oil again in 10 000 km or 12 months, whichever comes first".
 *
 * A reminder is derived, never stored. It comes from the newest service entry
 * of each category that set `remindKm` and/or `remindMonths`, so logging a new
 * oil change is what clears the old oil reminder — there is nothing to tick
 * off. If that newest service set no rule, the category has no reminder: the
 * work was done, and the user chose not to be reminded again.
 *
 * ── TWO CLOCKS, THE EARLIER WINS ─────────────────────────────────────────
 *
 * By date: `at` + `remindMonths` calendar months, in local time, clamped to
 * the month's last day (Jan 31 + 1 month is Feb 28/29, as a workshop sticker
 * would read, not Mar 3 as `Date` overflow would give).
 * By km: the service's odometer + `remindKm`. Without an odometer on the
 * service there is no km baseline, so only the date rule applies.
 * The reminder's state is the worse of the two.
 *
 * ── HOW FAR THE CAR HAS GONE ─────────────────────────────────────────────
 *
 * Odometer readings are sparse: only services and (optionally) refuels carry
 * one. The newest reading is the anchor (never below the service's own
 * odometer — a lower number later is a typo, not a rewound car), and trips
 * logged after it are added on as an estimate. Trips without a distance count
 * as 0, so the estimate only ever errs towards "later". When the estimate
 * contributed anything, the km figure is shown with "≈".
 */

import { plural, t } from '../i18n';
import type { Entry, ServiceCategory, ServiceEntry } from '../types';

import { formatKm } from './numbers';

/** A date reminder turns "soon" this many days before it is due. */
export const SOON_DAYS = 30;
/** A km reminder turns "soon" this many km before it is due. */
export const SOON_KM = 1000;

export type ReminderState = 'ok' | 'soon' | 'due';

export interface Reminder {
  serviceId: string;
  category: ServiceCategory;
  /** When it is due by date (same time of day as the service), when a month rule is set. */
  dueAt?: number;
  /** Odometer at which it is due, when a km rule is set and the service has an odometer. */
  dueKm?: number;
  /** Best guess at the odometer now (anchor + trips since); set with `dueKm`. */
  odometerNowKm?: number;
  /** Calendar days until `dueAt` (0 = today, negative = overdue). */
  daysLeft?: number;
  /** km until `dueKm` (negative = overdue). */
  kmLeft?: number;
  /** State of each rule on its own, so the UI can say which one fired. */
  dateState?: ReminderState;
  kmState?: ReminderState;
  state: ReminderState;
  /** The km figures rely on trip distances added to the last odometer reading. */
  estimated: boolean;
}

const RANK: Record<ReminderState, number> = { ok: 0, soon: 1, due: 2 };

/** `at` plus whole calendar months, local time, day clamped to the target month's end. */
export function addMonths(at: number, months: number): number {
  const d = new Date(at);
  const day = d.getDate();
  const target = new Date(
    d.getFullYear(),
    d.getMonth() + months,
    1,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target.getTime();
}

function localDayStart(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Calendar days from `now`'s day to `at`'s day; rounding absorbs a 23/25-hour DST day. */
export function calendarDaysBetween(now: number, at: number): number {
  return Math.round((localDayStart(at) - localDayStart(now)) / 86_400_000);
}

function odometerOf(e: Entry): number | undefined {
  return (e.kind === 'service' || e.kind === 'refuel') && e.odometerKm !== undefined
    ? e.odometerKm
    : undefined;
}

/** The newest odometer reading and the trip km logged after it. */
function odometerNow(entries: Entry[]): { km: number; at: number; tripsKm: number } | undefined {
  let anchor: { km: number; at: number } | undefined;
  for (const e of entries) {
    const km = odometerOf(e);
    if (km !== undefined && (!anchor || e.at > anchor.at)) anchor = { km, at: e.at };
  }
  if (!anchor) return undefined;
  let tripsKm = 0;
  for (const e of entries) {
    if (e.kind === 'trip' && e.at > anchor.at) tripsKm += e.distanceKm ?? 0;
  }
  return { ...anchor, tripsKm };
}

/** Newest service per category; ties on time fall to the larger id so the pick is stable. */
function latestServices(entries: Entry[]): ServiceEntry[] {
  const latest = new Map<ServiceCategory, ServiceEntry>();
  for (const e of entries) {
    if (e.kind !== 'service') continue;
    const cur = latest.get(e.category);
    if (!cur || e.at > cur.at || (e.at === cur.at && e.id > cur.id)) latest.set(e.category, e);
  }
  return [...latest.values()];
}

function stateOf(left: number, soonWithin: number): ReminderState {
  if (left <= 0) return 'due';
  if (left <= soonWithin) return 'soon';
  return 'ok';
}

/** Every active reminder, most urgent first: due, then soon, then ok; sooner date first within a state. */
export function reminderStatus(entries: Entry[], now: number): Reminder[] {
  const odo = odometerNow(entries);
  const out: Reminder[] = [];

  for (const s of latestServices(entries)) {
    const months = s.remindMonths !== undefined && s.remindMonths > 0 ? s.remindMonths : undefined;
    const km =
      s.remindKm !== undefined && s.remindKm > 0 && s.odometerKm !== undefined
        ? { base: s.odometerKm, every: s.remindKm }
        : undefined;
    if (months === undefined && km === undefined) continue;

    const r: Reminder = {
      serviceId: s.id,
      category: s.category,
      state: 'ok',
      estimated: false,
    };

    if (months !== undefined) {
      r.dueAt = addMonths(s.at, months);
      r.daysLeft = calendarDaysBetween(now, r.dueAt);
      r.dateState = stateOf(r.daysLeft, SOON_DAYS);
    }

    if (km) {
      r.dueKm = km.base + km.every;
      // `odo` always exists here (the service itself carries an odometer); `??` is for the types.
      const anchorKm = Math.max(odo?.km ?? km.base, km.base);
      const tripsKm = odo?.tripsKm ?? 0;
      r.odometerNowKm = anchorKm + tripsKm;
      r.estimated = tripsKm > 0;
      r.kmLeft = r.dueKm - r.odometerNowKm;
      r.kmState = stateOf(r.kmLeft, SOON_KM);
    }

    const date = r.dateState ?? 'ok';
    const dist = r.kmState ?? 'ok';
    r.state = RANK[date] >= RANK[dist] ? date : dist;
    out.push(r);
  }

  return out.sort(
    (x, y) =>
      RANK[y.state] - RANK[x.state] ||
      (x.daysLeft ?? Infinity) - (y.daysLeft ?? Infinity) ||
      (x.kmLeft ?? Infinity) - (y.kmLeft ?? Infinity),
  );
}

function daysText(n: number): string {
  return plural('care.days', n);
}

function kmText(n: number, estimated: boolean): string {
  const km = formatKm(Math.round(n));
  return estimated ? `≈ ${km}` : km;
}

/**
 * One line for the banner and notification body: "in 12 days", "in ≈ 800 km",
 * "overdue by 3 days / 200 km", "due today". Only the rules that are soon or
 * due are mentioned — an "ok" clock would just be noise next to the urgent one.
 */
export function describeReminder(r: Reminder): string {
  if (r.state === 'due') {
    const over: string[] = [];
    if (r.daysLeft !== undefined && r.daysLeft < 0) over.push(daysText(-r.daysLeft));
    if (r.kmLeft !== undefined && r.kmLeft < 0) over.push(kmText(-r.kmLeft, r.estimated));
    return over.length > 0 ? t('care.overdueBy', { what: over.join(' / ') }) : t('care.dueNow');
  }
  const ahead: string[] = [];
  if (r.dateState && r.dateState !== 'ok' && r.daysLeft !== undefined) {
    ahead.push(daysText(r.daysLeft));
  }
  if (r.kmState && r.kmState !== 'ok' && r.kmLeft !== undefined) {
    ahead.push(kmText(r.kmLeft, r.estimated));
  }
  // An "ok" reminder has no urgent clock; say the nearest one so the line is never empty.
  if (ahead.length === 0) {
    if (r.daysLeft !== undefined) ahead.push(daysText(r.daysLeft));
    else if (r.kmLeft !== undefined) ahead.push(kmText(r.kmLeft, r.estimated));
  }
  return t('care.in', { what: ahead.join(' / ') });
}
