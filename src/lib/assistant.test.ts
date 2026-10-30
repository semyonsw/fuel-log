import { describe, expect, it } from 'vitest';

import {
  applyChanges,
  changedFields,
  changeForModel,
  chatContext,
  clockToAt,
  emptyProposal,
  entryToValues,
  historyText,
  legacyReadingToProposals,
  logContext,
  logRefs,
  nowLine,
  nudge,
  parseChatReply,
  parseDate,
  parseProposal,
  proposalAt,
  proposalTimes,
  REPLY_SCHEMA,
  resolveChanges,
  SYSTEM_PROMPT,
  systemText,
  type Proposal,
} from './assistant';
import { kmPerLiterFromRefuels, latestPricePerLiter } from './fuel';
import { at, reading, realNotes, refuel, trip } from './entries.fixtures';
import type { Entry } from '../types';

const now = at(16, 19, 5);
let n = 0;
const ids = () => `id${++n}`;

/** What Gemini should send for "I bought 15L of fuel for 9000 AMD my fuel was 15km now shows 250km". */
const BOUGHT = JSON.stringify({
  reply: 'Logged a 15 km reading and the refuel.',
  changes: [
    { op: 'add', kind: 'reading', rangeKm: 15 },
    { op: 'add', kind: 'refuel', liters: 15, priceAmd: 9000, rangeKm: 250 },
  ],
  confidence: null,
});

const adds = (proposals: Proposal[]) => applyChanges(proposals, [], now, ids);

