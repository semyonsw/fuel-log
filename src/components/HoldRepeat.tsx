/**
 * Press-and-hold repeat for − / + steppers.
 *
 * A tap steps once (Pressable's onPress). Holding past the long-press
 * threshold steps and keeps stepping on the `repeatDelay` schedule, which
 * accelerates; release or unmount stops it. Repeats are chained timeouts, not
 * an interval, because each delay is different.
 */

import { useEffect, useRef } from 'react';

import { FIRST_REPEAT_MS, repeatDelay } from '../lib/holdRepeat';

/** Spread onto a `Tap`/`Pressable`. */
export function useHoldRepeat(onStep: () => void) {
  // The latest onStep, so a long hold keeps stepping from the current value
  // rather than from the one captured when the press began.
  const stepRef = useRef(onStep);
  useEffect(() => {
    stepRef.current = onStep;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const repeat = (n: number) => {
    stepRef.current();
    timer.current = setTimeout(() => repeat(n + 1), repeatDelay(n + 1));
  };

  return {
    onPress: () => stepRef.current(),
    onLongPress: () => {
      stop();
      repeat(1);
    },
    onPressOut: stop,
    delayLongPress: FIRST_REPEAT_MS,
  };
}
