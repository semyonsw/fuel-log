import { describe, expect, it } from 'vitest';

import { nextLabelsShown, type TabLabelEvent } from './tabLabels';

describe('nextLabelsShown', () => {
  const run = (events: TabLabelEvent[]) => events.reduce(nextLabelsShown, false);

  it('starts hidden and a long press shows the names', () => {
    expect(run([])).toBe(false);
    expect(run(['touchInBar', 'longPress'])).toBe(true);
  });

  it('a touch outside the bar (a tap or the start of a scroll) hides them', () => {
    expect(run(['longPress', 'touchOutside'])).toBe(false);
  });

  it('touches inside the bar leave them as they are', () => {
    expect(run(['longPress', 'touchInBar', 'touchInBar'])).toBe(true);
    expect(run(['touchInBar'])).toBe(false);
  });

  it('can be shown again after hiding', () => {
    expect(run(['longPress', 'touchOutside', 'touchInBar', 'longPress'])).toBe(true);
  });
});
