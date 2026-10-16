/**
 * Naming a recorded track's ends from the log, without a geocoding service.
 *
 * Every tracked trip pairs coordinates with names the user chose: its first
 * point is `from`, its last is `to`. A new track that starts or ends within a
 * short walk of one of those known points is very likely the same place, so
 * that name is offered. The nearest known point wins; nothing within the
 * radius means no guess, and the field stays empty for the user to type.
 */

import type { Entry, TrackPoint } from '../types';
import { haversineM } from './geo';
import { normalizePlace } from './places';

/** About a car park's width plus GPS error at the moment of starting. */
export const PLACE_RADIUS_M = 250;

type Known = { name: string; lat: number; lon: number };

function knownPoints(entries: Entry[]): Known[] {
  const out: Known[] = [];
  for (const e of entries) {
    if (e.kind !== 'trip' || !e.track || e.track.length === 0) continue;
    const first = e.track[0];
    const last = e.track[e.track.length - 1];
    if (normalizePlace(e.from)) out.push({ name: normalizePlace(e.from), ...first });
    if (normalizePlace(e.to)) out.push({ name: normalizePlace(e.to), ...last });
  }
  return out;
}

export function guessPlace(
  entries: Entry[],
  point: TrackPoint | undefined,
  radiusM = PLACE_RADIUS_M,
): string | undefined {
  if (!point) return undefined;
  let best: { name: string; d: number } | undefined;
  for (const k of knownPoints(entries)) {
    const d = haversineM(k, point);
    if (d <= radiusM && (!best || d < best.d)) best = { name: k.name, d };
  }
  return best?.name;
}

/** From/To guesses for a whole track. */
export function guessEnds(entries: Entry[], track: TrackPoint[]) {
  return {
    from: guessPlace(entries, track[0]),
    to: guessPlace(entries, track[track.length - 1]),
  };
}
