/**
 * AI chats as data: a list of conversations, each a list of messages.
 *
 * Photos are never kept — not in AsyncStorage, not in the backup. A message
 * that carried one keeps only `hasPhoto`, so the thread still reads right
 * ("📷 Photo") and the entries the model proposed are still there. While a
 * chat is open the photo stays in memory so corrections can refer to it.
 *
 * A model message can carry proposed entries; once the user approves them,
 * `savedIds` records the log entries they became, so the card shows "Saved"
 * and cannot add the same refuel twice.
 */

import { t } from '../i18n';
import { STRINGS } from '../i18n/strings';
import {
  legacyReadingToProposals,
  parseProposal,
  type Confidence,
  type Proposal,
} from './assistant';

export type ChatMessage = {
  id: string;
  role: 'user' | 'model';
  text: string;
  at: number;
  hasPhoto?: boolean;
  proposals?: Proposal[];
  confidence?: Confidence | null;
  /** Ids of the log entries the approved proposals became. */
  savedIds?: string[];
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

/**
 * A fresh chat's title, in the language of the moment it was made. The title
 * is stored, so "still untitled" is recognised in every language: a chat
 * started in Russian and continued after switching to English still gets
 * named from its first message.
 */
export const newChatTitle = () => t('form.chat.newTitle');

const UNTITLED = new Set<string>(
  Object.values(STRINGS).map((table) => table['form.chat.newTitle']),
);

export function isUntitled(title: string): boolean {
  return UNTITLED.has(title);
}

export function newChat(id: string, now: number): Chat {
  return { id, title: newChatTitle(), createdAt: now, updatedAt: now, messages: [] };
}

/** First user words, trimmed to fit a list row; a photo-only start is "Dashboard photo". */
export function chatTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return newChatTitle();
  const text = first.text.trim().replace(/\s+/g, ' ');
  if (!text) return first.hasPhoto ? t('form.chat.photoTitle') : newChatTitle();
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

export function appendMessage(chat: Chat, msg: ChatMessage): Chat {
  const messages = [...chat.messages, msg];
  return {
    ...chat,
    messages,
    updatedAt: msg.at,
    title: isUntitled(chat.title) ? chatTitle(messages) : chat.title,
  };
}

/** Changes one message (the user edited its cards, or approved them). */
export function updateMessage(
  chat: Chat,
  messageId: string,
  patch: Partial<Pick<ChatMessage, 'proposals' | 'savedIds'>>,
): Chat {
  return {
    ...chat,
    messages: chat.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
  };
}

/** One message as read back from disk: proposals re-checked, old photo readings migrated. */
function sanitizeMessage(m: ChatMessage & { reading?: unknown }): ChatMessage {
  const { reading, ...rest } = m;
  const proposals = Array.isArray(m.proposals)
    ? m.proposals.map(parseProposal).filter((p): p is Proposal => p !== null)
    : legacyReadingToProposals(reading);
  const out: ChatMessage = { ...rest };
  delete out.proposals;
  if (proposals.length) out.proposals = proposals;
  if (!Array.isArray(m.savedIds)) delete out.savedIds;
  return out;
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
      title: typeof c.title === 'string' ? c.title : newChatTitle(),
      createdAt: c.createdAt,
      updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : c.createdAt,
      messages: c.messages
        .filter(
          (m): m is ChatMessage =>
            typeof m === 'object' &&
            m !== null &&
            typeof m.id === 'string' &&
            (m.role === 'user' || m.role === 'model') &&
            typeof m.text === 'string' &&
            typeof m.at === 'number',
        )
        .map(sanitizeMessage),
    }));
}
