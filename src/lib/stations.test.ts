import { afterEach, describe, expect, it } from 'vitest';

import { setLang } from '../i18n';
import { at, refuel, trip } from './entries.fixtures';
import {
  addressForStation,
  FUEL_GRADES,
  gradeLabel,
  refuelDefaults,
  stationLine,
  suggestAddresses,
} from './stations';
import type { FuelGrade, RefuelEntry } from '../types';

const fill = (
  id: string,
  when: number,
  station?: string,
  address?: string,
  grade?: FuelGrade,
): RefuelEntry => ({
  ...refuel(id, when, 30, 15000),
  ...(station ? { station } : {}),
  ...(address ? { address } : {}),
  ...(grade ? { grade } : {}),
});

describe('suggestAddresses', () => {
  const log = [
    fill('a', at(1, 9, 0), 'Max Petrol', 'Komitas 5'),
    fill('b', at(2, 9, 0), 'Flash', 'Arshakunyats 40'),
    fill('c', at(3, 9, 0), 'Flash', 'arshakunyats 40'),
    fill('d', at(4, 9, 0), 'Max Petrol', 'Bagrevand 2'),
    fill('e', at(5, 9, 0), 'Max Petrol'),
    trip('t', at(6, 9, 0), 'Komitas 7', 'home'),
  ];

  it('lists refuel addresses, most used first, latest spelling, merged by case', () => {
    expect(suggestAddresses(log, '')).toEqual(['arshakunyats 40', 'Bagrevand 2', 'Komitas 5']);
  });

  it("puts the chosen station's own addresses first", () => {
    expect(suggestAddresses(log, '', 'max petrol ')).toEqual([
      'Bagrevand 2',
      'Komitas 5',
      'arshakunyats 40',
    ]);
    // A station never used before changes nothing.
    expect(suggestAddresses(log, '', 'Shell')).toEqual(suggestAddresses(log, ''));
  });

  it('filters by what is typed, prefixes first, and drops an exact match', () => {
    expect(suggestAddresses(log, 'ko')).toEqual(['Komitas 5']);
    expect(suggestAddresses(log, 'a')).toEqual(['arshakunyats 40', 'Bagrevand 2', 'Komitas 5']);
    expect(suggestAddresses(log, 'komitas 5')).toEqual([]);
  });

  it('respects the limit and ignores trips', () => {
    expect(suggestAddresses(log, '', undefined, 1)).toEqual(['arshakunyats 40']);
    expect(suggestAddresses([trip('t', 0, 'a', 'b')], '')).toEqual([]);
  });
});

describe('refuelDefaults', () => {
  it('is empty with no refuels', () => {
    expect(refuelDefaults([])).toEqual({});
    expect(refuelDefaults([trip('t', 0, 'a', 'b')])).toEqual({});
  });

  it("takes the latest refuel's station, address and grade together", () => {
    const log = [
      fill('a', at(1, 9, 0), 'Flash', 'Komitas 5', '95'),
      fill('b', at(4, 9, 0), ' Max  Petrol ', undefined, '92'),
    ];
    expect(refuelDefaults(log)).toEqual({ station: 'Max Petrol', grade: '92' });
  });

  it('skips refuels that recorded none of them', () => {
    const log = [fill('a', at(1, 9, 0), 'Flash', 'Komitas 5', '95'), fill('b', at(4, 9, 0))];
    expect(refuelDefaults(log)).toEqual({ station: 'Flash', address: 'Komitas 5', grade: '95' });
  });
});

describe('fuel grade labels', () => {
  afterEach(() => setLang('en'));

  it('follow the language at call time; stored values never change', () => {
    expect(FUEL_GRADES.map((g) => g.label)).toEqual([
      'Regular 92',
      'Premium 95',
      'Super 98',
      'Diesel',
    ]);
    setLang('ru');
    expect(FUEL_GRADES.map((g) => g.label)).toEqual(['АИ-92', 'АИ-95', 'АИ-98', 'Дизель']);
    expect(stationLine(fill('a', at(1, 9, 0), 'Flash', undefined, '95'))).toBe('Flash · АИ-95');
    setLang('hy');
    expect(gradeLabel('92')).toBe('Ռեգուլյար 92');
    expect(gradeLabel('diesel')).toBe('Դիզել');
    expect(FUEL_GRADES.map((g) => g.value)).toEqual(['92', '95', '98', 'diesel']);
  });
});

describe('addressForStation', () => {
  const log = [
    fill('a', at(1, 9, 0), 'Max Petrol', 'Komitas 5', '95'),
    fill('b', at(2, 9, 0), 'Flash', 'Arshakunyats 10', '92'),
  ];

  it("drops the previous station's address when the new station has none", () => {
    expect(addressForStation(log, 'Max Petrol', 'Rompetrol', 'Komitas 5')).toBe('');
  });

  it("swaps in the new station's own last address", () => {
    expect(addressForStation(log, 'Max Petrol', 'Flash', 'Komitas 5')).toBe('Arshakunyats 10');
  });

  it('keeps an address the user typed', () => {
    expect(addressForStation(log, 'Max Petrol', 'Rompetrol', 'Tigran Mets 3')).toBe(
      'Tigran Mets 3',
    );
  });

  it('fills an empty address from the new station', () => {
    expect(addressForStation(log, '', 'Flash', '')).toBe('Arshakunyats 10');
    expect(addressForStation(log, 'Fla', 'Flas', '')).toBe('');
  });
});
