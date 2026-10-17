/**
 * The full-screen map's zoom buttons and its claim on touches inside the
 * scrolling edit screen.
 *
 * ── ONE WHOLE LEVEL PER TAP, CLAMPED ─────────────────────────────────────
 *
 * The + and − buttons move one whole zoom level, because each level doubles or
 * halves the scale: a visible change per tap, and a pinch can still land
 * anywhere in between (so a fractional zoom stays fractional). The clamp keeps
 * a burst of taps from flying past what the tiles can show, and the next tap
 * the other way from having to climb back first.
 *
 * ── THE MAP HOLDS THE GESTURE UNTIL THE LAST FINGER LIFTS ────────────────
 *
 * The map sits inside the edit screen's ScrollView. While any finger that
 * started on the map is still down, the ScrollView must not scroll: otherwise
 * a pinch whose fingers slide past the map's edge turns into a page scroll and
 * the zoom is lost. A pinch lifts one finger at a time, so an `end` with
 * fingers left keeps the hold; a `cancel` means the system took the gesture
 * away, so the hold goes with it.
 */

/** Below 3 a city trip is a speck; above 20 is past street detail on OpenFreeMap tiles. */
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 20;

/** The zoom after one tap of + (1) or − (-1). */
export function stepZoom(current: number, step: 1 | -1): number {
  // The map may not have reported a zoom yet; start from the bottom of the
  // range rather than passing NaN on to the camera.
  if (!Number.isFinite(current)) return step > 0 ? MIN_ZOOM + 1 : MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + step));
}

export type MapTouchKind = 'start' | 'end' | 'cancel';

/** Whether the map still holds the gesture after this raw touch event. */
export function mapHeldAfter(kind: MapTouchKind, fingersLeft: number): boolean {
  switch (kind) {
    case 'start':
      return true;
    case 'end':
      return fingersLeft > 0;
    case 'cancel':
      return false;
  }
}
