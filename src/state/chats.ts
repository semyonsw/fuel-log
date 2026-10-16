/**
 * AI chat history, persisted. Text and readings only — photos are never
 * written (see lib/chat). The pure edits live in lib/chat; this is storage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { sanitizeChats, type Chat } from '../lib/chat';

export const CHATS_KEY = 'fuel-log/chats/v1';

interface ChatsState {
  chats: Chat[];
  /** Insert or replace by id. */
  put: (c: Chat) => void;
  remove: (id: string) => void;
  setAll: (chats: Chat[]) => void;
}

export const useChats = create<ChatsState>()(
  persist(
    (set) => ({
      chats: [],
      put: (c) => set((s) => ({ chats: [c, ...s.chats.filter((x) => x.id !== c.id)] })),
      remove: (id) => set((s) => ({ chats: s.chats.filter((x) => x.id !== id) })),
      setAll: (chats) => set({ chats }),
    }),
    {
      name: CHATS_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ chats: s.chats }),
      merge: (persisted, current) =>
        persisted == null
          ? current
          : { ...current, chats: sanitizeChats((persisted as { chats?: unknown }).chats) },
    },
  ),
);
