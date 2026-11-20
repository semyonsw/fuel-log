/**
 * AI chat (Gemini): read dashboard photos, log, fix and delete entries, and
 * answer questions about the log.
 *
 * ── A CHAT, NOT A FORM ───────────────────────────────────────────────────
 *
 * The user says what happened ("bought 15 L for 9000 AMD, fuel was 15 km,
 * now shows 250 km") or sends a dashboard photo. Gemini answers in the thread
 * and, when there is something to log, proposes the entries it implies as
 * cards under the answer. Every value on a card is editable three ways —
 * correct it by chatting, nudge it (−1 −0.1 +0.1 +1), or tap and type — and
 * one Approve saves all of them to the log, through the same validation as
 * the form. Saved entries stay editable in the log like any other.
 *
 * Fixing the log works the same way: "it was 30 L, not 20" comes back as an
 * edit card with 20 → 30 marked, "delete yesterday's reading" as a card that
 * shows the entry and a red Delete. Nothing the model says changes the log
 * until that card is approved.
 *
 * ── HISTORY ──────────────────────────────────────────────────────────────
 *
 * Chats are kept (text and cards; photos never) and listed newest first;
 * "+" starts a fresh one. A photo stays in memory while its chat is open so
 * follow-up corrections can still refer to it.
 *
 * A request belongs to the chat it was sent from: only that chat shows
 * "thinking" and waits, and the answer lands there even if the user has moved
 * on to another chat. Cancelling it (Cancel, closing the chat screen,
 * deleting the chat) leaves a "Cancelled." line, so the question is not left
 * hanging without a reply.
 *
 * When the model re-sends corrected cards, the earlier unsaved ones are
 * replaced (lib/chat `supersededIds`): no Approve, and not sent back as live.
 *
 * ── WHAT IS SENT ─────────────────────────────────────────────────────────
 *
 * Each turn sends the chat so far, any photo still in memory, the whole log
 * (with a short ref per entry so the model can point at one), today's date,
 * and the totals the app computed itself (lib/insights) so the model quotes
 * numbers instead of adding them up. The API key and the model are chosen in
 * Settings (components/AiSection), which also says plainly what is sent; the
 * key itself stays on the phone.
 *
 * The cards, fields and sheets live in components/chat; this file owns the
 * thread, the request and the one place that writes to the log (`approve`).
 */

import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bubble } from '../components/chat/Bubble';
import { History } from '../components/chat/History';
import {
  CameraIcon,
  CloseIcon,
  GalleryIcon,
  HistoryIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
} from '../components/icons';
import { Chip, ConfirmSheet, Tap } from '../components/ui';
import { t, type StringKey } from '../i18n';
import {
  applyChanges,
  chatContext,
  historyText,
  resolveChanges,
  type Proposal,
} from '../lib/assistant';
import {
  appendMessage,
  newChat,
  sortChats,
  supersededIds,
  updateMessage,
  type ChatMessage,
} from '../lib/chat';
import { errorText, sendChat, type ChatResult, type Turn } from '../lib/gemini';
import { newId } from '../lib/id';
import { modelLabel, resolveModel } from '../lib/models';
import { takePhoto, type Photo } from '../services/photo';
import { useChats } from '../state/chats';
import { useSettings } from '../state/settings';
import { useLog } from '../state/store';
import { colors, fonts, radius, spacing, TOUCH } from '../theme';

/** The empty chat's starters: the questions the app has exact answers for. */
const SUGGESTIONS: StringKey[] = ['chat.chip.spent', 'chat.chip.odd', 'chat.chip.refuel'];

/** What the model reads for a user photo turn with no words. */
const PHOTO_PROMPT = 'Read this dashboard photo.';
const PHOTO_GONE = '[A dashboard photo was sent here earlier; it is no longer available.]';

/** One request's context, with the ref maps the answer is read back through. */
type RequestContext = ReturnType<typeof chatContext>;

const haptic = (type: Haptics.NotificationFeedbackType) =>
  Haptics.notificationAsync(type).catch(() => {});

/**
 * The thread as Gemini turns: failed requests left out, replaced cards sent
 * as replaced, photos attached while still in memory.
 */
