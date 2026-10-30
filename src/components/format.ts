/**
 * Small display helpers the UI needs that src/lib doesn't provide.
 *
 * Kept here rather than in src/lib because lib is owned by the data layer and
 * these are purely presentational (how a delta or a unit reads).
 */

/** A bare number with at most one decimal: 15 → "15", 14.25 → "14.3". */
export function formatDelta(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * Splits a lib-formatted quantity into number and unit ("15 000 AMD" →
 * ["15 000", "AMD"]) so stat tiles can draw the number big and the unit small
 * while still using lib's formatting (thousands separators etc.).
 */
export function splitUnit(formatted: string): [string, string] {
  const i = formatted.lastIndexOf(' ');
  return i < 0 ? [formatted, ''] : [formatted.slice(0, i), formatted.slice(i + 1)];
}

/** Local [start, end) of the day containing `at`, via Date so DST days stay whole. */
export function dayBounds(at: number): [number, number] {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  d.setDate(d.getDate() + 1);
  return [start, d.getTime()];
}
