import { describe, expect, it } from 'vitest';

import { newId } from './id';

describe('newId', () => {
  it('does not repeat, even within one millisecond', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });

  it('is a non-empty plain string', () => {
    expect(newId()).toMatch(/^[0-9a-z-]+$/);
  });
});
