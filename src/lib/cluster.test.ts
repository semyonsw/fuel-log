import { describe, expect, it } from 'vitest';

import {
  clockToAt,
  logContext,
  mergePhotoIntoDraft,
  nudge,
  parseChatReply,
  parseClusterReply,
  suggestedKind,
  type ClusterReading,
} from './cluster';
import { emptyDraft } from './draft';
import { at, reading, trip } from './entries.fixtures';

const good: ClusterReading = {
  rangeKm: 54,
  tripKm: 22.5,
  clock: '18:40',
  confidence: 'high',
  notes: null,
};

describe('parseClusterReply', () => {
  it('accepts a good reply', () => {
    expect(parseClusterReply(good)).toEqual(good);
  });

  it('keeps the readable part of a partial reply', () => {
    expect(
      parseClusterReply({ rangeKm: 54, tripKm: null, clock: null, confidence: 'medium' }),
    ).toEqual({ rangeKm: 54, tripKm: null, clock: null, confidence: 'medium', notes: null });
  });

  it('an empty reply is no reading', () => {
    expect(parseClusterReply({ rangeKm: null, tripKm: null, clock: null })).toBeNull();
    expect(parseClusterReply(null)).toBeNull();
    expect(parseClusterReply('nope')).toBeNull();
  });

  it('junk and negative numbers become null', () => {
    const r = parseClusterReply({ rangeKm: -5, tripKm: 'twelve', clock: '18:40' });
    expect(r).toMatchObject({ rangeKm: null, tripKm: null, clock: '18:40' });
    expect(parseClusterReply({ rangeKm: NaN, tripKm: 3, clock: null })!.rangeKm).toBeNull();
  });

  it('an odometer mistaken for the trip meter is rejected', () => {
    expect(parseClusterReply({ rangeKm: 54, tripKm: 41235, clock: null })!.tripKm).toBeNull();
  });

  it('an implausible range is rejected', () => {
    expect(parseClusterReply({ rangeKm: 1500, tripKm: 2, clock: null })!.rangeKm).toBeNull();
  });

  it('clock must be HH:MM 24-hour; single-digit hours are padded', () => {
    expect(parseClusterReply({ rangeKm: 1, clock: '7:05' })!.clock).toBe('07:05');
    expect(parseClusterReply({ rangeKm: 1, clock: '25:00' })!.clock).toBeNull();
    expect(parseClusterReply({ rangeKm: 1, clock: '6:40 PM' })!.clock).toBeNull();
  });

  it('unknown confidence is treated as low', () => {
    expect(parseClusterReply({ rangeKm: 1, confidence: 'sure' })!.confidence).toBe('low');
  });
});

describe('parseChatReply', () => {
  it('parses the JSON string the API returns', () => {
    expect(parseChatReply(JSON.stringify({ reply: 'Got it', reading: good }))).toEqual({
      reply: 'Got it',
      reading: good,
    });
  });

  it('a text-only answer has no reading', () => {
    expect(parseChatReply('{"reply":"You spent 15 000 AMD.","reading":null}')).toEqual({
      reply: 'You spent 15 000 AMD.',
      reading: null,
    });
  });

  it('malformed JSON or nothing usable is undefined', () => {
    expect(parseChatReply('{"reply": ')).toBeUndefined();
    expect(parseChatReply('{"reply":"","reading":null}')).toBeUndefined();
    expect(parseChatReply(42)).toBeUndefined();
  });
});

describe('clockToAt', () => {
  const now = at(16, 19, 5);
  it('is today at that time', () => {
    expect(clockToAt('18:40', now)).toBe(at(16, 18, 40));
  });
  it('a time later than now means yesterday (photo from before midnight)', () => {
    expect(clockToAt('23:50', at(17, 0, 10))).toBe(at(16, 23, 50));
    expect(clockToAt('19:06', now)).toBe(at(15, 19, 6));
  });
  it('rejects a bad clock', () => {
    expect(clockToAt('nope', now)).toBeUndefined();
  });
});

describe('mergePhotoIntoDraft', () => {
  const now = at(16, 19, 5);

  it('Trip: fills range, distance and time', () => {
    const { draft, filled } = mergePhotoIntoDraft(emptyDraft('trip', now), good, now);
    expect(draft).toMatchObject({ range: '54', distance: '22.5', at: at(16, 18, 40) });
    expect(filled).toEqual({ range: true, distance: true, at: true });
  });

  it('Range: never fills distance', () => {
    const { draft, filled } = mergePhotoIntoDraft(emptyDraft('reading', now), good, now);
    expect(draft.distance).toBe('');
    expect(filled.distance).toBeUndefined();
    expect(draft.range).toBe('54');
  });

  it('Refuel: range is "range after", no distance', () => {
    const { draft } = mergePhotoIntoDraft(emptyDraft('refuel', now), good, now);
    expect(draft).toMatchObject({ range: '54', distance: '' });
  });

  it('fills empty fields only', () => {
    const typed = { ...emptyDraft('trip', now), range: '60', distance: '' };
    const { draft, filled } = mergePhotoIntoDraft(typed, good, now);
    expect(draft.range).toBe('60');
    expect(draft.distance).toBe('22.5');
    expect(filled.range).toBeUndefined();
  });

  it('leaves a time the user already set', () => {
    const d = { ...emptyDraft('trip', now), at: at(16, 10, 0) };
    expect(mergePhotoIntoDraft(d, good, now, false).draft.at).toBe(at(16, 10, 0));
  });
});

describe('nudge', () => {
  it('steps by 0.1 and 1 without float noise', () => {
    expect(nudge(54, 0.1, 1200)).toBe(54.1);
    expect(nudge(0.3, -0.1, 1200)).toBe(0.2);
    expect(nudge(22.5, 1, 2000)).toBe(23.5);
  });
  it('stays within 0..max; null starts from 0', () => {
    expect(nudge(0.05, -1, 100)).toBe(0);
    expect(nudge(99.5, 1, 100)).toBe(100);
    expect(nudge(null, 1, 100)).toBe(1);
  });
});

describe('suggestedKind / logContext', () => {
  it('a trip meter value means a trip', () => {
    expect(suggestedKind(good)).toBe('trip');
    expect(suggestedKind({ ...good, tripKm: null })).toBe('reading');
  });

  it('log context is compact, oldest first, local time, no ids, tracks summarised', () => {
    const json = logContext([
      trip('t', at(16, 8, 10), 'a', 'b', { track: [{ lat: 1, lon: 2, t: 3 }] }),
      reading('r', at(15, 12, 49), 122),
    ]);
    const rows = JSON.parse(json);
    expect(rows[0]).toEqual({ when: '2026-10-15 12:49', kind: 'reading', rangeKm: 122 });
    expect(rows[1].track).toBe('1 GPS points');
    expect(json).not.toContain('"id"');
  });
});
