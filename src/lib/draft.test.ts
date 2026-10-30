import { afterEach, describe, expect, it } from 'vitest';

import { setLang } from '../i18n';
import {
  draftFromEntry,
  emptyDraft,
  formKinds,
  saveHint,
  validateDraft,
  type Draft,
} from './draft';
import { at, reading, refuel, trip } from './entries.fixtures';

/**
 * The form's strings in, an `Entry` out — with only the fields that belong to the
 * kind, and an error under each field that needs one.
 */

const now = at(15, 13, 31);
const draft = (kind: Draft['kind'], fields: Partial<Draft> = {}): Draft => ({
  ...emptyDraft(kind, now),
  ...fields,
});

describe('emptyDraft', () => {
  it('is blank, at the given time', () => {
    expect(emptyDraft('trip', now)).toEqual({
      kind: 'trip',
      at: now,
      from: '',
      stops: [],
      to: '',
      distance: '',
      range: '',
      liters: '',
      price: '',
      station: '',
      address: '',
      odometer: '',
      place: '',
      remindKm: '',
      remindMonths: '',
      note: '',
    });
  });
});

describe('service and expense drafts', () => {
  const svc = (patch: Partial<ReturnType<typeof emptyDraft>>) =>
    validateDraft({ ...emptyDraft('service', now), ...patch }, 's');

  it('saves a service with reminder, rounding money and intervals', () => {
    const r = svc({
      category: 'oil',
      price: '25000.4',
      odometer: '123456',
      place: '  Auto  Center ',
      remindKm: '10000',
      remindMonths: '12',
    });
    expect(r).toEqual({
      ok: true,
      entry: {
        id: 's',
        at: now,
        kind: 'service',
        category: 'oil',
        costAmd: 25000,
        odometerKm: 123456,
        place: 'Auto Center',
        remindKm: 10000,
        remindMonths: 12,
      },
    });
  });

  it('allows a free service but not a missing cost or category', () => {
    expect(svc({ category: 'inspection', price: '0' }).ok).toBe(true);
    const r = svc({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['category', 'price']);
  });

  it('a km reminder needs the odometer; a month reminder does not', () => {
    const r = svc({ category: 'oil', price: '1', remindKm: '5000' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.odometer).toBeTruthy();
    expect(svc({ category: 'oil', price: '1', remindMonths: '6' }).ok).toBe(true);
  });

  it('round-trips a service and an expense through draftFromEntry', () => {
    const s = svc({ category: 'tires', price: '80000', odometer: '1000', remindKm: '20000' });
    if (!s.ok) throw new Error('service should save');
    expect(validateDraft(draftFromEntry(s.entry), 's')).toEqual(s);
    const e = validateDraft(
      { ...emptyDraft('expense', now), category: 'parking', price: '500' },
      'e',
    );
    expect(e).toEqual({
      ok: true,
      entry: { id: 'e', at: now, kind: 'expense', category: 'parking', amountAmd: 500 },
    });
    if (e.ok) expect(validateDraft(draftFromEntry(e.entry), 'e')).toEqual(e);
  });

  it('an expense that rounds to 0 AMD is not saved', () => {
    const r = validateDraft({ ...emptyDraft('expense', now), category: 'wash', price: '0.4' }, 'e');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.price).toBeTruthy();
  });

  it('an expense needs a positive amount and a known category', () => {
    const r = validateDraft({ ...emptyDraft('expense', now), category: 'oil', price: '0' }, 'e');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['category', 'price']);
  });

  it('keeps a refuel odometer and rejects an unreadable one', () => {
    const base = { ...emptyDraft('refuel', now), liters: '20', price: '10000' };
    const ok = validateDraft({ ...base, odometer: '50 000' }, 'r');
    expect(ok.ok && ok.entry.kind === 'refuel' && ok.entry.odometerKm).toBe(50000);
    expect(validateDraft({ ...base, odometer: 'abc' }, 'r').ok).toBe(false);
  });

  it('a reminder that rounds to zero is not stored and needs no odometer', () => {
    const r = svc({ category: 'oil', price: '1', remindKm: '0.4', remindMonths: '0.3' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entry).not.toHaveProperty('remindKm');
      expect(r.entry).not.toHaveProperty('remindMonths');
    }
  });

  it('service and expense forms only offer their own kind', () => {
    expect(formKinds('service')).toEqual(['service']);
    expect(formKinds('expense')).toEqual(['expense']);
    expect(formKinds('reading')).toEqual(['trip', 'reading']);
  });
});

