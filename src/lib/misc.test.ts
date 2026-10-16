import { describe, expect, it } from 'vitest';

import { appendMessage, chatTitle, newChat, sanitizeChats, sortChats, updateMessage } from './chat';
import { emptyProposal } from './assistant';
import { draftFromEntry, draftFromTrack, emptyDraft, validateDraft } from './draft';
import { at, reading, realNotes, refuel, trip } from './entries.fixtures';
import { availableModels, DEFAULT_MODEL, GEMINI_MODELS, resolveModel } from './models';
import { guessEnds, guessPlace } from './placeGuess';
import { sanitizeEntries } from './sanitize';
import { rangeSpark } from './spark';
import { lastAddressFor, stationLine, suggestStations } from './stations';
import type { RefuelEntry } from '../types';

const station = (id: string, when: number, name: string, address?: string): RefuelEntry => ({
  ...refuel(id, when, 30, 15000),
  station: name,
  ...(address ? { address } : {}),
});

describe('stations', () => {
  const log = [
    station('a', at(1, 9, 0), 'max petrol', 'Komitas 5'),
    station('b', at(5, 9, 0), 'Max Petrol'),
    station('c', at(3, 9, 0), 'Flash', 'Arshakunyats 40'),
    station('d', at(8, 9, 0), 'Max Petrol', 'Bagrevand 2'),
  ];

  it('suggests most used first, newest spelling, prefix matches first', () => {
    expect(suggestStations(log, '')).toEqual(['Max Petrol', 'Flash']);
    expect(suggestStations(log, 'fl')).toEqual(['Flash']);
    expect(suggestStations(log, 'a')).toEqual(['Max Petrol', 'Flash']);
  });

  it('does not suggest what is already typed exactly', () => {
    expect(suggestStations(log, 'flash')).toEqual([]);
  });

  it('fills the address used most recently with that station', () => {
    expect(lastAddressFor(log, 'MAX PETROL ')).toBe('Bagrevand 2');
    expect(lastAddressFor(log, 'Flash')).toBe('Arshakunyats 40');
    expect(lastAddressFor(log, 'Shell')).toBeUndefined();
    expect(lastAddressFor(log, '')).toBeUndefined();
  });

  it('station line joins only what exists', () => {
    expect(stationLine({ ...station('x', 0, 'Flash', 'Komitas 5'), grade: '95' })).toBe(
      'Flash · Komitas 5 · Premium 95',
    );
    expect(stationLine(refuel('y', 0, 1, 1))).toBe('');
  });
});

describe('refuel draft with station, address, grade', () => {
  const now = at(16, 9, 0);
  it('saves trimmed optional fields and the grade', () => {
    const d = {
      ...emptyDraft('refuel', now),
      liters: '30',
      price: '15 000',
      station: '  Max  Petrol ',
      address: 'Komitas 5',
      grade: '92' as const,
    };
    const r = validateDraft(d, 'f');
    expect(r.ok && r.entry).toMatchObject({
      station: 'Max Petrol',
      address: 'Komitas 5',
      grade: '92',
    });
  });

  it('blank optional fields are not saved', () => {
    const r = validateDraft({ ...emptyDraft('refuel', now), liters: '30', price: '15000' }, 'f');
    expect(r.ok && r.entry).toEqual({
      id: 'f',
      at: now,
      kind: 'refuel',
      liters: 30,
      priceAmd: 15000,
    });
  });

  it('a trip never takes refuel fields', () => {
    const d = {
      ...emptyDraft('trip', now),
      from: 'a',
      to: 'b',
      station: 'Flash',
      grade: '95' as const,
    };
    const r = validateDraft(d, 't');
    expect(r.ok && r.entry).not.toHaveProperty('station');
    expect(r.ok && r.entry).not.toHaveProperty('grade');
  });

  it('round-trips through the form', () => {
    const e = { ...station('f', now, 'Flash', 'Komitas 5'), grade: 'diesel' as const };
    const r = validateDraft(draftFromEntry(e), 'f');
    expect(r.ok && r.entry).toEqual(e);
  });
});

