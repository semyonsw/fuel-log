import { describe, expect, it } from 'vitest';

import { MAX_ZOOM, MIN_ZOOM, mapHeldAfter, stepZoom } from './mapControls';

describe('stepZoom', () => {
  it('moves one whole level in or out', () => {
    expect(stepZoom(12, 1)).toBe(13);
    expect(stepZoom(12, -1)).toBe(11);
  });
  it('keeps a fractional zoom fractional in the middle of the range', () => {
    expect(stepZoom(12.5, 1)).toBe(13.5);
    expect(stepZoom(12.5, -1)).toBe(11.5);
  });
  it('clamps at the top, including from a fractional zoom', () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(19.6, 1)).toBe(20);
  });
  it('clamps at the bottom, including from a fractional zoom', () => {
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
    expect(stepZoom(3.4, -1)).toBe(3);
  });
  it('starts from the bottom of the range when the map has not reported a zoom', () => {
    expect(stepZoom(NaN, 1)).toBe(MIN_ZOOM + 1);
    expect(stepZoom(NaN, -1)).toBe(MIN_ZOOM);
    expect(stepZoom(Infinity, 1)).toBe(MIN_ZOOM + 1);
    expect(stepZoom(-Infinity, -1)).toBe(MIN_ZOOM);
  });
});

describe('mapHeldAfter', () => {
  it('a touch starting on the map takes the hold', () => {
    expect(mapHeldAfter('start', 1)).toBe(true);
  });
  it('a two-finger pinch keeps the hold until the last finger lifts', () => {
    expect(mapHeldAfter('start', 1)).toBe(true);
    expect(mapHeldAfter('start', 2)).toBe(true);
    expect(mapHeldAfter('end', 1)).toBe(true);
    expect(mapHeldAfter('end', 0)).toBe(false);
  });
  it('a cancel drops the hold even with fingers still down', () => {
    expect(mapHeldAfter('cancel', 0)).toBe(false);
    expect(mapHeldAfter('cancel', 2)).toBe(false);
  });
});
