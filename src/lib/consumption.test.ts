import { afterEach, describe, expect, it } from 'vitest';

import { setLang } from '../i18n';

import { consumptionNote, consumptionSource } from './consumption';
import { at, reading, refuel } from './entries.fixtures';

// 50 → 290 km of range for 30 L = 8 km/L = 12.5 L/100 km.
const log = [reading('r', at(10, 8, 0), 50), refuel('f', at(10, 9, 0), 30, 15000, 290)];

describe('consumptionSource', () => {
  it('uses the figure set in Settings when it is valid', () => {
    expect(consumptionSource('7.2', log)).toEqual({ lPer100: 7.2, from: 'settings' });
  });

  it('falls back to the log when Settings is blank or not a positive number', () => {
    expect(consumptionSource('', log)).toEqual({ lPer100: 12.5, from: 'log' });
    expect(consumptionSource('abc', log)).toEqual({ lPer100: 12.5, from: 'log' });
    expect(consumptionSource('0', log)).toEqual({ lPer100: 12.5, from: 'log' });
  });

  it('rounds the derived figure to one decimal', () => {
    // 50 → 350 for 33 L = 9.09 km/L = 11.0 L/100 km.
    const l = [reading('r', at(10, 8, 0), 50), refuel('f', at(10, 9, 0), 33, 15000, 350)];
    expect(consumptionSource('', l)).toEqual({ lPer100: 11, from: 'log' });
  });

  it('is undefined when there is neither', () => {
    expect(consumptionSource('', [])).toBeUndefined();
  });
});

describe('consumptionNote', () => {
  it('says where the figure comes from', () => {
    expect(consumptionNote({ lPer100: 7.2, from: 'settings' })).toBe(
      'Using 7.2 L/100 km (set in Settings)',
    );
    expect(consumptionNote({ lPer100: 12.5, from: 'log' })).toBe('Using 12.5 L/100 km from log');
    expect(consumptionNote(undefined)).toBeUndefined();
  });
});

describe('consumptionNote in Russian', () => {
  afterEach(() => setLang('en'));

  it('follows the current language', () => {
    setLang('ru');
    expect(consumptionNote({ lPer100: 7.2, from: 'settings' })).toBe(
      'Расход 7.2 л/100 км (из Настроек)',
    );
  });
});