function toTurns(messages: ChatMessage[], photos: Map<string, Photo>, ctx: RequestContext): Turn[] {
  const replaced = supersededIds(messages);
  return messages
    .filter((m) => !m.error)
    .map((m): Turn => {
      if (m.role === 'model') {
        return {
          role: 'model',
          text: historyText(m.text, m.proposals, ctx.idToRef, m.savedIds, replaced.has(m.id)),
        };
      }
      const photo = photos.get(m.id);
      const stand = m.hasPhoto ? (photo ? PHOTO_PROMPT : PHOTO_GONE) : '';
      return { role: 'user', text: m.text || stand, imageBase64: photo?.base64 };
    });
}

/** The answer as a thread message; changes aimed at entries the log no longer has are dropped. */
function toReply(res: ChatResult, ctx: RequestContext): ChatMessage {
  if (!res.ok) {
    return { id: newId(), role: 'model', text: errorText(res.error), at: Date.now(), error: true };
  }
  const changes = resolveChanges(res.reply.changes, useLog.getState().entries, ctx.refToId);
  return {
    id: newId(),
    role: 'model',
    text: res.reply.reply || (changes.length ? t('chat.checkAndApprove') : ''),
    at: Date.now(),
    ...(changes.length ? { proposals: changes } : {}),
    ...(res.reply.confidence ? { confidence: res.reply.confidence } : {}),
  };
}

