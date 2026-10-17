import { describe, expect, it } from 'vitest';

import { FIRST_REPEAT_MS, repeatDelay } from './holdRepeat';

describe('repeatDelay', () => {
  it('waits the long-press threshold before the first repeat', () => {
    expect(repeatDelay(1)).toBe(FIRST_REPEAT_MS);
    expect(repeatDelay(1)).toBe(400);
    expect(repeatDelay(0)).toBe(400);
  });

  it('holds a steady 150 ms pace for the next repeats', () => {
    for (let n = 2; n <= 8; n++) expect(repeatDelay(n)).toBe(150);
  });

  it('speeds up, never getting slower, and bottoms out at 50 ms', () => {
    for (let n = 2; n < 40; n++) expect(repeatDelay(n + 1)).toBeLessThanOrEqual(repeatDelay(n));
    expect(repeatDelay(18)).toBe(50);
    expect(repeatDelay(1000)).toBe(50);
  });

  it('reaches full speed after a couple of seconds of holding', () => {
    let elapsed = 0;
    let n = 1;
    while (repeatDelay(n) > 50) elapsed += repeatDelay(n++);
    expect(elapsed).toBeGreaterThan(1500);
    expect(elapsed).toBeLessThan(3000);
  });
});