describe('trip draft from a GPS track', () => {
  const track = [
    { lat: 40.1, lon: 44.5, t: 1 },
    { lat: 40.2, lon: 44.5, t: 2 },
  ];

  it('pre-fills distance (one decimal) and keeps the track', () => {
    const d = draftFromTrack(track, 11.149, at(16, 9, 0), { from: 'home' });
    expect(d).toMatchObject({ kind: 'trip', distance: '11.1', from: 'home', to: '', track });
  });

  it('the typed distance wins over the pre-fill', () => {
    const d = { ...draftFromTrack(track, 11.1, 0), from: 'a', to: 'b', distance: '12,4' };
    const r = validateDraft(d, 't');
    expect(r.ok && r.entry).toMatchObject({ distanceKm: 12.4, track });
  });

  it('clearing the pre-fill saves no distance (manual-only, as before)', () => {
    const d = { ...draftFromTrack(track, 11.1, 0), from: 'a', to: 'b', distance: '' };
    const r = validateDraft(d, 't');
    expect(r.ok && r.entry).not.toHaveProperty('distanceKm');
  });

  it('a one-point recording pre-fills nothing', () => {
    expect(draftFromTrack([track[0]], 0, 0).distance).toBe('');
  });

  it('editing a tracked trip keeps its track', () => {
    const e = trip('t', 0, 'a', 'b', { track, distanceKm: 11 });
    const r = validateDraft(draftFromEntry(e), 't');
    expect(r.ok && r.entry).toEqual(e);
  });
});

describe('guessPlace', () => {
  const home = { lat: 40.2075, lon: 44.5352, t: 0 };
  const work = { lat: 40.1777, lon: 44.5126, t: 0 };
  const log = [trip('t', 0, 'home', 'work', { track: [home, work] }), trip('u', 1, 'x', 'y')];

  it('names a point within 250 m of a known trip end', () => {
    expect(guessPlace(log, { lat: home.lat + 0.001, lon: home.lon, t: 9 })).toBe('home');
    expect(guessEnds(log, [work, home])).toEqual({ from: 'work', to: 'home' });
  });

  it('no guess when nothing is near, or for trips without a track', () => {
    expect(guessPlace(log, { lat: 40.3, lon: 44.6, t: 0 })).toBeUndefined();
    expect(guessPlace(log, undefined)).toBeUndefined();
    expect(guessPlace([trip('u', 1, 'x', 'y')], home)).toBeUndefined();
  });
});

describe('sanitizeEntries (old data, new fields)', () => {
  it('entries saved before tracks/stations existed load unchanged', () => {
    const old = JSON.parse(JSON.stringify(realNotes));
    expect(sanitizeEntries(old)).toEqual(realNotes);
  });

  it('a malformed track is dropped, the trip kept', () => {
    const bad = { ...trip('t', 0, 'a', 'b'), track: [{ lat: 'x' }] };
    expect(sanitizeEntries([bad])).toEqual([trip('t', 0, 'a', 'b')]);
  });

  it('a good track is kept', () => {
    const good = trip('t', 0, 'a', 'b', { track: [{ lat: 1, lon: 2, t: 3 }] });
    expect(sanitizeEntries([good])).toEqual([good]);
  });
});

