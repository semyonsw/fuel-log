/**
 * Numbers in, numbers out — the two edges where the user's habits meet the model.
 *
 * ── IN: PARSE THE WAY THE NOTES WERE WRITTEN ─────────────────────────────
 *
 * The Samsung Notes this app replaces say "33,4km" and "15 000 amd". So a comma
 * is a DECIMAL separator, never a thousands one: the user has never written
 * "15,000" for a price, and has written "33,4" for a distance many times. Spaces
 * are dropped wherever they are, which is what makes "15 000" one number. A
 * trailing unit is tolerated because people type what they see on the dashboard.
 * Anything else — negatives, two decimal points, words — is `undefined`, and the
 * form decides whether that is an error or just an empty optional field.
 *
 * ── OUT: NO `Intl` ────────────────────────────────────────────────────────
 *
 * Hermes ships with partial `Intl`, and `toLocaleString` on Android has printed
 * both "15,000" and "15 000" depending on the build. The grouping here is done by
 * hand so the screen says the same thing on every phone and in every test.
 */

/** A trailing unit the user may have typed after the number. Longest first so "amd" wins. */
const UNIT = /(km|amd|l|֏)$/i;

/** A plain non-negative decimal once spaces, unit and comma are dealt with. */
const PLAIN = /^(\d+(\.\d*)?|\.\d+)$/;

export function parseNumber(input: string): number | undefined {
  // `\s` covers the no-break space a pasted "15 000" often carries.
  const compact = input.replace(/\s+/g, '').replace(UNIT, '').replace(',', '.');
  if (!PLAIN.test(compact)) return undefined;
  const value = Number(compact);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Rounds to `digits` decimals and drops the zeros a dashboard would not show. */
function trimmed(n: number, digits: number): string {
  const fixed = n.toFixed(digits);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** "22.5 km", "107 km". One decimal is as precise as a trip meter gets. */
export function formatKm(n: number): string {
  return `${trimmed(n, 1)} km`;
}

/** "30 L", "32.47 L". Two decimals, because the pump receipt has two. */
export function formatLiters(n: number): string {
  return `${trimmed(n, 2)} L`;
}

/** "15 000 AMD". Whole dram — nobody is handed luma at a petrol station. */
export function formatAmd(n: number): string {
  const rounded = Math.round(n);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '-' : ''}${digits} AMD`;
}
