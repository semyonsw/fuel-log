import { describe, expect, it } from 'vitest';

import { draftFromEntry, draftFromTrack, emptyDraft, validateDraft } from './draft';
import { at, reading, realNotes, refuel, trip } from './entries.fixtures';
import { guessEnds, guessPlace } from './placeGuess';
import { sanitizeEntries } from './sanitize';
import { rangeSpark } from './spark';

describe('refuel draft', () => {
  const now = at(16, 9, 0);

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
    const d = { ...emptyDraft('trip', now), from: 'a', to: 'b', liters: '30', price: '15000' };
    const r = validateDraft(d, 't');
    expect(r.ok && r.entry).not.toHaveProperty('liters');
    expect(r.ok && r.entry).not.toHaveProperty('priceAmd');
  });

  it('round-trips through the form', () => {
    const e = { ...refuel('f', now, 30, 15000, 400), note: 'full' };
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
  it('entries saved before tracks existed load unchanged', () => {
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
