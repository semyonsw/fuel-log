/**
 * AI chats as data: a list of conversations, each a list of messages.
 *
 * Photos are never kept — not in AsyncStorage, not in the backup. A message
 * that carried one keeps only `hasPhoto`, so the thread still reads right
 * ("📷 Photo") and the model's reading that came back is still there. While a
 * chat is open the photo stays in memory so corrections can refer to it.
 */

import type { ClusterReading } from './cluster';

export type ChatMessage = {
  id: string;
  role: 'user' | 'model';
  text: string;
  at: number;
  hasPhoto?: boolean;
  reading?: ClusterReading | null;
  /** A failed request shown in the thread; never sent back to the model. */
  error?: boolean;
};

export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

export const NEW_CHAT_TITLE = 'New chat';

export function newChat(id: string, now: number): Chat {
  return { id, title: NEW_CHAT_TITLE, createdAt: now, updatedAt: now, messages: [] };
}

/** First user words, trimmed to fit a list row; a photo-only start is "Dashboard photo". */
export function chatTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return NEW_CHAT_TITLE;
  const text = first.text.trim().replace(/\s+/g, ' ');
  if (!text) return first.hasPhoto ? 'Dashboard photo' : NEW_CHAT_TITLE;
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

export function appendMessage(chat: Chat, msg: ChatMessage): Chat {
  const messages = [...chat.messages, msg];
  return {
    ...chat,
    messages,
    updatedAt: msg.at,
    title: chat.title === NEW_CHAT_TITLE ? chatTitle(messages) : chat.title,
  };
}

/** Replaces the reading on one message (the user edited it on the card). */
export function setReading(chat: Chat, messageId: string, reading: ClusterReading): Chat {
  return {
    ...chat,
    messages: chat.messages.map((m) => (m.id === messageId ? { ...m, reading } : m)),
  };
}

/** Newest activity first. */
export function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Read back from disk or a backup: keep well-formed chats and messages only. */
export function sanitizeChats(raw: unknown): Chat[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c): c is Chat =>
        typeof c === 'object' &&
        c !== null &&
        typeof c.id === 'string' &&
        typeof c.createdAt === 'number' &&
        Array.isArray(c.messages),
    )
    .map((c) => ({
      id: c.id,
      title: typeof c.title === 'string' ? c.title : NEW_CHAT_TITLE,
      createdAt: c.createdAt,
      updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : c.createdAt,
      messages: c.messages.filter(
        (m): m is ChatMessage =>
          typeof m === 'object' &&
          m !== null &&
          typeof m.id === 'string' &&
          (m.role === 'user' || m.role === 'model') &&
          typeof m.text === 'string' &&
          typeof m.at === 'number',
      ),
    }));
}
