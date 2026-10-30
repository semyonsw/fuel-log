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
 * Chats are kept (text and readings; photos never) and listed newest first;
 * "+" starts a fresh one. A photo stays in memory while its chat is open so
 * follow-up corrections can still refer to it.
 *
 * ── WHAT IS SENT ─────────────────────────────────────────────────────────
 *
 * Each turn sends the chat so far, any photo still in memory, the log (with a
 * short ref per entry so the model can point at one), today's date, and the
 * totals the app computed itself (lib/insights) so the model quotes numbers
 * instead of adding them up. The first time, the key prompt says so plainly;
 * the key itself stays on the phone.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
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

import {
  CameraIcon,
  CloseIcon,
  GalleryIcon,
  HistoryIcon,
  KeyIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  TrashIcon,
  ChevronIcon,
} from '../components/icons';
import * as Haptics from 'expo-haptics';

import { Button, Chip, ConfirmSheet, Sheet, Tap } from '../components/ui';
import {
  appendMessage,
  newChat,
  sortChats,
  updateMessage,
  type Chat,
  type ChatMessage,
} from '../lib/chat';
import {
  applyChanges,
  changedFields,
  chatContext,
  historyText,
  MAX_LITERS,
  MAX_ODOMETER_KM,
  MAX_PRICE_AMD,
  MAX_RANGE_KM,
  MAX_REMIND_KM,
  MAX_REMIND_MONTHS,
  MAX_TRIP_KM,
  nudge,
  parseClock,
  parseDate,
  resolveChanges,
  type Proposal,
  type ProposalValues,
} from '../lib/assistant';
import {
  EXPENSE_CATEGORIES,
  expenseLabel,
  SERVICE_CATEGORIES,
  serviceLabel,
} from '../lib/categories';
import { formKinds } from '../lib/draft';
import { dayKey, dayLabel, formatTime } from '../lib/entries';
import { errorText, listModels, sendChat, type Turn } from '../lib/gemini';
import { newId } from '../lib/id';
import {
  availableModels,
  GEMINI_MODELS,
  modelLabel,
  resolveModel,
  type GeminiModel,
} from '../lib/models';
import { formatAmd, parseNumber } from '../lib/numbers';
import { FUEL_GRADES, gradeLabel } from '../lib/stations';
import { takePhoto, type Photo } from '../services/photo';
import { saveApiKey } from '../services/secrets';
import { plural, t, type StringKey } from '../i18n';
import { useChats } from '../state/chats';
import { useSettings } from '../state/settings';
import { useLog } from '../state/store';
import { colors, fonts, radius, spacing, TOUCH } from '../theme';
import type { EntryKind, ExpenseCategory, ServiceCategory } from '../types';

/** Functions, not tables, so the words follow the language at render time. */
const KIND_KEYS: Record<EntryKind, StringKey> = {
  reading: 'chat.kind.reading',
  trip: 'chat.kind.trip',
  refuel: 'chat.kind.refuel',
  service: 'kinds.service',
  expense: 'kinds.expense',
};
const kindTitle = (kind: EntryKind): string => t(KIND_KEYS[kind]);

const KIND_CHIPS: { value: EntryKind; key: StringKey }[] = [
  { value: 'trip', key: 'chat.seg.trip' },
  { value: 'reading', key: 'chat.seg.reading' },
  { value: 'refuel', key: 'chat.seg.refuel' },
  { value: 'service', key: 'kinds.service' },
  { value: 'expense', key: 'kinds.expense' },
];

/** The empty chat's starters: the questions the app now has exact answers for. */
const SUGGESTIONS: StringKey[] = [
  'insights.chip.spent',
  'insights.chip.odd',
  'insights.chip.refuel',
];