describe('the prompt', () => {
  it('calls it "the car", with no make, model or year', () => {
    expect(SYSTEM_PROMPT).toContain('the car');
    expect(SYSTEM_PROMPT).not.toMatch(/nissan|sentra|2023|SV/i);
  });

  it('teaches the refuel-with-before-and-after example, edits, deletes and the new kinds', () => {
    expect(SYSTEM_PROMPT).toContain('"kind":"reading","rangeKm":15');
    expect(SYSTEM_PROMPT).toMatch(/"update"/);
    expect(SYSTEM_PROMPT).toMatch(/"delete"/);
    expect(SYSTEM_PROMPT).toContain('"service"');
    expect(SYSTEM_PROMPT).toContain('"expense"');
    expect(SYSTEM_PROMPT).toContain('FACTS');
  });

  it("the schema stays in Gemini's subset: upper-case types, no oneOf", () => {
    const json = JSON.stringify(REPLY_SCHEMA);
    expect(json).not.toMatch(/oneOf|anyOf|"type":"[a-z]/);
    const item = REPLY_SCHEMA.properties.changes.items;
    expect(item.required).toEqual(['op', 'kind']);
    expect(item.properties.kind.enum).toEqual(['trip', 'reading', 'refuel', 'service', 'expense']);
    const categories = (item.properties.category as unknown as { enum: string[] }).enum;
    expect(categories).toContain('insurance');
    expect(categories.filter((c) => c === 'other')).toHaveLength(1);
  });

  it("tells the model today's date, weekday and time, then the facts and the log", () => {
    expect(nowLine(at(29, 14, 5))).toBe('2026-10-29 (Thursday) 14:05');
    const text = systemText({ now: at(29, 14, 5), logJson: '[LOG]', factsJson: '{FACTS}' });
    expect(text).toContain('2026-10-29 (Thursday) 14:05');
    expect(text.indexOf('{FACTS}')).toBeLessThan(text.indexOf('[LOG]'));
  });
});

describe('parseChatReply', () => {
  it('turns the refuel sentence into a reading then a refuel', () => {
    const r = parseChatReply(BOUGHT)!;
    expect(r.changes.map((e) => e.kind)).toEqual(['reading', 'refuel']);
    expect(r.changes[0]).toEqual({ ...emptyProposal('reading'), rangeKm: 15 });
    expect(r.changes[1]).toEqual({
      ...emptyProposal('refuel'),
      liters: 15,
      priceAmd: 9000,
      rangeKm: 250,
    });
  });

  it('a question has no changes', () => {
    expect(parseChatReply('{"reply":"You spent 15 000 AMD.","changes":[]}')).toEqual({
      reply: 'You spent 15 000 AMD.',
      changes: [],
      confidence: null,
    });
  });

  it('still reads the older "entries" key, as adds', () => {
    const r = parseChatReply({ reply: 'x', entries: [{ kind: 'reading', rangeKm: 9 }] })!;
    expect(r.changes).toEqual([{ ...emptyProposal('reading'), rangeKm: 9 }]);
  });

  it('malformed JSON or nothing usable is undefined', () => {
    expect(parseChatReply('{"reply": ')).toBeUndefined();
    expect(parseChatReply('{"reply":"","changes":[]}')).toBeUndefined();
    expect(parseChatReply(42)).toBeUndefined();
  });

  it('drops changes of unknown kind, and edits or deletes without a target', () => {
    const r = parseChatReply({
      reply: 'x',
      changes: [
        { op: 'add', kind: 'wash' },
        { op: 'add', kind: 'reading', rangeKm: 9 },
        { op: 'update', kind: 'refuel', liters: 30 },
        { op: 'delete', target: '' },
      ],
    })!;
    expect(r.changes).toHaveLength(1);
  });

  it('reads update and delete ops with their target ref', () => {
    const r = parseChatReply({
      reply: 'x',
      changes: [
        { op: 'update', target: 'e3', kind: 'refuel', liters: 30 },
        { op: 'delete', target: 'e2' },
      ],
    })!;
    expect(r.changes[0]).toMatchObject({ op: 'update', target: 'e3', liters: 30 });
    expect(r.changes[1]).toMatchObject({ op: 'delete', target: 'e2' });
  });

  it('keeps photo confidence', () => {
    expect(parseChatReply({ reply: 'x', changes: [], confidence: 'low' })!.confidence).toBe('low');
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
    expect(parseProposal({ kind: 'service', remindMonths: 600 })!.remindMonths).toBeNull();
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

  it('a category must belong to its kind', () => {
    expect(parseProposal({ kind: 'service', category: 'oil' })!.category).toBe('oil');
    expect(parseProposal({ kind: 'service', category: 'insurance' })!.category).toBeNull();
    expect(parseProposal({ kind: 'expense', category: 'insurance' })!.category).toBe('insurance');
    expect(parseProposal({ kind: 'refuel', category: 'oil' })!.category).toBeNull();
  });

  it('a date must be a real YYYY-MM-DD', () => {
    expect(parseDate('2026-10-15')).toBe('2026-10-15');
    expect(parseDate('2026-02-30')).toBeNull();
    expect(parseDate('15.10.2026')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseProposal({ kind: 'reading', date: '2026-13-01' })!.date).toBeNull();
  });
});

describe('when a card says it happened', () => {
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

  it('"yesterday at 18:00" is that date and clock; a date alone keeps the time of day', () => {
    expect(proposalAt({ date: '2026-10-15', clock: '18:00' }, now)).toBe(at(15, 18, 0));
    expect(proposalAt({ date: '2026-10-12', clock: null }, now)).toBe(
      new Date(2026, 9, 12, 19, 5).getTime(),
    );
  });

  it('same-moment past adds are still ordered; edits keep their own time', () => {
    const a = { ...emptyProposal('reading'), date: '2026-10-15', clock: '18:00' };
    const b = { ...emptyProposal('refuel'), date: '2026-10-15', clock: '18:00' };
    const u: Proposal = { ...emptyProposal('reading'), op: 'update', target: 'x', clock: '09:00' };
    expect(proposalTimes([a, u, b], now)).toEqual([at(15, 17, 59), at(16, 9, 0), at(15, 18, 0)]);
  });
});

describe('applyChanges: adds (Approve)', () => {
  it('the refuel sentence becomes a reading then a refuel, and the log can derive km/L from it', () => {
    const r = adds(parseChatReply(BOUGHT)!.changes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [rd, rf] = r.added;
    expect(rd).toMatchObject({ kind: 'reading', rangeKm: 15, at: now - 60_000 });
    expect(rf).toMatchObject({ kind: 'refuel', liters: 15, priceAmd: 9000, rangeKm: 250, at: now });
    expect(r.ids).toEqual([rd.id, rf.id]);
    // (250 − 15) / 15 L — exactly what the fuel calculator needs.
    expect(kmPerLiterFromRefuels(r.added)).toBeCloseTo(15.667, 3);
    expect(latestPricePerLiter(r.added)).toBe(600);
  });

  it('all or nothing: one incomplete card blocks the save and says what is missing', () => {
    const rf: Proposal = { ...emptyProposal('refuel'), liters: 15 };
    const r = adds([{ ...emptyProposal('reading'), rangeKm: 15 }, rf]);
    expect(r).toEqual({ ok: false, problems: [undefined, 'To save, fill in: Total paid'] });
  });

  it('a trip needs its places, like the form', () => {
    const r = adds([{ ...emptyProposal('trip'), distanceKm: 12 }]);
    expect(r).toEqual({ ok: false, problems: ['To save, fill in: From, To'] });
  });

  it('keeps station, address, grade, odometer and stops', () => {
    const p: Proposal = {
      ...emptyProposal('refuel'),
      liters: 30,
      priceAmd: 15000,
      station: 'Flash',
      address: 'Komitas 5',
      grade: '92',
      odometerKm: 84500,
    };
    const tr: Proposal = { ...emptyProposal('trip'), from: 'home', stops: ['shop'], to: 'work' };
    const r = adds([p, tr]);
    expect(r.ok && r.added[0]).toMatchObject({
      station: 'Flash',
      address: 'Komitas 5',
      grade: '92',
      odometerKm: 84500,
    });
    expect(r.ok && r.added[1]).toMatchObject({ from: 'home', stops: ['shop'], to: 'work' });
  });

  it('logs a service and an expense', () => {
    const svc = parseProposal({
      kind: 'service',
      category: 'oil',
      priceAmd: 25000,
      odometerKm: 84500,
      remindKm: 10000,
      place: 'Auto Plus',
    })!;
    const exp = parseProposal({ kind: 'expense', category: 'wash', priceAmd: 2000 })!;
    const r = adds([svc, exp]);
    expect(r.ok && r.added[0]).toMatchObject({
      kind: 'service',
      category: 'oil',
      costAmd: 25000,
      odometerKm: 84500,
      remindKm: 10000,
      place: 'Auto Plus',
    });
    expect(r.ok && r.added[1]).toMatchObject({
      kind: 'expense',
      category: 'wash',
      amountAmd: 2000,
    });
  });

  it('a service without a category is not saved', () => {
    const r = adds([parseProposal({ kind: 'service', priceAmd: 1000 })!]);
    expect(r).toEqual({ ok: false, problems: ['To save, fill in: Category'] });
  });

  it('yesterday is fine; a future date is refused on the card', () => {
    const y = { ...emptyProposal('reading'), rangeKm: 80, date: '2026-10-15', clock: '18:00' };
    const r = adds([y]);
    expect(r.ok && r.added[0].at).toBe(at(15, 18, 0));
    const f = { ...emptyProposal('reading'), rangeKm: 80, date: '2026-10-20' };
    expect(adds([f])).toEqual({ ok: false, problems: ['This date and time are in the future.'] });
    const later = { ...emptyProposal('reading'), rangeKm: 80, date: '2026-10-16', clock: '22:00' };
    expect(adds([later]).ok).toBe(false);
  });
});

describe('edits and deletes', () => {
  const log: Entry[] = [
    reading('r1', at(15, 12, 49), 122),
    { ...refuel('f1', at(15, 17, 30) + 25_000, 20, 10000, 300), station: 'Max', grade: '92' },
    trip('t1', at(16, 8, 10), 'home', 'work', {
      distanceKm: 14,
      rangeKm: 280,
      track: [{ lat: 1, lon: 2, t: 3 }],
    }),
  ];
  const ctx = chatContext(log, now);

  it('refs are short, oldest first, and appear in the log the model reads', () => {
    expect([...logRefs(log).values()]).toEqual(['e1', 'e2', 'e3']);
    expect(JSON.parse(ctx.logJson)[1]).toMatchObject({ ref: 'e2', kind: 'refuel', liters: 20 });
    expect(ctx.refToId.get('e2')).toBe('f1');
  });

  it('an update keeps what the model left blank, and marks what changed', () => {
    const [p] = resolveChanges(
      parseChatReply({
        reply: 'x',
        changes: [{ op: 'update', target: 'e2', kind: 'refuel', liters: 30 }],
      })!.changes,
      log,
      ctx.refToId,
    );
    expect(p).toMatchObject({
      op: 'update',
      target: 'f1',
      liters: 30,
      priceAmd: 10000,
      station: 'Max',
      grade: '92',
      date: '2026-10-15',
      clock: '17:30',
    });
    expect(p.before).toMatchObject({ liters: 20 });
    expect(changedFields(p)).toEqual(['liters']);
  });

  it('unknown refs are dropped', () => {
    const changes = parseChatReply({
      reply: 'x',
      changes: [
        { op: 'update', target: 'e9', kind: 'refuel', liters: 30 },
        { op: 'delete', target: 'f1' }, // a real id, but not a ref
        { op: 'delete', target: 'e1', kind: 'reading' },
      ],
    })!.changes;
    const out = resolveChanges(changes, log, ctx.refToId);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ op: 'delete', target: 'r1', kind: 'reading', rangeKm: 122 });
  });

  it('an update cannot turn a refuel into a trip, but a trip may become a reading', () => {
    const [a, b] = resolveChanges(
      [
        { ...emptyProposal('trip'), op: 'update', target: 'e2' },
        { ...emptyProposal('reading'), op: 'update', target: 'e3' },
      ],
      log,
      ctx.refToId,
    );
    expect(a.kind).toBe('refuel');
    expect(b.kind).toBe('reading');
  });

  it('approving an update replaces the entry by id, keeping its exact time and GPS track', () => {
    const [up] = resolveChanges(
      [
        { ...emptyProposal('refuel'), op: 'update', target: 'e2', station: 'Flash' },
        // nothing else
      ],
      log,
      ctx.refToId,
    );
    const [trUp] = resolveChanges(
      [{ ...emptyProposal('trip'), op: 'update', target: 'e3', distanceKm: 15 }],
      log,
      ctx.refToId,
    );
    const r = applyChanges([up, trUp], log, now, ids);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.added).toEqual([]);
    expect(r.updated[0]).toEqual({ ...log[1], station: 'Flash' });
    expect(r.updated[1]).toMatchObject({
      id: 't1',
      distanceKm: 15,
      track: log[2].kind === 'trip' ? log[2].track : [],
    });
    expect(r.ids).toEqual(['f1', 't1']);
  });

  it('a changed date moves the entry; a future one is refused', () => {
    const [up] = resolveChanges(
      [{ ...emptyProposal('reading'), op: 'update', target: 'e1', date: '2026-10-14' }],
      log,
      ctx.refToId,
    );
    const r = applyChanges([up], log, now, ids);
    expect(r.ok && r.updated[0].at).toBe(at(14, 12, 49));
    expect(applyChanges([{ ...up, date: '2026-10-30' }], log, now, ids).ok).toBe(false);
  });

  it('approving a delete removes by id', () => {
    const del = resolveChanges(
      [{ ...emptyProposal('reading'), op: 'delete', target: 'e1' }],
      log,
      ctx.refToId,
    );
    expect(applyChanges(del, log, now, ids)).toEqual({
      ok: true,
      added: [],
      updated: [],
      removed: ['r1'],
      ids: ['r1'],
    });
  });

  it('an entry that has gone since is a problem on its card, never a re-add', () => {
    const del = resolveChanges(
      [{ ...emptyProposal('reading'), op: 'delete', target: 'e1' }],
      log,
      ctx.refToId,
    );
    const without = log.filter((e) => e.id !== 'r1');
    expect(applyChanges(del, without, now, ids)).toEqual({
      ok: false,
      problems: ['This entry is no longer in the log.'],
    });
  });

  it("history goes back to the model with this request's refs and no blanks", () => {
    const [up] = resolveChanges(
      [{ ...emptyProposal('refuel'), op: 'update', target: 'e2', liters: 30 }],
      log,
      ctx.refToId,
    );
    const m = changeForModel(up, ctx.idToRef);
    expect(m).toMatchObject({ op: 'update', target: 'e2', liters: 30, station: 'Max' });
    expect(m).not.toHaveProperty('before');
    expect(m).not.toHaveProperty('distanceKm');
    // The entry is gone by the next turn: the target says so.
    expect(changeForModel(up, new Map())).toMatchObject({ target: null });
    expect(JSON.parse(historyText('ok', [up], ctx.idToRef))).toMatchObject({
      reply: 'ok',
      changes: [{ op: 'update' }],
    });
  });

  it('a saved answer tells the model so, and which entry each add became', () => {
    const r = adds(parseChatReply(BOUGHT)!.changes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = [...log, ...r.added];
    const later = chatContext(after, now + 60_000);
    const sent = JSON.parse(
      historyText('ok', parseChatReply(BOUGHT)!.changes, later.idToRef, r.ids),
    );
    expect(sent.saved).toBe(true);
    expect(sent.changes.map((c: { ref: string }) => later.refToId.get(c.ref))).toEqual(r.ids);
    // Not approved yet: no "saved", no refs.
    const open = JSON.parse(historyText('ok', parseChatReply(BOUGHT)!.changes, later.idToRef));
    expect(open).not.toHaveProperty('saved');
    expect(open.changes[0]).not.toHaveProperty('ref');
    expect(SYSTEM_PROMPT).toContain('"saved": true');
  });

  it('two changes to one entry: the later one is meant', () => {
    const out = resolveChanges(
      [
        { ...emptyProposal('refuel'), op: 'update', target: 'e2', liters: 30 },
        { ...emptyProposal('refuel'), op: 'delete', target: 'e2' },
      ],
      log,
      ctx.refToId,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ op: 'delete', target: 'f1' });
  });

  it('an update approved after the entry changed elsewhere keeps that change', () => {
    const [up] = resolveChanges(
      [{ ...emptyProposal('refuel'), op: 'update', target: 'e2', liters: 30 }],
      log,
      ctx.refToId,
    );
    // Meanwhile the station was fixed in the log, and the entry moved an hour.
    const f1 = log[1].kind === 'refuel' ? log[1] : undefined;
    const edited: Entry = { ...f1!, station: 'Flash', at: f1!.at + 3_600_000 };
    const r = applyChanges([up], [log[0], edited, log[2]], now, ids);
    expect(r.ok && r.updated[0]).toEqual({ ...edited, liters: 30 });
  });

  it('entryToValues round-trips every kind', () => {
    const svc: Entry = {
      id: 's',
      at: at(10, 9, 0),
      kind: 'service',
      category: 'oil',
      costAmd: 0,
      odometerKm: 84000,
      remindMonths: 12,
    };
    expect(entryToValues(svc)).toMatchObject({
      kind: 'service',
      category: 'oil',
      priceAmd: 0,
      odometerKm: 84000,
      remindMonths: 12,
      date: '2026-10-10',
      clock: '09:00',
    });
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
  it('is compact, oldest first, local time, refs not ids, tracks summarised', () => {
    const rows = JSON.parse(
      logContext([
        trip('t', at(16, 8, 10), 'a', 'b', { track: [{ lat: 1, lon: 2, t: 3 }] }),
        reading('r', at(15, 12, 49), 122),
      ]),
    );
    expect(rows[0]).toEqual({ ref: 'e1', when: '2026-10-15 12:49', kind: 'reading', rangeKm: 122 });
    expect(rows[1].track).toBe('1 GPS points');
    expect(rows[1]).not.toHaveProperty('stops');
    expect(JSON.stringify(rows)).not.toContain('"id"');
  });

  it('the facts in the context name entries by ref', () => {
    const dup = [refuel('a', at(15, 10, 0), 20, 10000), refuel('b', at(15, 10, 30), 20, 10000)];
    const facts = JSON.parse(chatContext([...realNotes, ...dup], now).factsJson);
    const issue = facts.issues.find((i: { type: string }) => i.type === 'duplicate-refuel');
    expect(issue.refs).toEqual(['e1', 'e2']);
    expect(issue).not.toHaveProperty('ids');
  });
});
