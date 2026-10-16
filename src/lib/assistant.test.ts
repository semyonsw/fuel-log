import { describe, expect, it } from 'vitest';

import {
  clockToAt,
  emptyProposal,
  legacyReadingToProposals,
  logContext,
  nudge,
  parseChatReply,
  parseProposal,
  proposalsToEntries,
  proposalTimes,
  SYSTEM_PROMPT,
  type Proposal,
} from './assistant';
import { kmPerLiterFromRefuels, latestPricePerLiter } from './fuel';
import { at, reading, trip } from './entries.fixtures';

const now = at(16, 19, 5);
let n = 0;
const ids = () => `id${++n}`;

/** What Gemini should send for "I bought 15L of fuel for 9000 AMD my fuel was 15km now shows 250km". */
const BOUGHT = JSON.stringify({
  reply: 'Logged a 15 km reading and the refuel.',
  entries: [
    { kind: 'reading', rangeKm: 15 },
    { kind: 'refuel', liters: 15, priceAmd: 9000, rangeKm: 250 },
  ],
  confidence: null,
});

describe('the prompt', () => {
  it('calls it "the car", with no make, model or year', () => {
    expect(SYSTEM_PROMPT).toContain('the car');
    expect(SYSTEM_PROMPT).not.toMatch(/nissan|sentra|2023|SV/i);
  });

  it('teaches the refuel-with-before-and-after example', () => {
    expect(SYSTEM_PROMPT).toContain('"kind":"reading","rangeKm":15');
  });
});

describe('parseChatReply', () => {
  it('turns the refuel sentence into a reading then a refuel', () => {
    const r = parseChatReply(BOUGHT)!;
    expect(r.entries.map((e) => e.kind)).toEqual(['reading', 'refuel']);
    expect(r.entries[0]).toEqual({ ...emptyProposal('reading'), rangeKm: 15 });
    expect(r.entries[1]).toEqual({
      ...emptyProposal('refuel'),
      liters: 15,
      priceAmd: 9000,
      rangeKm: 250,
    });
  });

  it('a question has no entries', () => {
    expect(parseChatReply('{"reply":"You spent 15 000 AMD.","entries":[]}')).toEqual({
      reply: 'You spent 15 000 AMD.',
      entries: [],
      confidence: null,
    });
  });

  it('malformed JSON or nothing usable is undefined', () => {
    expect(parseChatReply('{"reply": ')).toBeUndefined();
    expect(parseChatReply('{"reply":"","entries":[]}')).toBeUndefined();
    expect(parseChatReply(42)).toBeUndefined();
  });

  it('drops entries of unknown kind, keeps the rest', () => {
    const r = parseChatReply({
      reply: 'x',
      entries: [{ kind: 'wash' }, { kind: 'reading', rangeKm: 9 }],
    })!;
    expect(r.entries).toHaveLength(1);
  });

  it('keeps photo confidence', () => {
    expect(parseChatReply({ reply: 'x', entries: [], confidence: 'low' })!.confidence).toBe('low');
  });
});

describe('parseProposal checks every value', () => {
  it('junk, negative and implausible numbers become empty', () => {
    const p = parseProposal({
      kind: 'trip',
      rangeKm: -5,
      distanceKm: 41235, // the odometer, not the trip meter
      liters: 'twelve',
    })!;
    expect(p).toMatchObject({ rangeKm: null, distanceKm: null, liters: null });
    expect(parseProposal({ kind: 'reading', rangeKm: 1500 })!.rangeKm).toBeNull();
    expect(parseProposal({ kind: 'refuel', liters: 900 })!.liters).toBeNull();
  });

  it('money is whole dram', () => {
    expect(parseProposal({ kind: 'refuel', priceAmd: 9000.4 })!.priceAmd).toBe(9000);
  });

  it('text is trimmed; grade must be a known one; clock must be HH:MM', () => {
    const p = parseProposal({
      kind: 'refuel',
      station: '  Max   Petrol ',
      grade: '100',
      clock: '7:05',
      stops: ['a', '', 3],
    })!;
    expect(p).toMatchObject({ station: 'Max Petrol', grade: null, clock: '07:05', stops: ['a'] });
    expect(parseProposal({ kind: 'reading', clock: '25:00' })!.clock).toBeNull();
    expect(parseProposal({ kind: 'reading', clock: '6:40 PM' })!.clock).toBeNull();
  });
});