describe('draftFromEntry', () => {
  it('turns a trip back into strings', () => {
    const d = draftFromEntry(
      trip('t', now, '4micro', 'charents school', {
        stops: ['Erebuni'],
        distanceKm: 22.5,
        rangeKm: 107,
        note: 'traffic',
      }),
    );
    expect(d).toMatchObject({
      kind: 'trip',
      at: now,
      from: '4micro',
      stops: ['Erebuni'],
      to: 'charents school',
      distance: '22.5',
      range: '107',
      note: 'traffic',
      liters: '',
      price: '',
    });
  });

  it('leaves missing values empty', () => {
    expect(draftFromEntry(trip('t', now, 'a', 'b'))).toMatchObject({ distance: '', range: '' });
    expect(draftFromEntry(refuel('f', now, 30, 15000))).toMatchObject({
      liters: '30',
      price: '15000',
      range: '',
      note: '',
    });
    expect(draftFromEntry(reading('r', now, 106))).toMatchObject({ range: '106', from: '' });
  });

  it('round-trips through validateDraft', () => {
    const entries = [
      trip('t', now, '4micro', 'school', { stops: ['x'], distanceKm: 22.5, rangeKm: 107 }),
      reading('r', now, 106),
      refuel('f', now, 32.5, 16250, 420),
    ];
    for (const e of entries) {
      expect(validateDraft(draftFromEntry(e), e.id)).toEqual({ ok: true, entry: e });
    }
  });

  it('does not share the stops array with the entry', () => {
    const e = trip('t', now, 'a', 'b', { stops: ['x'] });
    draftFromEntry(e).stops.push('y');
    expect(e.stops).toEqual(['x']);
  });
});

describe('validateDraft — trip', () => {
  it('builds a trip from the note "22.5km 4micro - charents school / 107km"', () => {
    const result = validateDraft(
      draft('trip', {
        from: ' 4micro ',
        to: 'charents   school',
        stops: [' Erebuni ', '  ', ''],
        distance: '22,5km',
        range: '107 km',
        note: '  ',
        liters: '30',
        price: '15000',
      }),
      'id1',
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: 'id1',
        at: now,
        kind: 'trip',
        from: '4micro',
        stops: ['Erebuni'],
        to: 'charents school',
        distanceKm: 22.5,
        rangeKm: 107,
      },
    });
  });

  it('needs from and to', () => {
    expect(validateDraft(draft('trip', { from: '  ', to: '' }), 'x')).toEqual({
      ok: false,
      errors: { from: 'Where did you start?', to: 'Where did you end?' },
    });
  });

  it('allows distance and range to be empty, but not unreadable', () => {
    const ok = validateDraft(draft('trip', { from: 'a', to: 'b' }), 'x');
    expect(ok.ok && ok.entry).toEqual({
      id: 'x',
      at: now,
      kind: 'trip',
      from: 'a',
      stops: [],
      to: 'b',
    });

    expect(
      validateDraft(draft('trip', { from: 'a', to: 'b', distance: 'far', range: '-3' }), 'x'),
    ).toEqual({
      ok: false,
      errors: { distance: 'Not a number', range: 'Not a number' },
    });
  });

  it('keeps a trimmed note', () => {
    const r = validateDraft(draft('trip', { from: 'a', to: 'b', note: '  rain ' }), 'x');
    expect(r.ok && r.entry.note).toBe('rain');
  });
});

describe('validateDraft — reading', () => {
  it('needs the range', () => {
    expect(validateDraft(draft('reading'), 'x')).toEqual({
      ok: false,
      errors: { range: 'Enter the range left' },
    });
    expect(validateDraft(draft('reading', { range: 'lots' }), 'x')).toEqual({
      ok: false,
      errors: { range: 'Not a number' },
    });
  });

  it('builds a bare reading, "20:16 / 106km benzin", and nothing else', () => {
    expect(
      validateDraft(draft('reading', { range: '106km', from: 'home', distance: '5' }), 'x'),
    ).toEqual({ ok: true, entry: { id: 'x', at: now, kind: 'reading', rangeKm: 106 } });
  });

  it('accepts a zero range — the tank can be empty', () => {
    const r = validateDraft(draft('reading', { range: '0' }), 'x');
    expect(r.ok && r.entry.rangeKm).toBe(0);
  });
});

