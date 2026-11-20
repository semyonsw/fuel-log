import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Chat } from '../lib/chat';
import { CHATS_KEY, useChats } from './chats';

/**
 * The chats store against the in-memory AsyncStorage stub: the edits, the key
 * it writes, and what a relaunch reads back from a good or a broken blob.
 */

/** Let the persist middleware's async write land. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const chat = (id: string, updatedAt: number, text = 'hi'): Chat => ({
  id,
  title: id,
  createdAt: 0,
  updatedAt,
  messages: [{ id: `${id}-m`, role: 'user', text, at: updatedAt }],
});

beforeEach(async () => {
  await flush();
  useChats.setState({ chats: [] });
  await flush();
  await AsyncStorage.removeItem(CHATS_KEY);
});

afterEach(async () => {
  await flush();
  await AsyncStorage.removeItem(CHATS_KEY);
});

describe('edits', () => {
  it('puts a new chat first', () => {
    useChats.getState().put(chat('a', 1));
    useChats.getState().put(chat('b', 2));
    expect(useChats.getState().chats.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('putting an existing id replaces it rather than duplicating', () => {
    useChats.getState().put(chat('a', 1, 'old'));
    useChats.getState().put(chat('a', 2, 'new'));
    const chats = useChats.getState().chats;
    expect(chats).toHaveLength(1);
    expect(chats[0].messages[0].text).toBe('new');
  });

  it('removes by id', () => {
    useChats.getState().put(chat('a', 1));
    useChats.getState().put(chat('b', 2));
    useChats.getState().remove('a');
    expect(useChats.getState().chats.map((c) => c.id)).toEqual(['b']);
  });
});

describe('persistence', () => {
  it('writes under the chats key', async () => {
    expect(CHATS_KEY).toBe('fuel-log/chats/v1');
    useChats.getState().put(chat('a', 1));
    await flush();
    const raw = await AsyncStorage.getItem(CHATS_KEY);
    expect(JSON.parse(raw!).state.chats[0].id).toBe('a');
  });

  it('reads chats back after a relaunch', async () => {
    useChats.getState().put(chat('a', 1));
    await flush();
    const blob = (await AsyncStorage.getItem(CHATS_KEY))!;
    useChats.setState({ chats: [] });
    await flush();
    await AsyncStorage.setItem(CHATS_KEY, blob);
    await useChats.persist.rehydrate();
    expect(useChats.getState().chats.map((c) => c.id)).toEqual(['a']);
  });

  it('marks itself hydrated after reading, and never writes the flag', async () => {
    useChats.setState({ hydrated: false });
    await useChats.persist.rehydrate();
    expect(useChats.getState().hydrated).toBe(true);
    useChats.getState().put(chat('a', 1));
    await flush();
    const raw = await AsyncStorage.getItem(CHATS_KEY);
    expect(JSON.parse(raw!).state).not.toHaveProperty('hydrated');
  });

  it('drops malformed chats and messages on the way in', async () => {
    const state = {
      chats: [chat('ok', 1), { id: 3 }, { ...chat('half', 2), messages: [{ role: 'x' }] }],
    };
    await AsyncStorage.setItem(CHATS_KEY, JSON.stringify({ version: 1, state }));
    await useChats.persist.rehydrate();
    const chats = useChats.getState().chats;
    expect(chats.map((c) => c.id)).toEqual(['ok', 'half']);
    expect(chats[1].messages).toEqual([]);
  });
});