export function ChatScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const chats = useChats((s) => s.chats);
  const putChat = useChats((s) => s.put);
  const removeChat = useChats((s) => s.remove);
  const apiKey = useSettings((s) => s.apiKey);
  const model = resolveModel(useSettings((s) => s.geminiModel));

  const [chatId, setChatId] = useState<string | null>(() => sortChats(chats)[0]?.id ?? null);
  const [view, setView] = useState<'thread' | 'history'>('thread');
  const [text, setText] = useState('');
  const [pending, setPending] = useState<Photo | null>(null);
  /** Chats with a request on its way. */
  const [sendingIds, setSendingIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  /** Per message: why Approve could not save, one line per card. */
  const [problems, setProblems] = useState<Record<string, (string | undefined)[]>>({});
  // Photos of this session, by user message id. Never persisted.
  const photos = useRef(new Map<string, Photo>());
  /** The in-flight request of each chat, by chat id. */
  const aborts = useRef(new Map<string, AbortController>());
  // State lags a render; two taps in one frame would both pass it. The ref
  // follows the open chat synchronously, so the second tap finds the first's
  // request even when the first tap is what created the chat.
  const openId = useRef(chatId);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const chat = chats.find((c) => c.id === chatId);
  const sending = chatId !== null && sendingIds.includes(chatId);
  const replaced = supersededIds(chat?.messages ?? []);

  const openChat = (id: string | null) => {
    openId.current = id;
    setChatId(id);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (view === 'history') setView('thread');
      else onClose();
      return true;
    });
    return () => sub.remove();
  }, [view, onClose]);

  useEffect(() => {
    const live = aborts.current;
    return () => live.forEach((ctrl) => ctrl.abort());
  }, []);

  const startNew = () => {
    openChat(null);
    setPending(null);
    setText('');
    setNotice('');
    setView('thread');
  };

  const attach = async (source: 'camera' | 'gallery') => {
    setNotice('');
    try {
      const p = await takePhoto(source);
      if (p === 'denied') setNotice(t('chat.cameraDenied'));
      else if (p) setPending(p);
    } catch {
      setNotice(t('chat.photoFailed'));
    }
  };

  const send = async () => {
    const body = text.trim();
    const open = openId.current;
    if ((!body && !pending) || (open !== null && aborts.current.has(open))) return;
    if (!apiKey) {
      setNotice(t('chat.noKey'));
      return;
    }
    setNotice('');
    const now = Date.now();
    const userMsg: ChatMessage = {
      id: newId(),
      role: 'user',
      text: body,
      at: now,
      ...(pending ? { hasPhoto: true } : {}),
    };
    if (pending) photos.current.set(userMsg.id, pending);
    const existing = useChats.getState().chats.find((x) => x.id === open);
    const c = appendMessage(existing ?? newChat(newId(), now), userMsg);
    const ctrl = new AbortController();
    aborts.current.set(c.id, ctrl);
    putChat(c);
    openChat(c.id);
    setText('');
    setPending(null);
    setSendingIds((ids) => [...ids, c.id]);

    // Refs are handed out for this request only; the answer is read with the same map.
    const ctx = chatContext(useLog.getState().entries, now, useSettings.getState().consumption);
    const res = await sendChat({
      apiKey,
      model,
      turns: toTurns(c.messages, photos.current, ctx),
      context: ctx,
      fetch: (u, i) => fetch(u, i),
      signal: ctrl.signal,
    });
    aborts.current.delete(c.id);
    setSendingIds((ids) => ids.filter((id) => id !== c.id));
    // Deleted while the answer was on its way: the answer goes with it.
    // A cancelled request still gets its line (toReply's error message), so
    // the question does not sit there unanswered.
    const latest = useChats.getState().chats.find((x) => x.id === c.id);
    if (!latest) return;
    putChat(appendMessage(latest, toReply(res, ctx)));
  };

  const currentChat = () => useChats.getState().chats.find((x) => x.id === chatId);

  const editProposals = (messageId: string, proposals: Proposal[]) => {
    const c = currentChat();
    if (c) putChat(updateMessage(c, messageId, { proposals }));
    setProblems((p) => ({ ...p, [messageId]: [] }));
  };

  /**
   * Approve: every card's change into the log at once, or nothing and say why.
   * Replaced cards never save: a later answer holds the same entries corrected.
   */
  const approve = (messageId: string) => {
    const c = currentChat();
    const msg = c?.messages.find((m) => m.id === messageId);
    if (!c || !msg?.proposals?.length || msg.savedIds) return;
    if (supersededIds(c.messages).has(messageId)) return;
    const r = applyChanges(msg.proposals, useLog.getState().entries, Date.now(), newId);
    if (!r.ok) {
      setProblems((p) => ({ ...p, [messageId]: r.problems }));
      haptic(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    const log = useLog.getState();
    r.added.forEach(log.add);
    r.updated.forEach(log.update);
    r.removed.forEach(log.remove);
    putChat(updateMessage(c, messageId, { savedIds: r.ids }));
    haptic(Haptics.NotificationFeedbackType.Success);
  };

  const confirmDelete = () => {
    if (deleting) {
      aborts.current.get(deleting)?.abort();
      removeChat(deleting);
    }
    if (deleting === chatId) openChat(null);
    setDeleting(null);
  };

  const inHistory = view === 'history';

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Tap
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('chat.close')}
            style={styles.iconBtn}
          >
            <CloseIcon />
          </Tap>
          <Text style={styles.title} numberOfLines={1}>
            {inHistory ? t('chat.titleHistory') : (chat?.title ?? t('chat.titleDefault'))}
          </Text>
          <Tap
            onPress={() => setView(inHistory ? 'thread' : 'history')}
            accessibilityRole="button"
            accessibilityLabel={inHistory ? t('chat.backToChat') : t('chat.history')}
            style={styles.iconBtn}
          >
            <HistoryIcon color={inHistory ? colors.accent : colors.text} />
          </Tap>
          <Tap
            onPress={startNew}
            accessibilityRole="button"
            accessibilityLabel={t('chat.new')}
            style={styles.iconBtn}
          >
            <PlusIcon size={20} color={colors.text} />
          </Tap>
        </View>

        <View style={styles.modelRow}>
          <View style={styles.modelPill}>
            <SparklesIcon size={16} color={colors.accent} />
            <Text style={styles.modelText}>{modelLabel(model)}</Text>
          </View>
        </View>

        {inHistory ? (
          <History
            chats={chats}
            current={chatId}
            onOpen={(id) => {
              openChat(id);
              setView('thread');
            }}
            onNew={startNew}
            onDelete={setDeleting}
          />
        ) : (
          <>
            <FlatList
              ref={listRef}
              style={styles.flex}
              data={chat?.messages ?? []}
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.thread}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              ListEmptyComponent={<EmptyChat hasKey={!!apiKey} onSuggest={setText} />}
              renderItem={({ item }) => (
                <Bubble
                  msg={item}
                  photo={photos.current.get(item.id)}
                  problems={problems[item.id]}
                  replaced={replaced.has(item.id)}
                  onEdit={(p) => editProposals(item.id, p)}
                  onApprove={() => approve(item.id)}
                />
              )}
              ListFooterComponent={
                sending && chatId ? (
                  <Thinking onCancel={() => aborts.current.get(chatId)?.abort()} />
                ) : null
              }
            />
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            {pending ? <PendingPhoto photo={pending} onRemove={() => setPending(null)} /> : null}
            <Composer
              text={text}
              onText={setText}
              canSend={!sending && (!!text.trim() || !!pending)}
              bottom={insets.bottom}
              onAttach={attach}
              onSend={send}
            />
          </>
        )}
      </KeyboardAvoidingView>

      <ConfirmSheet
        visible={deleting !== null}
        title={t('chat.deleteTitle')}
        body={t('chat.deleteBody')}
        confirmLabel={t('chat.delete')}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </View>
  );
}