export function ChatScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const chats = useChats((s) => s.chats);
  const putChat = useChats((s) => s.put);
  const removeChat = useChats((s) => s.remove);
  const addEntry = useLog((s) => s.add);
  const updateEntry = useLog((s) => s.update);
  const removeEntry = useLog((s) => s.remove);
  /** Per message: why Approve could not save, one line per card. */
  const [problems, setProblems] = useState<Record<string, (string | undefined)[]>>({});
  const apiKey = useSettings((s) => s.apiKey);
  const model = resolveModel(useSettings((s) => s.geminiModel));

  const [chatId, setChatId] = useState<string | null>(() => sortChats(chats)[0]?.id ?? null);
  const [view, setView] = useState<'thread' | 'history'>('thread');
  const [text, setText] = useState('');
  const [pending, setPending] = useState<Photo | null>(null);
  const [sending, setSending] = useState(false);
  const [modelSheet, setModelSheet] = useState(false);
  const [keySheet, setKeySheet] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  // Photos of this session, by user message id. Never persisted.
  const photos = useRef(new Map<string, Photo>());
  const abort = useRef<AbortController | null>(null);
  // `sending` is state and lags a render; two taps in one frame would both pass it.
  const inFlight = useRef(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const chat = chats.find((c) => c.id === chatId);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (view === 'history') setView('thread');
      else onClose();
      return true;
    });
    return () => sub.remove();
  }, [view, onClose]);

  useEffect(() => () => abort.current?.abort(), []);

  const startNew = () => {
    abort.current?.abort();
    setChatId(null);
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
    if ((!body && !pending) || sending || inFlight.current) return;
    if (!apiKey) {
      setKeySheet(true);
      return;
    }
    const now = Date.now();
    let c: Chat = chat ?? newChat(newId(), now);
    const userMsg: ChatMessage = {
      id: newId(),
      role: 'user',
      text: body,
      at: now,
      ...(pending ? { hasPhoto: true } : {}),
    };
    if (pending) photos.current.set(userMsg.id, pending);
    c = appendMessage(c, userMsg);
    putChat(c);
    setChatId(c.id);
    setText('');
    setPending(null);
    setSending(true);
    inFlight.current = true;

    // Refs are handed out for this request only; the answer is read with the same map.
    const ctx = chatContext(useLog.getState().entries, now, useSettings.getState().consumption);
    const turns: Turn[] = c.messages
      .filter((m) => !m.error)
      .map((m) =>
        m.role === 'user'
          ? {
              role: 'user',
              text:
                m.text ||
                (m.hasPhoto
                  ? photos.current.has(m.id)
                    ? 'Read this dashboard photo.'
                    : '[A dashboard photo was sent here earlier; it is no longer available.]'
                  : ''),
              imageBase64: photos.current.get(m.id)?.base64,
            }
          : { role: 'model', text: historyText(m.text, m.proposals, ctx.idToRef, m.savedIds) },
      );

    const ctrl = new AbortController();
    abort.current = ctrl;
    const res = await sendChat({
      apiKey,
      model,
      turns,
      context: ctx,
      fetch: (u, i) => fetch(u, i),
      signal: ctrl.signal,
    });
    abort.current = null;
    inFlight.current = false;
    setSending(false);
    if (!res.ok && res.error === 'cancelled') return;
    // Deleted while the answer was on its way: the answer goes with it.
    const latest = useChats.getState().chats.find((x) => x.id === c.id);
    if (!latest) return;
    // Changes aimed at an entry the log does not have are dropped here.
    const changes = res.ok
      ? resolveChanges(res.reply.changes, useLog.getState().entries, ctx.refToId)
      : [];
    const reply: ChatMessage = res.ok
      ? {
          id: newId(),
          role: 'model',
          text: res.reply.reply || (changes.length ? t('chat.checkAndApprove') : ''),
          at: Date.now(),
          ...(changes.length ? { proposals: changes } : {}),
          ...(res.reply.confidence ? { confidence: res.reply.confidence } : {}),
        }
      : { id: newId(), role: 'model', text: errorText(res.error), at: Date.now(), error: true };
    putChat(appendMessage(latest, reply));
    if (!res.ok && res.error === 'bad-key') setKeySheet(true);
  };

  const currentChat = () => useChats.getState().chats.find((x) => x.id === chatId);

  const editProposals = (messageId: string, proposals: Proposal[]) => {
    const c = currentChat();
    if (c) putChat(updateMessage(c, messageId, { proposals }));
    setProblems((p) => ({ ...p, [messageId]: [] }));
  };

  /** Approve: every card's change into the log at once, or nothing and say why. */
  const approve = (messageId: string) => {
    const c = currentChat();
    const msg = c?.messages.find((m) => m.id === messageId);
    if (!c || !msg?.proposals?.length || msg.savedIds) return;
    const r = applyChanges(msg.proposals, useLog.getState().entries, Date.now(), newId);
    if (!r.ok) {
      setProblems((p) => ({ ...p, [messageId]: r.problems }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    r.added.forEach(addEntry);
    r.updated.forEach(updateEntry);
    r.removed.forEach(removeEntry);
    putChat(updateMessage(c, messageId, { savedIds: r.ids }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

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
            {view === 'history' ? t('chat.titleHistory') : (chat?.title ?? t('chat.titleDefault'))}
          </Text>
          <Tap
            onPress={() => setView(view === 'history' ? 'thread' : 'history')}
            accessibilityRole="button"
            accessibilityLabel={view === 'history' ? t('chat.backToChat') : t('chat.history')}
            style={styles.iconBtn}
          >
            <HistoryIcon color={view === 'history' ? colors.accent : colors.text} />
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
          <Tap
            onPress={() => setModelSheet(true)}
            accessibilityRole="button"
            accessibilityLabel={t('chat.modelA11y', { model: modelLabel(model) })}
            style={styles.modelPill}
          >
            <SparklesIcon size={16} color={colors.accent} />
            <Text style={styles.modelText}>{modelLabel(model)}</Text>
            <ChevronIcon down color={colors.muted} size={14} />
          </Tap>
        </View>

        {view === 'history' ? (
          <History
            chats={chats}
            current={chatId}
            onOpen={(id) => {
              setChatId(id);
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
              ListEmptyComponent={
                <View style={styles.emptyChat}>
                  <View style={styles.emptyBadge}>
                    <SparklesIcon size={30} color={colors.accent} />
                  </View>
                  <Text style={styles.emptyTitle}>{t('chat.emptyTitle')}</Text>
                  <Text style={styles.emptyText}>{t('chat.emptyText')}</Text>
                  {!apiKey ? (
                    <Button label={t('chat.addGeminiKey')} onPress={() => setKeySheet(true)} />
                  ) : null}
                  <Text style={styles.suggestLabel}>{t('insights.chips.label')}</Text>
                  <View style={styles.suggestions}>
                    {SUGGESTIONS.map((k) => (
                      <Chip key={k} label={t(k)} onPress={() => setText(t(k))} />
                    ))}
                  </View>
                </View>
              }
              renderItem={({ item }) => (
                <Bubble
                  msg={item}
                  photo={photos.current.get(item.id)}
                  problems={problems[item.id]}
                  onEdit={(p) => editProposals(item.id, p)}
                  onApprove={() => approve(item.id)}
                />
              )}
              ListFooterComponent={
                sending ? (
                  <View style={styles.typing}>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={styles.typingText}>{t('chat.thinking')}</Text>
                    <Tap
                      onPress={() => abort.current?.abort()}
                      accessibilityRole="button"
                      style={styles.cancel}
                    >
                      <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                    </Tap>
                  </View>
                ) : null
              }
            />

            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            {pending ? (
              <View style={styles.pending}>
                <Image source={{ uri: pending.uri }} style={styles.pendingImg} />
                <Text style={styles.pendingText}>{t('chat.photoReady')}</Text>
                <Tap
                  onPress={() => setPending(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.removePhoto')}
                  style={styles.iconBtn}
                >
                  <CloseIcon size={14} color={colors.muted} />
                </Tap>
              </View>
            ) : null}
            <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
              <Tap
                onPress={() => attach('camera')}
                accessibilityRole="button"
                accessibilityLabel={t('chat.takePhoto')}
                style={styles.iconBtn}
              >
                <CameraIcon color={colors.accent} />
              </Tap>
              <Tap
                onPress={() => attach('gallery')}
                accessibilityRole="button"
                accessibilityLabel={t('chat.pickPhoto')}
                style={styles.iconBtn}
              >
                <GalleryIcon color={colors.accent} />
              </Tap>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={t('chat.message')}
                placeholderTextColor={colors.muted}
                selectionColor={colors.accent}
                cursorColor={colors.accent}
                multiline
                style={styles.input}
                accessibilityLabel={t('chat.message')}
              />
              <Tap
                onPress={send}
                disabled={sending || (!text.trim() && !pending)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.send')}
                style={styles.send}
              >
                <SendIcon />
              </Tap>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      <ModelSheet
        visible={modelSheet}
        onClose={() => setModelSheet(false)}
        onKey={() => {
          setModelSheet(false);
          setKeySheet(true);
        }}
      />
      <KeySheet visible={keySheet} onClose={() => setKeySheet(false)} />
      <ConfirmSheet
        visible={deleting !== null}
        title={t('chat.deleteTitle')}
        body={t('chat.deleteBody')}
        confirmLabel={t('chat.delete')}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) removeChat(deleting);
          if (deleting === chatId) setChatId(null);
          setDeleting(null);
        }}
      />
    </View>
  );
}

function Bubble({
  msg,
  photo,
  problems,
  onEdit,
  onApprove,
}: {
  msg: ChatMessage;
  photo?: Photo;
  problems?: (string | undefined)[];
  onEdit: (p: Proposal[]) => void;
  onApprove: () => void;
}) {
  const mine = msg.role === 'user';
  return (
    <View style={[styles.msg, mine ? styles.msgMine : styles.msgTheirs]}>
      <View
        style={[
          styles.bubble,
          mine ? styles.bubbleMine : styles.bubbleTheirs,
          msg.error && styles.bubbleError,
        ]}
      >
        {msg.hasPhoto ? (
          photo ? (
            <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" />
          ) : (
            <Text style={styles.photoGone}>{t('chat.photoGone')}</Text>
          )
        ) : null}
        {msg.text ? (
          <Text style={[styles.msgText, msg.error && { color: colors.danger }]}>{msg.text}</Text>
        ) : null}
        <Text style={styles.msgTime}>{formatTime(msg.at)}</Text>
      </View>
      {msg.proposals?.length ? (
        <Proposals
          proposals={msg.proposals}
          saved={!!msg.savedIds}
          lowConfidence={msg.confidence === 'low'}
          problems={problems}
          onChange={onEdit}
          onApprove={onApprove}
        />
      ) : null}
    </View>
  );
}

/** What the card's button and footer say, from the mix of changes it holds. */
function cardWords(proposals: Proposal[]) {
  const n = proposals.length;
  const allDelete = proposals.every((p) => p.op === 'delete');
  const anyEdit = proposals.some((p) => p.op !== 'add');
  if (allDelete) {
    return {
      approve: n > 1 ? plural('insights.deleteN', n) : t('insights.delete'),
      saved: t('insights.deleted'),
      foot: t('insights.deleteFoot'),
      danger: true,
    };
  }
  if (anyEdit) {
    return {
      approve: n > 1 ? plural('insights.applyN', n) : t('insights.apply'),
      saved: n > 1 ? plural('insights.savedChanges', n) : t('insights.updated'),
      foot: t('insights.updateFoot'),
      danger: false,
    };
  }
  return {
    approve: n > 1 ? plural('chat.approveN', n) : t('chat.approve'),
    saved: n > 1 ? plural('chat.savedN', n) : t('chat.saved'),
    foot: t('chat.approveFoot'),
    danger: false,
  };
}

/**
 * The changes an answer proposes, each as an editable card, and one Approve
 * for all of them. A delete card is read-only: what it shows is what goes.
 * After saving, the cards stay as a read-only record.
 */
function Proposals({
  proposals,
  saved,
  lowConfidence,
  problems,
  onChange,
  onApprove,
}: {
  proposals: Proposal[];
  saved: boolean;
  lowConfidence: boolean;
  problems?: (string | undefined)[];
  onChange: (p: Proposal[]) => void;
  onApprove: () => void;
}) {
  const edit = (i: number, patch: Partial<Proposal>) =>
    onChange(proposals.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const remove = (i: number) => onChange(proposals.filter((_, j) => j !== i));
  const words = cardWords(proposals);
  const hasDelete = proposals.some((p) => p.op === 'delete');

  return (
    <View style={[styles.card, hasDelete && styles.cardDanger, saved && styles.cardSaved]}>
      {lowConfidence && !saved ? (
        <Text style={styles.cardWarn}>{t('chat.lowConfidence')}</Text>
      ) : null}
      {proposals.map((p, i) => {
        // An edit may switch only as far as the form could (trip ↔ reading).
        const kinds =
          p.op === 'add'
            ? KIND_CHIPS
            : p.op === 'update'
              ? KIND_CHIPS.filter((k) => formKinds(p.before?.kind ?? p.kind).includes(k.value))
              : [];
        const title =
          p.op === 'add'
            ? kindTitle(p.kind)
            : `${t(p.op === 'update' ? 'insights.op.update' : 'insights.op.delete')} · ${kindTitle(p.kind)}`;
        return (
          <View key={i} style={[styles.prop, i > 0 && styles.propDivider]}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, p.op === 'delete' && { color: colors.danger }]}>
                {proposals.length > 1 ? `${i + 1}. ` : ''}
                {title}
              </Text>
              {!saved && proposals.length > 1 ? (
                <Tap
                  onPress={() => remove(i)}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.removeKindA11y', { kind: title })}
                  hitSlop={10}
                >
                  <Text style={styles.removeText}>{t('chat.remove')}</Text>
                </Tap>
              ) : null}
            </View>
            {!saved && kinds.length > 1 ? (
              <View style={styles.grades}>
                {kinds.map((k) => (
                  <Chip
                    key={k.value}
                    label={t(k.key)}
                    active={p.kind === k.value}
                    // Service and expense categories are different lists; a switch starts over.
                    onPress={() => p.kind !== k.value && edit(i, { kind: k.value, category: null })}
                  />
                ))}
              </View>
            ) : null}
            <ProposalFields
              p={p}
              locked={saved || p.op === 'delete'}
              onEdit={(patch) => edit(i, patch)}
            />
            {problems?.[i] ? <Text style={styles.problem}>{problems[i]}</Text> : null}
          </View>
        );
      })}
      {saved ? (
        <Text style={styles.savedText}>{words.saved}</Text>
      ) : (
        <>
          <Button
            label={words.approve}
            variant={words.danger ? 'danger' : 'primary'}
            onPress={onApprove}
          />
          <Text style={styles.cardFoot}>{words.foot}</Text>
        </>
      )}
    </View>
  );
}

const blank = (v: unknown) => v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** One card value as text, for the old → new line. */
function shown(k: keyof ProposalValues, v: ProposalValues[keyof ProposalValues], kind: EntryKind) {
  if (blank(v)) return '—';
  if (k === 'stops' && Array.isArray(v)) return v.join(' → ');
  if (k === 'kind') return kindTitle(v as EntryKind);
  if (k === 'grade') return gradeLabel(v as NonNullable<ProposalValues['grade']>);
  if (k === 'category') {
    return kind === 'service'
      ? serviceLabel(v as ServiceCategory)
      : expenseLabel(v as ExpenseCategory);
  }
  return String(v);
}

function ProposalFields({
  p,
  locked,
  onEdit,
}: {
  p: Proposal;
  locked: boolean;
  onEdit: (patch: Partial<Proposal>) => void;
}) {
  const changed = new Set(changedFields(p));
  /** "20 → 30" under a field an edit card changes; nothing otherwise. */
  const was = (k: keyof ProposalValues) =>
    p.before && changed.has(k)
      ? t('insights.change', {
          old: shown(k, p.before[k], p.before.kind),
          new: shown(k, p[k], p.kind),
        })
      : undefined;
  const range = (label: string) => (
    <NumberRow
      label={label}
      unit={t('chat.unit.km')}
      value={p.rangeKm}
      max={MAX_RANGE_KM}
      locked={locked}
      was={was('rangeKm')}
      onChange={(rangeKm) => onEdit({ rangeKm })}
    />
  );
  const odometer = (
    <NumberRow
      label={t('kinds.field.odometer')}
      unit={t('chat.unit.km')}
      value={p.odometerKm}
      max={MAX_ODOMETER_KM}
      steps={[100, 1]}
      whole
      locked={locked}
      was={was('odometerKm')}
      onChange={(odometerKm) => onEdit({ odometerKm })}
    />
  );
  const money = (label: string) => (
    <NumberRow
      label={label}
      unit="AMD"
      value={p.priceAmd}
      max={MAX_PRICE_AMD}
      steps={[1000, 100]}
      whole
      locked={locked}
      was={was('priceAmd')}
      onChange={(priceAmd) => onEdit({ priceAmd })}
    />
  );
  const categories =
    p.kind === 'service'
      ? SERVICE_CATEGORIES.map((c) => ({ value: c, label: serviceLabel(c) }))
      : EXPENSE_CATEGORIES.map((c) => ({ value: c, label: expenseLabel(c) }));
  const categoryRow = (
    <View style={styles.fieldBlock}>
      <Text style={styles.numLabel}>{t('kinds.field.category')}</Text>
      <View style={styles.grades}>
        {categories.map((c) => (
          <Chip
            key={c.value}
            label={c.label}
            active={p.category === c.value}
            onPress={() => !locked && onEdit({ category: c.value })}
          />
        ))}
      </View>
      <Was text={was('category')} />
    </View>
  );

  return (
    <>
      <Was text={was('kind')} />
      {p.kind === 'trip' ? (
        <>
          <TextRow
            label={t('chat.field.from')}
            value={p.from}
            locked={locked}
            was={was('from')}
            onChange={(from) => onEdit({ from })}
          />
          {p.stops.length ? (
            <Text style={styles.cardNote}>
              {t('chat.field.via', { stops: p.stops.join(' → ') })}
            </Text>
          ) : null}
          <Was text={was('stops')} />
          <TextRow
            label={t('chat.field.to')}
            value={p.to}
            locked={locked}
            was={was('to')}
            onChange={(to) => onEdit({ to })}
          />
          <NumberRow
            label={t('chat.field.distance')}
            unit={t('chat.unit.km')}
            value={p.distanceKm}
            max={MAX_TRIP_KM}
            locked={locked}
            was={was('distanceKm')}
            onChange={(distanceKm) => onEdit({ distanceKm })}
          />
          {range(t('chat.field.rangeLeft'))}
        </>
      ) : p.kind === 'reading' ? (
        range(t('chat.field.rangeLeft'))
      ) : p.kind === 'refuel' ? (
        <>
          <NumberRow
            label={t('chat.field.liters')}
            unit={t('chat.unit.l')}
            value={p.liters}
            max={MAX_LITERS}
            locked={locked}
            was={was('liters')}
            onChange={(liters) => onEdit({ liters })}
          />
          {money(t('chat.field.totalPaid'))}
          {p.liters && p.priceAmd ? (
            <Text style={styles.cardNote}>
              {t('chat.field.perLiter', { price: formatAmd(p.priceAmd / p.liters) })}
            </Text>
          ) : null}
          {range(t('chat.field.rangeAfter'))}
          <TextRow
            label={t('chat.field.station')}
            value={p.station}
            locked={locked}
            was={was('station')}
            onChange={(station) => onEdit({ station })}
          />
          <TextRow
            label={t('chat.field.address')}
            value={p.address}
            locked={locked}
            was={was('address')}
            onChange={(address) => onEdit({ address })}
          />
          <View style={styles.grades}>
            {FUEL_GRADES.map((g) => (
              <Chip
                key={g.value}
                label={g.label}
                active={p.grade === g.value}
                onPress={() => !locked && onEdit({ grade: p.grade === g.value ? null : g.value })}
              />
            ))}
          </View>
          <Was text={was('grade')} />
          {odometer}
        </>
      ) : p.kind === 'service' ? (
        <>
          {categoryRow}
          {money(t('kinds.field.cost'))}
          {odometer}
          <TextRow
            label={t('kinds.field.place')}
            value={p.place}
            locked={locked}
            was={was('place')}
            onChange={(place) => onEdit({ place })}
          />
          <NumberRow
            label={t('kinds.field.remindKm')}
            unit={t('chat.unit.km')}
            value={p.remindKm}
            max={MAX_REMIND_KM}
            steps={[1000, 100]}
            whole
            locked={locked}
            was={was('remindKm')}
            onChange={(remindKm) => onEdit({ remindKm })}
          />
          <NumberRow
            label={t('kinds.field.remindMonths')}
            unit=""
            value={p.remindMonths}
            max={MAX_REMIND_MONTHS}
            steps={[6, 1]}
            whole
            locked={locked}
            was={was('remindMonths')}
            onChange={(remindMonths) => onEdit({ remindMonths })}
          />
          {/* A service may carry a range (it is saved); shown only when there is one. */}
          {p.rangeKm !== null ? range(t('chat.field.rangeLeft')) : null}
        </>
      ) : (
        <>
          {categoryRow}
          {money(t('kinds.field.amount'))}
        </>
      )}
      <DateRow
        value={p.date}
        locked={locked}
        was={was('date')}
        onChange={(date) => onEdit({ date })}
      />
      <ClockRow
        value={p.clock}
        locked={locked}
        was={was('clock')}
        onChange={(clock) => onEdit({ clock })}
      />
      <TextRow
        label={t('insights.field.note')}
        value={p.note}
        locked={locked}
        was={was('note')}
        onChange={(note) => onEdit({ note })}
      />
    </>
  );
}

/** The old → new line under a field an edit changes. */
function Was({ text }: { text?: string }) {
  return text ? <Text style={styles.was}>{text}</Text> : null;
}

function TextRow({
  label,
  value,
  locked,
  was,
  onChange,
}: {
  label: string;
  value: string;
  locked: boolean;
  was?: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.numRow}>
        <Text style={styles.numLabel}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          editable={!locked}
          placeholder="—"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={label}
          style={styles.textInput}
        />
      </View>
      <Was text={was} />
    </View>
  );
}

/** A day as YYYY-MM-DD. A future day is marked here and refused by Approve. */
function DateRow({
  value,
  locked,
  was,
  onChange,
}: {
  value: string | null;
  locked: boolean;
  was?: string;
  onChange: (v: string | null) => void;
}) {
  const [raw, setRaw] = useState(value ?? '');
  // Follow outside changes (a correction from the chat) without fighting the typing.
  useEffect(() => {
    if (parseDate(raw) !== value) setRaw(value ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const parsed = parseDate(raw);
  const bad = raw.trim() !== '' && (parsed === null || parsed > dayKey(Date.now()));
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.numRow}>
        <Text style={styles.numLabel}>{t('insights.field.date')}</Text>
        <TextInput
          value={raw}
          onChangeText={(v) => {
            setRaw(v);
            if (v.trim() === '') onChange(null);
            else if (parseDate(v)) onChange(parseDate(v));
          }}
          editable={!locked}
          placeholder={t('insights.field.dateToday')}
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          selectionColor={colors.accent}
          accessibilityLabel={t('insights.field.dateA11y')}
          style={[styles.numInput, styles.dateInput, bad && styles.numInputBad]}
        />
      </View>
      <Was text={was} />
    </View>
  );
}

function ClockRow({
  value,
  locked,
  was,
  onChange,
}: {
  value: string | null;
  locked: boolean;
  was?: string;
  onChange: (v: string | null) => void;
}) {
  const [raw, setRaw] = useState(value ?? '');
  // Follow outside changes (a correction from the chat) without fighting the typing.
  useEffect(() => {
    if (parseClock(raw) !== value) setRaw(value ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const bad = raw.trim() !== '' && parseClock(raw) === null;
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.numRow}>
        <Text style={styles.numLabel}>{t('chat.field.time')}</Text>
        <TextInput
          value={raw}
          onChangeText={(v) => {
            setRaw(v);
            if (v.trim() === '') onChange(null);
            else if (parseClock(v)) onChange(parseClock(v));
          }}
          editable={!locked}
          placeholder={t('chat.field.timeNow')}
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          selectionColor={colors.accent}
          accessibilityLabel={t('chat.field.timeA11y')}
          style={[styles.numInput, styles.timeInput, bad && styles.numInputBad]}
        />
      </View>
      <Was text={was} />
    </View>
  );
}

function NumberRow({
  label,
  unit,
  value,
  max,
  steps = [1, 0.1],
  whole = false,
  locked,
  was,
  onChange,
}: {
  label: string;
  unit: string;
  value: number | null;
  max: number;
  /** Big step, small step. Money steps in hundreds; dram has no decimals. */
  steps?: [number, number];
  whole?: boolean;
  locked: boolean;
  was?: string;
  onChange: (v: number | null) => void;
}) {
  const [raw, setRaw] = useState(value === null ? '' : String(value));
  // Follow outside changes (± buttons, a correction) but never rewrite what is
  // being typed: "15." parses to 15, and replacing it would eat the dot.
  useEffect(() => {
    const typed = parseNumber(raw);
    if ((typed ?? null) !== value) setRaw(value === null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const parsed = parseNumber(raw);
  const bad = raw.trim() !== '' && (parsed === undefined || parsed > max);
  const clean = (n: number) => (whole ? Math.round(n) : Math.round(n * 10) / 10);

  const btn = (d: number) => {
    const l = `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
    return (
      <Tap
        onPress={() => onChange(clean(nudge(value, d, max)))}
        disabled={locked}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${l}`}
        style={styles.nudge}
      >
        <Text style={styles.nudgeText}>{l}</Text>
      </Tap>
    );
  };

  return (
    <View style={styles.numBlock}>
      <Text style={styles.numLabel}>{label}</Text>
      <View style={styles.numControls}>
        {locked ? null : btn(-steps[0])}
        {locked ? null : btn(-steps[1])}
        <View style={[styles.numBox, bad && styles.numInputBad]}>
          <TextInput
            value={raw}
            onChangeText={(v) => {
              setRaw(v);
              const n = parseNumber(v);
              if (v.trim() === '') onChange(null);
              else if (n !== undefined && n <= max) onChange(clean(n));
            }}
            editable={!locked}
            placeholder="—"
            placeholderTextColor={colors.muted}
            keyboardType={whole ? 'number-pad' : 'decimal-pad'}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            accessibilityLabel={`${label}, ${unit}`}
            style={styles.numInput}
          />
          <Text style={styles.numUnit}>{unit}</Text>
        </View>
        {locked ? null : btn(steps[1])}
        {locked ? null : btn(steps[0])}
      </View>
      <Was text={was} />
    </View>
  );
}

function History({
  chats,
  current,
  onOpen,
  onNew,
  onDelete,
}: {
  chats: Chat[];
  current: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const sorted = useMemo(() => sortChats(chats), [chats]);
  return (
    <FlatList
      style={styles.flex}
      data={sorted}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.historyList}
      ListHeaderComponent={
        <Tap onPress={onNew} accessibilityRole="button" style={styles.newChat}>
          <PlusIcon size={18} color={colors.accent} />
          <Text style={styles.newChatText}>{t('chat.new')}</Text>
        </Tap>
      }
      ListEmptyComponent={<Text style={styles.emptyText}>{t('chat.noChats')}</Text>}
      renderItem={({ item }) => (
        <Tap
          onPress={() => onOpen(item.id)}
          accessibilityRole="button"
          style={[styles.historyRow, item.id === current && styles.historyRowOn]}
        >
          <View style={styles.flex}>
            <Text style={styles.historyTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.historyMeta}>
              {dayLabel(dayKey(item.updatedAt), Date.now())} {formatTime(item.updatedAt)} ·{' '}
              {plural('chat.messages', item.messages.length)}
            </Text>
          </View>
          <Tap
            onPress={() => onDelete(item.id)}
            accessibilityRole="button"
            accessibilityLabel={t('chat.deleteChatA11y', { title: item.title })}
            style={styles.iconBtn}
          >
            <TrashIcon size={20} color={colors.muted} />
          </Tap>
        </Tap>
      )}
    />
  );
}

function ModelSheet({
  visible,
  onClose,
  onKey,
}: {
  visible: boolean;
  onClose: () => void;
  onKey: () => void;
}) {
  const apiKey = useSettings((s) => s.apiKey);
  const current = resolveModel(useSettings((s) => s.geminiModel));
  const set = useSettings((s) => s.set);
  const [models, setModels] = useState<GeminiModel[]>(GEMINI_MODELS);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!visible || !apiKey) return;
    let live = true;
    setChecking(true);
    listModels(apiKey, (u, i) => fetch(u, i)).then((listed) => {
      if (!live) return;
      setModels(availableModels(listed));
      setChecking(false);
    });
    return () => {
      live = false;
    };
  }, [visible, apiKey]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>{t('chat.modelTitle')}</Text>
      <Text style={styles.sheetBody}>
        {checking ? t('chat.modelChecking') : t('chat.modelIntro')}
      </Text>
      {models.map((m) => {
        const on = m.id === current;
        return (
          <Tap
            key={m.id}
            onPress={() => {
              set({ geminiModel: m.id });
              onClose();
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.modelOpt, on && styles.modelOptOn]}
          >
            <View style={[styles.radio, on && styles.radioOn]}>
              {on ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={styles.flex}>
              <Text style={[styles.modelOptTitle, on && { color: colors.accent }]}>{m.label}</Text>
              <Text style={styles.modelOptNote}>
                {m.note} · {m.id}
              </Text>
            </View>
          </Tap>
        );
      })}
      <Tap onPress={onKey} accessibilityRole="button" style={styles.keyRow}>
        <KeyIcon size={20} color={colors.accent} />
        <Text style={styles.keyRowText}>{apiKey ? t('chat.changeKey') : t('chat.addKey')}</Text>
      </Tap>
    </Sheet>
  );
}

function KeySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const apiKey = useSettings((s) => s.apiKey);
  const [value, setValue] = useState(apiKey);
  useEffect(() => {
    if (visible) setValue(apiKey);
  }, [visible, apiKey]);
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>{t('chat.keyTitle')}</Text>
      <Text style={styles.sheetBody}>{t('chat.keyBody')}</Text>
      <Text style={styles.privacy}>{t('chat.keyPrivacy')}</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="AIza…"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        selectionColor={colors.accent}
        accessibilityLabel={t('chat.keyTitle')}
        style={styles.keyInput}
      />
      <View style={styles.sheetActions}>
        <View style={styles.flex}>
          <Button label={t('common.cancel')} variant="ghost" onPress={onClose} />
        </View>
        <View style={styles.flex}>
          <Button
            label={t('chat.saveKey')}
            dim={!value.trim()}
            onPress={() => {
              if (!value.trim()) return;
              void saveApiKey(value);
              onClose();
            }}
          />
        </View>
      </View>
    </Sheet>
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
  msg: { gap: spacing.sm },
  msgMine: { alignItems: 'flex-end' },
  msgTheirs: { alignItems: 'flex-start' },
  bubble: { maxWidth: '86%', borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  bubbleMine: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(245,165,36,0.35)',
    borderBottomRightRadius: radius.sm,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm,
  },
  bubbleError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  msgText: { color: colors.text, fontFamily: fonts.ui, fontSize: 16, lineHeight: 22 },
  msgTime: { color: colors.muted, fontFamily: fonts.num, fontSize: 11, alignSelf: 'flex-end' },
  photo: { width: 220, height: 150, borderRadius: radius.md },
  photoGone: { color: colors.muted, fontFamily: fonts.ui, fontSize: 14, fontStyle: 'italic' },
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
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: {
    color: colors.accent,
    fontFamily: fonts.ui,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  conf: { color: colors.muted, fontFamily: fonts.ui, fontSize: 12, fontWeight: '600' },
  cardWarn: { color: colors.danger, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600' },
  cardNote: { color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontStyle: 'italic' },
  cardSaved: { borderColor: colors.border },
  cardDanger: { borderColor: colors.danger },
  fieldBlock: { gap: 4 },
  was: { color: colors.accent, fontFamily: fonts.num, fontSize: 13, fontWeight: '600' },
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
  prop: { gap: spacing.md },
  propDivider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  removeText: { color: colors.danger, fontFamily: fonts.ui, fontSize: 13, fontWeight: '700' },
  problem: { color: colors.danger, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600' },
  savedText: { color: colors.success, fontFamily: fonts.ui, fontSize: 14, fontWeight: '700' },
  grades: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  textInput: {
    flex: 1,
    minHeight: TOUCH,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 16,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
  },
  cardFoot: { color: colors.muted, fontFamily: fonts.ui, fontSize: 12, lineHeight: 17 },
  numBlock: { gap: 6 },
  numRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  numLabel: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  numControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nudge: {
    minWidth: 44,
    height: TOUCH,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  nudgeText: { color: colors.accent, fontFamily: fonts.num, fontSize: 13, fontWeight: '700' },
  numBox: {
    flex: 1,
    minWidth: 0,
    height: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.sm,
  },
  numInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontFamily: fonts.num,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 0,
  },
  numInputBad: { borderColor: colors.danger },
  numUnit: { color: colors.muted, fontFamily: fonts.ui, fontSize: 12, fontWeight: '600' },
  timeInput: {
    flex: 0,
    width: 110,
    height: TOUCH,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  dateInput: {
    flex: 0,
    width: 140,
    height: TOUCH,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  historyList: { padding: spacing.lg, gap: spacing.sm },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TOUCH,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  newChatText: { color: colors.accent, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 64,
    paddingLeft: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyRowOn: { borderColor: colors.accent },
  historyTitle: { color: colors.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600' },
  historyMeta: { color: colors.muted, fontFamily: fonts.ui, fontSize: 13, marginTop: 2 },
  sheetTitle: { color: colors.text, fontFamily: fonts.ui, fontSize: 20, fontWeight: '700' },
  sheetBody: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  privacy: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  modelOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelOptOn: { borderColor: colors.accent, backgroundColor: colors.surface2 },
  modelOptTitle: { color: colors.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600' },
  modelOptNote: { color: colors.muted, fontFamily: fonts.ui, fontSize: 12, marginTop: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TOUCH,
    marginTop: spacing.sm,
  },
  keyRowText: { color: colors.accent, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700' },
  keyInput: {
    minHeight: 56,
    color: colors.text,
    fontFamily: fonts.num,
    fontSize: 16,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  sheetActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
