/**
 * AI chats as data: a list of conversations, each a list of messages.
 *
 * Photos are never kept — not in AsyncStorage, not in the backup. A message
 * that carried one keeps only `hasPhoto`, so the thread still reads right
 * ("📷 Photo") and the entries the model proposed are still there. While a
 * chat is open the photo stays in memory so corrections can refer to it.
 *
 * A model message can carry proposed changes (adds, updates, deletes); once
 * the user approves them, `savedIds` records the log entries they touched, so
 * the card shows "Saved" and cannot add the same refuel twice. Chats saved
 * before updates and deletes existed hold plain proposals with no `op`; they
 * read back as adds, which is all they ever were.
 */

import { t } from '../i18n';
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
  /** Ids of the log entries the approved changes added, updated or deleted. */
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

/** A fresh chat's title, until its first message names it. */
export const newChatTitle = (): string => t('ai.chat.newTitle');

export function isUntitled(title: string): boolean {
  return title === newChatTitle();
}

export function newChat(id: string, now: number): Chat {
  return { id, title: newChatTitle(), createdAt: now, updatedAt: now, messages: [] };
}

/** First user words, trimmed to fit a list row; a photo-only start is "Dashboard photo". */
export function chatTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return newChatTitle();
  const text = first.text.trim().replace(/\s+/g, ' ');
  if (!text) return first.hasPhoto ? t('ai.chat.photoTitle') : newChatTitle();
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

/**
 * The unsaved proposal messages a later answer has replaced. When the user
 * corrects an unsaved card ("it was 16 litres"), the model re-sends the full
 * corrected set (prompt rule 3), so the older cards are a stale copy of the
 * same entries: approving both would log them twice. Only the newest unsaved
 * set stays live; anything already saved is history, never replaced.
 */
export function supersededIds(messages: ChatMessage[]): Set<string> {
  const out = new Set<string>();
  let newerProposals = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'model' || !m.proposals?.length) continue;
    if (newerProposals && !m.savedIds) out.add(m.id);
    newerProposals = true;
  }
  return out;
}

/**
 * Proposals re-checked on read. A 1.7 card of a removed kind (service,
 * expense) is dropped, and its saved id with it: `savedIds` runs in card
 * order, so dropping one side alone would pin the next card to the wrong entry.
 */
function sanitizeProposals(
  raw: unknown[],
  savedIds: unknown,
): { proposals: Proposal[]; savedIds?: string[] } {
  const ids = Array.isArray(savedIds) && savedIds.length === raw.length ? savedIds : null;
  const kept = raw
    .map((p, i) => ({ p: parseProposal(p), id: ids?.[i] }))
    .filter((x): x is { p: Proposal; id: unknown } => x.p !== null);
  const proposals = kept.map((x) => x.p);
  if (ids) return { proposals, savedIds: kept.map((x) => String(x.id)) };
  if (!Array.isArray(savedIds)) return { proposals };
  // Ids that do not line up with the cards cannot be re-paired. If nothing was
  // dropped they are kept as they were; otherwise the message stays saved (so
  // Approve cannot add the entries again) but names no entries.
  return { proposals, savedIds: kept.length === raw.length ? savedIds : [] };
}

/** One message as read back from disk: proposals re-checked, old photo readings migrated. */
function sanitizeMessage(m: ChatMessage & { reading?: unknown }): ChatMessage {
  const { reading, proposals: stored, savedIds: storedIds, ...plain } = m;
  const { proposals, savedIds } = Array.isArray(stored)
    ? sanitizeProposals(stored, storedIds)
    : {
        proposals: legacyReadingToProposals(reading),
        savedIds: Array.isArray(storedIds) ? storedIds : undefined,
      };
  return {
    ...plain,
    ...(proposals.length ? { proposals } : {}),
    ...(savedIds ? { savedIds } : {}),
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