type EmptyChatProps = { hasKey: boolean; onSuggest: (text: string) => void };

function EmptyChat({ hasKey, onSuggest }: EmptyChatProps) {
  return (
    <View style={styles.emptyChat}>
      <View style={styles.emptyBadge}>
        <SparklesIcon size={30} color={colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>{t('chat.emptyTitle')}</Text>
      <Text style={styles.emptyText}>{t('chat.emptyText')}</Text>
      {hasKey ? null : <Text style={styles.noKey}>{t('chat.noKey')}</Text>}
      <Text style={styles.suggestLabel}>{t('chat.chips.label')}</Text>
      <View style={styles.suggestions}>
        {SUGGESTIONS.map((k) => (
          <Chip key={k} label={t(k)} onPress={() => onSuggest(t(k))} />
        ))}
      </View>
    </View>
  );
}

function Thinking({ onCancel }: { onCancel: () => void }) {
  return (
    <View style={styles.typing}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.typingText}>{t('chat.thinking')}</Text>
      <Tap onPress={onCancel} accessibilityRole="button" style={styles.cancel}>
        <Text style={styles.cancelText}>{t('common.cancel')}</Text>
      </Tap>
    </View>
  );
}

function PendingPhoto({ photo, onRemove }: { photo: Photo; onRemove: () => void }) {
  return (
    <View style={styles.pending}>
      <Image source={{ uri: photo.uri }} style={styles.pendingImg} />
      <Text style={styles.pendingText}>{t('chat.photoReady')}</Text>
      <Tap
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={t('chat.removePhoto')}
        style={styles.iconBtn}
      >
        <CloseIcon size={14} color={colors.muted} />
      </Tap>
    </View>
  );
}

type ComposerProps = {
  text: string;
  onText: (v: string) => void;
  canSend: boolean;
  bottom: number;
  onAttach: (source: 'camera' | 'gallery') => void;
  onSend: () => void;
};

function Composer({ text, onText, canSend, bottom, onAttach, onSend }: ComposerProps) {
  return (
    <View style={[styles.composer, { paddingBottom: bottom + spacing.sm }]}>
      <Tap
        onPress={() => onAttach('camera')}
        accessibilityRole="button"
        accessibilityLabel={t('chat.takePhoto')}
        style={styles.iconBtn}
      >
        <CameraIcon color={colors.accent} />
      </Tap>
      <Tap
        onPress={() => onAttach('gallery')}
        accessibilityRole="button"
        accessibilityLabel={t('chat.pickPhoto')}
        style={styles.iconBtn}
      >
        <GalleryIcon color={colors.accent} />
      </Tap>
      <TextInput
        value={text}
        onChangeText={onText}
        placeholder={t('chat.message')}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        multiline
        style={styles.input}
        accessibilityLabel={t('chat.message')}
      />
      <Tap
        onPress={onSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel={t('chat.send')}
        style={styles.send}
      >
        <SendIcon />
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  iconBtn: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  modelRow: { alignItems: 'center', paddingBottom: spacing.sm },
  modelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelText: { color: colors.text, fontFamily: fonts.ui, fontSize: 14, fontWeight: '600' },
  thread: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  emptyBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  noKey: {
    color: colors.accent,
    fontFamily: fonts.ui,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center',
  },
  suggestLabel: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  typing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  typingText: { flex: 1, color: colors.muted, fontFamily: fonts.ui, fontSize: 14 },
  cancel: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md },
  cancelText: { color: colors.danger, fontFamily: fonts.ui, fontSize: 14, fontWeight: '700' },
  notice: {
    color: colors.danger,
    fontFamily: fonts.ui,
    fontSize: 13,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingImg: { width: 48, height: 48, borderRadius: radius.sm },
  pendingText: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 14 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    minHeight: TOUCH,
    maxHeight: 120,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  send: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: TOUCH / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
