import { afterEach, describe, expect, it } from 'vitest';

import { setLang } from '../i18n';

import { formatDuration, trackDurationMs } from './duration';

const MIN = 60_000;
const pt = (t: number) => ({ lat: 40.18, lon: 44.51, t });

describe('trackDurationMs', () => {
  it('is last fix minus first fix', () => {
    expect(trackDurationMs([pt(1_000), pt(5 * MIN), pt(24 * MIN + 1_000)])).toBe(24 * MIN);
  });
  it('is undefined with fewer than two points or no track', () => {
    expect(trackDurationMs(undefined)).toBeUndefined();
    expect(trackDurationMs([])).toBeUndefined();
    expect(trackDurationMs([pt(1_000)])).toBeUndefined();
  });
  it('is undefined for a zero or negative span', () => {
    expect(trackDurationMs([pt(1_000), pt(1_000)])).toBeUndefined();
    expect(trackDurationMs([pt(9_000), pt(1_000)])).toBeUndefined();
  });
});

describe('formatDuration', () => {
  it('under a minute reads "<1 min", never "0 min"', () => {
    expect(formatDuration(1_000)).toBe('<1 min');
    expect(formatDuration(29_999)).toBe('<1 min');
  });
  it('minutes round to nearest', () => {
    expect(formatDuration(30_000)).toBe('1 min');
    expect(formatDuration(24 * MIN)).toBe('24 min');
    expect(formatDuration(24 * MIN + 29_000)).toBe('24 min');
    expect(formatDuration(24 * MIN + 31_000)).toBe('25 min');
  });
  it('an hour or more is "1h 34m"', () => {
    expect(formatDuration(94 * MIN)).toBe('1h 34m');
    expect(formatDuration(125 * MIN)).toBe('2h 5m');
  });
  it('exact hours drop the "0m", including when rounding reaches the hour', () => {
    expect(formatDuration(120 * MIN)).toBe('2h');
    expect(formatDuration(59 * MIN + 45_000)).toBe('1h');
  });
});

describe('formatDuration in other languages', () => {
  afterEach(() => setLang('en'));

  it('Russian', () => {
    setLang('ru');
    expect(formatDuration(1_000)).toBe('<1 мин');
    expect(formatDuration(24 * MIN)).toBe('24 мин');
    expect(formatDuration(120 * MIN)).toBe('2 ч');
    expect(formatDuration(94 * MIN)).toBe('1 ч 34 мин');
  });

  it('Armenian', () => {
    setLang('hy');
    expect(formatDuration(24 * MIN)).toBe('24 րոպե');
    expect(formatDuration(94 * MIN)).toBe('1 ժ 34 ր');
  });
});