describe('validateDraft — refuel', () => {
  it('needs liters and price above zero', () => {
    expect(validateDraft(draft('refuel'), 'x')).toEqual({
      ok: false,
      errors: { liters: 'Enter liters', price: 'Enter the price' },
    });
    expect(validateDraft(draft('refuel', { liters: '0', price: '0 amd' }), 'x')).toEqual({
      ok: false,
      errors: { liters: 'Enter liters', price: 'Enter the price' },
    });
    expect(
      validateDraft(draft('refuel', { liters: 'x', price: '15000', range: '?' }), 'x'),
    ).toEqual({
      ok: false,
      errors: { liters: 'Not a number', range: 'Not a number' },
    });
  });

  it('builds a refuel with whole AMD, range optional, and no trip fields', () => {
    expect(
      validateDraft(
        draft('refuel', { liters: '32,5 L', price: '16 250,4 amd', from: 'home', distance: '3' }),
        'x',
      ),
    ).toEqual({
      ok: true,
      entry: { id: 'x', at: now, kind: 'refuel', liters: 32.5, priceAmd: 16250 },
    });

    const withRange = validateDraft(
      draft('refuel', { liters: '30', price: '15000', range: '420' }),
      'x',
    );
    expect(withRange.ok && withRange.entry.rangeKm).toBe(420);
  });
});

describe('saveHint', () => {
  it('lists what is missing, then what is unreadable', () => {
    expect(
      saveHint({
        from: 'Where did you start?',
        to: 'Where did you end?',
        distance: 'Not a number',
      }),
    ).toBe('To save, fill in: From, To · Check: Distance');
    expect(saveHint({ liters: 'Enter liters' })).toBe('To save, fill in: Liters');
    expect(saveHint({ range: 'Not a number' })).toBe('Check: Range left');
    expect(saveHint({})).toBe('');
  });

  it('names the money field as the service and expense forms label it', () => {
    expect(saveHint({ price: 'x' }, 'service')).toBe('To save, fill in: Cost');
    expect(saveHint({ price: 'x' }, 'expense')).toBe('To save, fill in: Amount');
    expect(saveHint({ price: 'x' }, 'refuel')).toBe('To save, fill in: Total paid');
  });
});

describe('in Russian and Armenian', () => {
  afterEach(() => setLang('en'));

  it('words errors and the save hint in the current language', () => {
    setLang('ru');
    const r = validateDraft(emptyDraft('trip', at(1, 9, 0)), 'x');
    expect(r).toEqual({
      ok: false,
      errors: { from: 'Откуда выехали?', to: 'Куда приехали?' },
    });
    expect(!r.ok && saveHint(r.errors)).toBe('Чтобы сохранить, заполните: Откуда, Куда');
    const bad = validateDraft({ ...emptyDraft('reading', at(1, 9, 0)), range: 'abc' }, 'x');
    expect(!bad.ok && saveHint(bad.errors)).toBe('Проверьте: Запас хода');

    setLang('hy');
    const refuel = validateDraft(emptyDraft('refuel', at(1, 9, 0)), 'x');
    expect(!refuel.ok && refuel.errors.liters).toBe('Մուտքագրեք լիտրերը');
    expect(!refuel.ok && saveHint(refuel.errors)).toBe('Պահպանելու համար լրացրեք՝ Լիտր, Վճարված');
  });
});

describe('formKinds', () => {
  it('keeps refuel on its own form (the fuel button)', () => {
    expect(formKinds('refuel')).toEqual(['refuel']);
  });

  it('offers only Trip and Range on the "+" form, never Refuel', () => {
    expect(formKinds('trip')).toEqual(['trip', 'reading']);
    expect(formKinds('reading')).toEqual(['trip', 'reading']);
    expect(formKinds(emptyDraft('trip', now).kind)).not.toContain('refuel');
  });

  it('opens the fuel button’s form on refuel, with nothing else to switch to', () => {
    const d = emptyDraft('refuel', now);
    expect(formKinds(d.kind)).toEqual([d.kind]);
  });

  it('keeps an edited entry in its own group', () => {
    expect(formKinds(draftFromEntry(refuel('f', now, 30, 15000)).kind)).toEqual(['refuel']);
    expect(formKinds(draftFromEntry(trip('t', now, 'a', 'b')).kind)).toEqual(['trip', 'reading']);
    expect(formKinds(draftFromEntry(reading('r', now, 300)).kind)).toEqual(['trip', 'reading']);
  });

  it('a refuel saved from the refuel-only form keeps liters, price and grade', () => {
    const r = validateDraft(draft('refuel', { liters: '30', price: '15000', grade: '95' }), 'f');
    expect(r.ok && r.entry).toMatchObject({
      kind: 'refuel',
      liters: 30,
      priceAmd: 15000,
      grade: '95',
    });
  });
});
