/**
 * How fast a held − / + button repeats.
 *
 * The first repeat waits long enough that a tap is never mistaken for a hold;
 * then a steady, countable pace for about a second (so a few days back is easy
 * to land on), then it speeds up to cover weeks without the thumb tiring.
 * Counted in repeats rather than elapsed time so the schedule is a plain
 * function of n and testable without timers.
 */

/** Delay before the first repeat; doubles as the long-press threshold. */
export const FIRST_REPEAT_MS = 400;
const STEADY_MS = 150;
const FASTEST_MS = 50;
/** Repeats 2..STEADY_UNTIL run at the steady pace (~1 s of them). */
const STEADY_UNTIL = 8;
/** How much quicker each repeat after the steady phase gets. */
const RAMP_MS = 10;

/** Milliseconds to wait before the n-th repeat (n ≥ 1) of a held button. */
export function repeatDelay(n: number): number {
  if (n <= 1) return FIRST_REPEAT_MS;
  if (n <= STEADY_UNTIL) return STEADY_MS;
  return Math.max(FASTEST_MS, STEADY_MS - (n - STEADY_UNTIL) * RAMP_MS);
}
