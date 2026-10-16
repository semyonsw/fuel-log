/**
 * The current time as React state, refreshed every minute and whenever the
 * app comes back to the foreground.
 *
 * Day labels ("Today", "Yesterday") and "this week" depend on now; without
 * this, an app left open overnight would keep calling yesterday "Today".
 */

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 60_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);
  return now;
}
