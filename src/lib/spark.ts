/**
 * The range card's sparkline: the last ten range readings as a line, with a
 * drop marker wherever a refuel fell between them.
 *
 * Points are spaced by ORDER, not time — a quiet weekend should not squash a
 * busy Monday into one pixel. Refuels take a slot of their own so the jump
 * up after a fill-up reads as "filled here", not as a sudden gain. Fewer than
 * two readings is not a trend, and nothing is drawn.
 */

import type { Entry } from '../types';

export type Spark = {
  line: { x: number; y: number }[];
  /** x of each refuel marker. */
  drops: number[];
};

export const SPARK_READINGS = 10;

export function rangeSpark(entries: Entry[], width: number, height: number): Spark | undefined {
  const asc = [...entries].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const withRange = asc.map((e, i) => (e.rangeKm !== undefined ? i : -1)).filter((i) => i >= 0);
  const window = withRange.slice(-SPARK_READINGS);
  if (window.length < 2) return undefined;

  // Start just after the reading before the window, so a refuel between it and
  // the window's first reading is still shown.
  const start =
    withRange.length > window.length ? withRange[withRange.length - window.length - 1] + 1 : 0;
  const seq = asc
    .slice(start, window[window.length - 1] + 1)
    .filter((e) => e.rangeKm !== undefined || e.kind === 'refuel');

  const values = seq.filter((e) => e.rangeKm !== undefined).map((e) => e.rangeKm as number);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const padX = 8;
  const top = 6;
  const span = height - top - 8;
  const X = (i: number) =>
    padX + (seq.length === 1 ? 0 : (i * (width - 2 * padX)) / (seq.length - 1));
  const Y = (v: number) => top + (max === min ? span / 2 : ((max - v) / (max - min)) * span);

  const line: Spark['line'] = [];
  const drops: number[] = [];
  seq.forEach((e, i) => {
    if (e.rangeKm !== undefined) line.push({ x: X(i), y: Y(e.rangeKm) });
    if (e.kind === 'refuel') drops.push(X(i));
  });
  return { line, drops };
}
