import { describe, expect, it } from 'vitest';

import { emptyProposal } from './assistant';
import {
  appendMessage,
  chatTitle,
  isUntitled,
  newChat,
  sanitizeChats,
  sortChats,
  supersededIds,
  updateMessage,
  type ChatMessage,
} from './chat';

const msg = (id: string, role: 'user' | 'model', text: string, at = 1): ChatMessage => ({
  id,
  role,
  text,
  at,
});

describe('chats', () => {
  it('a new chat is untitled until its first user message names it', () => {
    const c = newChat('c', 1);
    expect(isUntitled(c.title)).toBe(true);
    const named = appendMessage(c, msg('m', 'user', '  how much   did I spend? ', 5));
    expect(named).toMatchObject({ title: 'how much did I spend?', updatedAt: 5 });
    expect(c.messages).toEqual([]);
  });

  it('a photo-only start is "Dashboard photo"; long text is cut to fit', () => {
    expect(chatTitle([{ ...msg('m', 'user', ''), hasPhoto: true }])).toBe('Dashboard photo');
    expect(chatTitle([msg('m', 'user', 'x'.repeat(60))])).toHaveLength(40);
  });

  it('updates one message without touching the others', () => {
    const c = appendMessage(
      appendMessage(newChat('c', 1), msg('a', 'user', 'hi')),
      msg('b', 'model', 'ok'),
    );
    const out = updateMessage(c, 'b', { savedIds: ['e1'] });
    expect(out.messages[1].savedIds).toEqual(['e1']);
    expect(out.messages[0]).toBe(c.messages[0]);
    expect(c.messages[1].savedIds).toBeUndefined();
  });

  it('sorts newest activity first', () => {
    const a = { ...newChat('a', 1), updatedAt: 1 };
    const b = { ...newChat('b', 1), updatedAt: 2 };
    expect(sortChats([a, b]).map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('sanitizeChats', () => {
  it('keeps well-formed chats and messages; re-checks proposals', () => {
    const raw = [
      {
        id: 'c',
        createdAt: 1,
        messages: [
          {
            id: 'm',
            role: 'model',
            text: 'x',
            at: 2,
            proposals: [{ kind: 'reading', rangeKm: 9 }, { kind: 'service' }],
            savedIds: 'no',
          },
          { id: 'bad', role: 'system', text: 'x', at: 2 },
        ],
      },
      { id: 'nope' },
      42,
    ];
    const [c, ...rest] = sanitizeChats(raw);
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ id: 'c', updatedAt: 1, title: 'New chat' });
    expect(c.messages).toHaveLength(1);
    expect(c.messages[0].proposals).toEqual([{ ...emptyProposal('reading'), rangeKm: 9 }]);
    expect(c.messages[0]).not.toHaveProperty('savedIds');
    expect(sanitizeChats('junk')).toEqual([]);
  });

  it('an old photo reading becomes a card', () => {
    const [c] = sanitizeChats([
      {
        id: 'c',
        createdAt: 1,
        messages: [{ id: 'm', role: 'model', text: '', at: 1, reading: { rangeKm: 54 } }],
      },
    ]);
    expect(c.messages[0]).not.toHaveProperty('reading');
    expect(c.messages[0].proposals?.[0]).toMatchObject({ kind: 'reading', rangeKm: 54 });
  });
});

describe('supersededIds', () => {
  const cards = (id: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
    ...msg(id, 'model', 'x'),
    proposals: [emptyProposal('refuel')],
    ...extra,
  });

  it('a corrected set replaces the earlier unsaved one, so only the newest can be approved', () => {
    // Arrange: cards, "it was 16 litres", the full corrected set again
    const thread = [
      msg('u1', 'user', 'bought 15 L'),
      cards('a'),
      msg('u2', 'user', 'it was 16'),
      cards('b'),
    ];

    // Act
    const out = supersededIds(thread);

    // Assert
    expect([...out]).toEqual(['a']);
  });

  it('never replaces saved cards, and plain answers or errors replace nothing', () => {
    const thread = [
      cards('saved', { savedIds: ['e1'] }),
      cards('open'),
      msg('q', 'model', 'you spent 9000 AMD'),
      { ...msg('err', 'model', 'Offline.'), error: true },
    ];
    expect(supersededIds(thread).size).toBe(0);
    expect([...supersededIds([...thread, cards('newer')])]).toEqual(['open']);
  });
});

describe('sanitizeChats: 1.7 cards of removed kinds', () => {
  const read = (proposals: unknown[], savedIds: unknown) =>
    sanitizeChats([
      {
        id: 'c',
        createdAt: 1,
        messages: [{ id: 'm', role: 'model', text: '', at: 1, proposals, savedIds }],
      },
    ])[0].messages[0];

  it('drops a removed kind together with its saved id, so the ids stay paired with their cards', () => {
    // Arrange: a 1.7 answer that saved a service, a reading and a refuel
    const raw = [
      { kind: 'service' },
      { kind: 'reading', rangeKm: 9 },
      { kind: 'refuel', liters: 5 },
    ];

    // Act
    const m = read(raw, ['svc', 'r1', 'f1']);

    // Assert
    expect(m.proposals?.map((p) => p.kind)).toEqual(['reading', 'refuel']);
    expect(m.savedIds).toEqual(['r1', 'f1']);
  });

  it('ids that never lined up stay saved but name no entries once a card is dropped', () => {
    const m = read([{ kind: 'expense' }, { kind: 'reading', rangeKm: 9 }], ['x']);
    expect(m.proposals).toHaveLength(1);
    expect(m.savedIds).toEqual([]);
  });

  it('keeps ids as they were when nothing is dropped', () => {
    expect(read([{ kind: 'reading', rangeKm: 9 }], ['r1']).savedIds).toEqual(['r1']);
  });
});