describe('proposalTimes', () => {
  it('without clocks: the last is now, earlier ones a minute apart before it', () => {
    const t = proposalTimes([emptyProposal('reading'), emptyProposal('refuel')], now);
    expect(t).toEqual([now - 60_000, now]);
  });

  it('uses a given clock, and still keeps the order strictly increasing', () => {
    const a = { ...emptyProposal('reading'), clock: '18:40' };
    const b = { ...emptyProposal('refuel'), clock: '18:40' };
    expect(proposalTimes([a, b], now)).toEqual([at(16, 18, 39), at(16, 18, 40)]);
    expect(proposalTimes([a], now)).toEqual([at(16, 18, 40)]);
  });

  it('a clock later than now means yesterday', () => {
    expect(clockToAt('23:50', at(17, 0, 10))).toBe(at(16, 23, 50));
    expect(clockToAt('nope', now)).toBeUndefined();
  });
});

describe('proposalsToEntries (Approve)', () => {
  it('the refuel sentence becomes a reading then a refuel, and the log can derive km/L from it', () => {
    const r = proposalsToEntries(parseChatReply(BOUGHT)!.entries, now, ids);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [rd, rf] = r.entries;
    expect(rd).toMatchObject({ kind: 'reading', rangeKm: 15, at: now - 60_000 });
    expect(rf).toMatchObject({ kind: 'refuel', liters: 15, priceAmd: 9000, rangeKm: 250, at: now });
    // (250 − 15) / 15 L — exactly what the fuel calculator needs.
    expect(kmPerLiterFromRefuels(r.entries)).toBeCloseTo(15.667, 3);
    expect(latestPricePerLiter(r.entries)).toBe(600);
  });

  it('all or nothing: one incomplete card blocks the save and says what is missing', () => {
    const refuel: Proposal = { ...emptyProposal('refuel'), liters: 15 };
    const r = proposalsToEntries([{ ...emptyProposal('reading'), rangeKm: 15 }, refuel], now, ids);
    expect(r).toEqual({ ok: false, problems: [undefined, 'To save, fill in: Total paid'] });
  });

  it('a trip needs its places, like the form', () => {
    const r = proposalsToEntries([{ ...emptyProposal('trip'), distanceKm: 12 }], now, ids);
    expect(r).toEqual({ ok: false, problems: ['To save, fill in: From, To'] });
  });

  it('keeps station, address, grade and stops', () => {
    const p: Proposal = {
      ...emptyProposal('refuel'),
      liters: 30,
      priceAmd: 15000,
      station: 'Flash',
      address: 'Komitas 5',
      grade: '92',
    };
    const t: Proposal = { ...emptyProposal('trip'), from: 'home', stops: ['shop'], to: 'work' };
    const r = proposalsToEntries([p, t], now, ids);
    expect(r.ok && r.entries[0]).toMatchObject({
      station: 'Flash',
      address: 'Komitas 5',
      grade: '92',
    });
    expect(r.ok && r.entries[1]).toMatchObject({ from: 'home', stops: ['shop'], to: 'work' });
  });
});

describe('legacyReadingToProposals', () => {
  it('an old photo reading becomes a card', () => {
    expect(legacyReadingToProposals({ rangeKm: 54, tripKm: 22.5, clock: '18:40' })).toEqual([
      { ...emptyProposal('trip'), rangeKm: 54, distanceKm: 22.5, clock: '18:40' },
    ]);
    expect(legacyReadingToProposals({ rangeKm: 54, tripKm: null, clock: null })[0].kind).toBe(
      'reading',
    );
    expect(legacyReadingToProposals(null)).toEqual([]);
    expect(legacyReadingToProposals({ rangeKm: null, tripKm: null, clock: null })).toEqual([]);
  });
});

describe('nudge', () => {
  it('steps by 0.1 and 1 without float noise, within 0..max', () => {
    expect(nudge(54, 0.1, 1200)).toBe(54.1);
    expect(nudge(0.3, -0.1, 1200)).toBe(0.2);
    expect(nudge(0.05, -1, 100)).toBe(0);
    expect(nudge(99.5, 1, 100)).toBe(100);
    expect(nudge(null, 1, 100)).toBe(1);
  });
});

describe('logContext', () => {
  it('is compact, oldest first, local time, no ids, tracks summarised', () => {
    const rows = JSON.parse(
      logContext([
        trip('t', at(16, 8, 10), 'a', 'b', { track: [{ lat: 1, lon: 2, t: 3 }] }),
        reading('r', at(15, 12, 49), 122),
      ]),
    );
    expect(rows[0]).toEqual({ when: '2026-10-15 12:49', kind: 'reading', rangeKm: 122 });
    expect(rows[1].track).toBe('1 GPS points');
  });
});
