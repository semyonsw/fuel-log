/**
 * GPS tracks: distance, cleaning, and shrinking — offline math, no map service.
 *
 * ── DISTANCE IS THE SUM OF HAVERSINES ────────────────────────────────────
 *
 * A trip is a few hundred fixes a few metres apart, so the great-circle
 * distance between consecutive fixes, summed, is as exact as the fixes are.
 * Nothing keyed or paid is needed, and it works with no connection.
 *
 * ── JITTER IS FILTERED BEFORE IT IS SUMMED ───────────────────────────────
 *
 * A phone parked at a red light still reports fixes that wander a few metres;
 * summed, a long wait adds hundreds of phantom metres. Two rules remove that:
 * a fix whose own accuracy is worse than 30 m is dropped (it is noise by its
 * own admission), and a fix closer than 10 m to the last KEPT one is dropped
 * (a real car at city speed covers that in well under a second).
 *
 * ── SIMPLIFIED BEFORE IT IS STORED ───────────────────────────────────────
 *
 * AsyncStorage on Android has a small size budget, and a straight avenue does
 * not need a point every 10 m. Ramer–Douglas–Peucker at 7 m keeps every corner
 * that matters on a city map and typically drops most of the points. Distance
 * is measured on the filtered track BEFORE simplifying, because simplifying
 * cuts corners and would under-count.
 */

import type { TrackPoint } from '../types';

const EARTH_RADIUS_M = 6_371_008.8;
export const MAX_ACCURACY_M = 30;
export const MIN_STEP_M = 10;
export const SIMPLIFY_TOLERANCE_M = 7;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A raw fix as the location service delivers it; accuracy may be unknown. */
export type RawFix = TrackPoint & { accuracy?: number | null };

/** Drops low-accuracy fixes and stationary wander; output is time-ordered. */
export function filterJitter(fixes: RawFix[]): TrackPoint[] {
  const kept: TrackPoint[] = [];
  for (const f of [...fixes].sort((a, b) => a.t - b.t)) {
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) continue;
    if (f.accuracy != null && f.accuracy > MAX_ACCURACY_M) continue;
    const last = kept[kept.length - 1];
    if (last && haversineM(last, f) < MIN_STEP_M) continue;
    kept.push({ lat: f.lat, lon: f.lon, t: f.t });
  }
  return kept;
}

/** Total length of a track in km. */
export function trackDistanceKm(track: TrackPoint[]): number {
  let m = 0;
  for (let i = 1; i < track.length; i++) m += haversineM(track[i - 1], track[i]);
  return m / 1000;
}

/**
 * Metres from `p` to segment a–b, on a local flat projection — exact enough
 * over the few hundred metres a segment spans.
 */
function segmentDistanceM(p: TrackPoint, a: TrackPoint, b: TrackPoint): number {
  const k = Math.cos(rad(a.lat));
  const toXY = (q: TrackPoint) => [rad(q.lon) * k * EARTH_RADIUS_M, rad(q.lat) * EARTH_RADIUS_M];
  const [px, py] = toXY(p);
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Ramer–Douglas–Peucker; always keeps the first and last point. Iterative, so long drives can't overflow the stack. */
export function simplifyTrack(track: TrackPoint[], toleranceM = SIMPLIFY_TOLERANCE_M) {
  if (track.length <= 2) return [...track];
  const keep = new Array<boolean>(track.length).fill(false);
  keep[0] = keep[track.length - 1] = true;
  const stack: [number, number][] = [[0, track.length - 1]];
  for (let range = stack.pop(); range; range = stack.pop()) {
    const [s, e] = range;
    let worst = -1;
    let worstD = 0;
    for (let i = s + 1; i < e; i++) {
      const d = segmentDistanceM(track[i], track[s], track[e]);
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst !== -1 && worstD > toleranceM) {
      keep[worst] = true;
      stack.push([s, worst], [worst, e]);
    }
  }
  return track.filter((_, i) => keep[i]);
}

/** Raw fixes → what a trip stores and the distance it pre-fills. */
export function processTrack(fixes: RawFix[]): { track: TrackPoint[]; distanceKm: number } {
  const clean = filterJitter(fixes);
  return { track: simplifyTrack(clean), distanceKm: trackDistanceKm(clean) };
}

/** [west, south, east, north], the order MapLibre's camera takes. */
export function trackBounds(track: TrackPoint[]): [number, number, number, number] | undefined {
  if (track.length === 0) return undefined;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of track) {
    w = Math.min(w, p.lon);
    e = Math.max(e, p.lon);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [w, s, e, n];
}

/**
 * The track fitted into a `width`×`height` box (north up, aspect kept), for
 * drawing without a map: the Log row preview and the offline fallback.
 */
export function projectTrack(
  track: TrackPoint[],
  width: number,
  height: number,
  padding = 4,
): { x: number; y: number }[] {
  const b = trackBounds(track);
  if (!b) return [];
  const [w, s, e, n] = b;
  const k = Math.cos(rad((s + n) / 2));
  const spanX = (e - w) * k;
  const spanY = n - s;
  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  const scale = Math.min(
    spanX > 0 ? innerW / spanX : Infinity,
    spanY > 0 ? innerH / spanY : Infinity,
  );
  const sc = Number.isFinite(scale) ? scale : 0;
  const offX = padding + (innerW - spanX * sc) / 2;
  const offY = padding + (innerH - spanY * sc) / 2;
  return track.map((p) => ({ x: offX + (p.lon - w) * k * sc, y: offY + (n - p.lat) * sc }));
}
