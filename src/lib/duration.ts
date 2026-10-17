/**
 * How long a GPS-recorded trip took, as the map badge shows it.
 *
 * ── FIRST FIX TO LAST FIX ────────────────────────────────────────────────
 *
 * The track's own timestamps are the only honest clock: the entry's `at` is
 * editable and says when, not how long. The span from the first kept fix to
 * the last is the drive; a wait at a light inside it is part of the trip, so
 * nothing is subtracted.
 *
 * ── ROUNDED TO THE MINUTE, WORDS IN ONE PLACE ────────────────────────────
 *
 * Seconds are noise on a dashboard-style log, so the span is rounded to the
 * nearest minute: "24 min", "1h 34m", and "2h" when the minutes are zero (a
 * trailing "0m" is clutter). Under half a minute reads "<1 min" rather than
 * "0 min", which would look like a recording that failed. Every word the badge
 * prints lives in DURATION_WORDS, which reads the current language's
 * `lib.duration.*` strings at call time (abbreviations, so no plural forms).
 */

import { t } from '../i18n';
import type { TrackPoint } from '../types';

export const DURATION_WORDS = {
  lessThanMinute: () => t('lib.duration.lessThanMinute'),
  minutes: (m: number) => t('lib.duration.minutes', { m }),
  hours: (h: number) => t('lib.duration.hours', { h }),
  hoursMinutes: (h: number, m: number) => t('lib.duration.hoursMinutes', { h, m }),
} as const;

/** Milliseconds from first to last fix; undefined when there is no span to show. */
export function trackDurationMs(track: TrackPoint[] | undefined): number | undefined {
  if (!track || track.length < 2) return undefined;
  const ms = track[track.length - 1].t - track[0].t;
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

/** "<1 min", "24 min", "1h 34m", "2h". */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 60_000);
  if (total < 1) return DURATION_WORDS.lessThanMinute();
  if (total < 60) return DURATION_WORDS.minutes(total);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? DURATION_WORDS.hours(h) : DURATION_WORDS.hoursMinutes(h, m);
}
