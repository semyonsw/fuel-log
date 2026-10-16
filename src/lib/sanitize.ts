/**
 * Whatever is read back — from AsyncStorage or from a backup file someone
 * picked — is trusted only this far: an array of objects that carry an id, a
 * time and a known kind. One bad row is dropped, not the whole log, and a
 * malformed GPS track is dropped from its trip rather than taking the trip
 * with it (the trip itself was typed and is still worth having).
 */

import type { Entry, TrackPoint } from '../types';

const KINDS = new Set(['trip', 'reading', 'refuel']);

function isPoint(p: unknown): p is TrackPoint {
  const q = p as TrackPoint;
  return (
    typeof q === 'object' &&
    q !== null &&
    Number.isFinite(q.lat) &&
    Number.isFinite(q.lon) &&
    Number.isFinite(q.t)
  );
}

export function sanitizeEntries(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is Entry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Entry).id === 'string' &&
        typeof (e as Entry).at === 'number' &&
        KINDS.has((e as Entry).kind),
    )
    .map((e) => {
      if (e.kind !== 'trip' || e.track === undefined) return e;
      if (Array.isArray(e.track) && e.track.every(isPoint)) return e;
      const { track: _drop, ...rest } = e;
      return rest;
    });
}