describe('chat', () => {
  it('titles from the first user words; photo-only start reads as a photo', () => {
    expect(chatTitle([{ id: '1', role: 'user', text: '  how much  this month? ', at: 0 }])).toBe(
      'how much this month?',
    );
    expect(chatTitle([{ id: '1', role: 'user', text: '', at: 0, hasPhoto: true }])).toBe(
      'Dashboard photo',
    );
    expect(chatTitle([])).toBe('New chat');
    expect(chatTitle([{ id: '1', role: 'user', text: 'x'.repeat(60), at: 0 }])).toHaveLength(40);
  });

  it('append sets title once and bumps updatedAt', () => {
    let c = newChat('c', 1);
    c = appendMessage(c, { id: 'a', role: 'user', text: 'first', at: 2 });
    c = appendMessage(c, { id: 'b', role: 'user', text: 'second', at: 3 });
    expect(c).toMatchObject({ title: 'first', updatedAt: 3 });
    expect(c.messages).toHaveLength(2);
  });

  it('edited proposals and the saved mark are stored on that message', () => {
    const p = { ...emptyProposal('reading'), rangeKm: 1 };
    let c = appendMessage(newChat('c', 1), {
      id: 'm',
      role: 'model',
      text: '',
      at: 2,
      proposals: [p],
    });
    c = updateMessage(c, 'm', { proposals: [{ ...p, rangeKm: 2 }] });
    c = updateMessage(c, 'm', { savedIds: ['e1'] });
    expect(c.messages[0]).toMatchObject({ proposals: [{ rangeKm: 2 }], savedIds: ['e1'] });
  });

  it('old chats with a photo reading load with a card instead', () => {
    const old = {
      ...newChat('c', 1),
      messages: [
        {
          id: 'm',
          role: 'model',
          text: 'x',
          at: 2,
          reading: { rangeKm: 54, tripKm: null, clock: null },
        },
      ],
    };
    const [c] = sanitizeChats([old]);
    expect(c.messages[0]).not.toHaveProperty('reading');
    expect(c.messages[0].proposals).toEqual([{ ...emptyProposal('reading'), rangeKm: 54 }]);
  });

  it('sorts newest first; sanitises junk', () => {
    const a = { ...newChat('a', 1), updatedAt: 5 };
    const b = { ...newChat('b', 2), updatedAt: 9 };
    expect(sortChats([a, b]).map((c) => c.id)).toEqual(['b', 'a']);
    expect(sanitizeChats([a, null, { id: 1 }, { ...b, messages: [{ id: 'x' }] }])).toEqual([
      a,
      { ...b, messages: [] },
    ]);
  });
});

describe('models', () => {
  it('offers only current models, none of the retired ones', () => {
    const ids = GEMINI_MODELS.map((m) => m.id);
    for (const old of ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-3-pro-preview']) {
      expect(ids).not.toContain(old);
    }
  });

  it('hides offered models the key cannot use', () => {
    const listed = [
      { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
    ];
    expect(availableModels(listed).map((m) => m.id)).toEqual(['gemini-3.8-flash']);
  });

  it('keeps the full list when the listing fails or matches nothing', () => {
    expect(availableModels(undefined)).toEqual(GEMINI_MODELS);
    expect(availableModels([{ name: 'models/other' }])).toEqual(GEMINI_MODELS);
  });

  it('an unknown stored model falls back to the default', () => {
    expect(resolveModel('gemini-2.0-flash')).toBe(DEFAULT_MODEL);
    expect(resolveModel('gemini-3.8-flash')).toBe('gemini-3.8-flash');
  });
});

describe('rangeSpark', () => {
  it('needs two readings', () => {
    expect(rangeSpark([reading('r', 0, 100)], 300, 44)).toBeUndefined();
  });

  it('the real notes: one point per reading, higher range drawn higher', () => {
    const s = rangeSpark(realNotes, 330, 44)!;
    expect(s.line).toHaveLength(6);
    expect(s.line[0].y).toBeLessThan(s.line[5].y); // 122 km is above 54 km
    expect(s.drops).toEqual([]);
  });

  it('marks a refuel between readings', () => {
    const s = rangeSpark(
      [reading('a', 1, 50), refuel('f', 2, 30, 15000), reading('b', 3, 280)],
      100,
      44,
    )!;
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]).toBeGreaterThan(s.line[0].x);
    expect(s.drops[0]).toBeLessThan(s.line[1].x);
  });

  it('shows at most the last ten readings', () => {
    const many = Array.from({ length: 15 }, (_, i) => reading(`r${i}`, i, 200 - i));
    expect(rangeSpark(many, 300, 44)!.line).toHaveLength(10);
  });
});
