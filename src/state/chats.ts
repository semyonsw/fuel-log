/**
 * AI chat history, persisted. Text and readings only — photos are never
 * written (see lib/chat). The pure edits live in lib/chat; this is storage.
 *
 * It reads through `persistStorage` like the log and settings, so a 1.7.x
 * chats blob is set aside in the pre-2.0 safety copy before this store can
 * rewrite it.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { sanitizeChats, type Chat } from '../lib/chat';
import { CHATS_KEY, persistStorage } from './legacyStorage';

export { CHATS_KEY };

interface ChatsState {
  chats: Chat[];
  /**
   * Session state, never written: App waits for it before auto-backup starts,
   * so a backup cannot be taken (and older files pruned) before chats load.
   */
  hydrated: boolean;
  /** Insert or replace by id. */
  put: (c: Chat) => void;
  remove: (id: string) => void;
  setAll: (chats: Chat[]) => void;
}

export const useChats = create<ChatsState>()(
  persist(
    (set) => ({
      chats: [],
      hydrated: false,
      put: (c) => set((s) => ({ chats: [c, ...s.chats.filter((x) => x.id !== c.id)] })),
      remove: (id) => set((s) => ({ chats: s.chats.filter((x) => x.id !== id) })),
      setAll: (chats) => set({ chats }),
    }),
    {
      name: CHATS_KEY,
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ chats: s.chats }),
      // sanitizeChats drops what 2.0 cannot show (removed kinds, broken rows).
      merge: (persisted, current) =>
        persisted == null
          ? current
          : { ...current, chats: sanitizeChats((persisted as { chats?: unknown }).chats) },
      // Called after every rehydrate — with nothing stored, and after an error too.
      onRehydrateStorage: () => () => {
        useChats.setState({ hydrated: true });
      },
    },
  ),
);
