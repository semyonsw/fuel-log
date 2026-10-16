/**
 * Add / edit an entry: a full-screen sheet that slides up over the tabs.
 *
 * Layout is built for one hand in a parked car: the kind switch at the top,
 * the fields the user actually types in the middle (places first, because a
 * trip is mostly "where to where"), the time below them since it's usually
 * "now" already, and Save pinned at the bottom under the thumb.
 *
 * The form holds a lib `Draft` (raw strings) so half-typed "33," survives;
 * `validateDraft` is the only place that turns it into an Entry. Errors stay
 * hidden until the first Save press so a fresh form isn't covered in red.
 *
 * Keyboard: the window resizes (softwareKeyboardLayoutMode "resize"), but with
 * edge-to-edge that isn't guaranteed on every Android version, so the sheet
 * also sits in a KeyboardAvoidingView with "padding". That behaviour measures
 * the actual overlap, so it adds nothing when the window already resized.
 */

import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceField } from '../components/PlaceField';
import { Button, Field, Segmented, Tap } from '../components/ui';
import { WhenPicker } from '../components/WhenPicker';
import { draftFromEntry, emptyDraft, validateDraft, type Draft } from '../lib/draft';
import { currentRangeKm } from '../lib/entries';
import { newId } from '../lib/id';
import { formatKm } from '../lib/numbers';
import { useLog } from '../state/store';
import { colors, radius, spacing, TOUCH } from '../theme';
import type { Entry, EntryKind } from '../types';

const KINDS: { value: EntryKind; label: string }[] = [
  { value: 'trip', label: 'Trip' },
  { value: 'reading', label: 'Range' },
  { value: 'refuel', label: 'Refuel' },
];

export function EntryForm({ editing, onClose }: { editing?: Entry; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const entries = useLog((s) => s.entries);
  const add = useLog((s) => s.add);
  const update = useLog((s) => s.update);
  const remove = useLog((s) => s.remove);

  const [id] = useState(() => editing?.id ?? newId());
  const [draft, setDraft] = useState<Draft>(() =>
    editing ? draftFromEntry(editing) : emptyDraft('trip', Date.now()),
  );
  const [showErrors, setShowErrors] = useState(false);
  const result = useMemo(() => validateDraft(draft, id), [draft, id]);
  const errors = showErrors && !result.ok ? result.errors : {};

  // A hint, not a pre-fill: what the dashboard said last time, so the user
  // has a sanity check for the number they're about to type.
  const lastRange = useMemo(
    () => (editing ? undefined : currentRangeKm(entries)),
    [editing, entries],
  );
  const rangePlaceholder = lastRange === undefined ? 'km' : `last ${formatKm(lastRange)}`;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Android back closes the form (the parent decides what "close" unmounts).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(slide, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [slide]);

  // Focus the stop that "+ Add stop" just created, so the user can type at once.
  const stopRefs = useRef<(TextInput | null)[]>([]);
  const [focusStop, setFocusStop] = useState<number | null>(null);
  useEffect(() => {
    if (focusStop === null) return;
    stopRefs.current[focusStop]?.focus();
    setFocusStop(null);
  }, [focusStop]);
  const toRef = useRef<TextInput>(null);
  const distanceRef = useRef<TextInput>(null);

  const save = () => {
    if (!result.ok) {
      setShowErrors(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    if (editing) update(result.entry);
    else add(result.entry);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  };

  const confirmDelete = () => {
    Alert.alert('Delete this entry?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          remove(id);
          onClose();
        },
      },
    ]);
  };

  /** Return trip: B → A with the stops in reverse. */
  const swap = () =>
    setDraft((d) => ({ ...d, from: d.to, to: d.from, stops: [...d.stops].reverse() }));

  const places = [draft.from, ...draft.stops, draft.to];
  /** Every place on the form except the one at `index`, for chip exclusion. */
  const othersThan = (index: number) => places.filter((p, i) => i !== index && p.trim() !== '');

  return (
    <Animated.View
      style={[
        styles.root,
        {
          opacity: slide,
          transform: [
            { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
          ],
        },
      ]}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Tap
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.close}
          >
            <Text style={styles.closeGlyph}>✕</Text>
          </Tap>
          <Text style={styles.title}>{editing ? 'Edit entry' : 'New entry'}</Text>
          <View style={styles.close} />
        </View>

        <View style={styles.kindRow}>
          <Segmented options={KINDS} value={draft.kind} onChange={(k) => set('kind', k)} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {draft.kind === 'trip' ? (
            <>
              <PlaceField
                label="From"
                value={draft.from}
                onChange={(v) => set('from', v)}
                exclude={othersThan(0)}
                error={errors.from}
                placeholder="e.g. 4micro"
                onSubmitEditing={() =>
                  draft.stops.length > 0 ? stopRefs.current[0]?.focus() : toRef.current?.focus()
                }
              />

              {draft.stops.map((stop, i) => (
                <PlaceField
                  key={i}
                  ref={(r) => {
                    stopRefs.current[i] = r;
                  }}
                  label={`Stop ${i + 1}`}
                  value={stop}
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, stops: d.stops.map((s, j) => (j === i ? v : s)) }))
                  }
                  exclude={othersThan(i + 1)}
                  onSubmitEditing={() =>
                    i + 1 < draft.stops.length
                      ? stopRefs.current[i + 1]?.focus()
                      : toRef.current?.focus()
                  }
                  accessory={
                    <Tap
                      onPress={() =>
                        setDraft((d) => ({ ...d, stops: d.stops.filter((_, j) => j !== i) }))
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Remove stop ${i + 1}`}
                      hitSlop={14}
                      style={styles.removeStop}
                    >
                      <Text style={styles.removeStopText}>Remove</Text>
                    </Tap>
                  }
                />
              ))}

              <View style={styles.tripActions}>
                <Tap
                  onPress={() => {
                    setFocusStop(draft.stops.length);
                    setDraft((d) => ({ ...d, stops: [...d.stops, ''] }));
                  }}
                  accessibilityRole="button"
                  style={[styles.dashed, styles.flex]}
                >
                  <Text style={styles.dashedText}>+ Add stop</Text>
                </Tap>
                <Tap
                  onPress={swap}
                  accessibilityRole="button"
                  accessibilityLabel="Swap from and to (return trip)"
                  style={styles.dashed}
                >
                  <Text style={styles.dashedText}>↔ Return trip</Text>
                </Tap>
              </View>

              <PlaceField
                ref={toRef}
                label="To"
                value={draft.to}
                onChange={(v) => set('to', v)}
                exclude={othersThan(places.length - 1)}
                error={errors.to}
                placeholder="e.g. charents school"
                onSubmitEditing={() => distanceRef.current?.focus()}
              />

              <View style={styles.pair}>
                <View style={styles.flex}>
                  <Field
                    ref={distanceRef}
                    label="Distance"
                    suffix="km"
                    keyboardType="decimal-pad"
                    value={draft.distance}
                    onChangeText={(v) => set('distance', v)}
                    error={errors.distance}
                    placeholder="22,5"
                  />
                </View>
                <View style={styles.flex}>
                  <Field
                    label="Range left"
                    suffix="km"
                    keyboardType="decimal-pad"
                    value={draft.range}
                    onChangeText={(v) => set('range', v)}
                    error={errors.range}
                    placeholder={rangePlaceholder}
                  />
                </View>
              </View>
            </>
          ) : draft.kind === 'reading' ? (
            <Field
              label="Range left"
              suffix="km"
              keyboardType="decimal-pad"
              value={draft.range}
              onChangeText={(v) => set('range', v)}
              error={errors.range}
              placeholder={rangePlaceholder}
              style={styles.bigInput}
            />
          ) : (
            <>
              <View style={styles.pair}>
                <View style={styles.flex}>
                  <Field
                    label="Liters"
                    suffix="L"
                    keyboardType="decimal-pad"
                    value={draft.liters}
                    onChangeText={(v) => set('liters', v)}
                    error={errors.liters}
                    placeholder="30"
                  />
                </View>
                <View style={styles.flex}>
                  <Field
                    label="Total paid"
                    suffix="AMD"
                    keyboardType="number-pad"
                    value={draft.price}
                    onChangeText={(v) => set('price', v)}
                    error={errors.price}
                    placeholder="15000"
                  />
                </View>
              </View>
              <Field
                label="Range after (optional)"
                suffix="km"
                keyboardType="decimal-pad"
                value={draft.range}
                onChangeText={(v) => set('range', v)}
                error={errors.range}
                placeholder="km"
              />
            </>
          )}

          <View style={styles.divider} />
          <WhenPicker at={draft.at} onChange={(at) => set('at', at)} />
          <View style={styles.divider} />

          <Field
            label="Note (optional)"
            value={draft.note}
            onChangeText={(v) => set('note', v)}
            multiline
            textAlignVertical="top"
            placeholder="Anything worth remembering"
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          {editing ? (
            <View style={styles.deleteWrap}>
              <Button label="Delete" variant="danger" onPress={confirmDelete} />
            </View>
          ) : null}
          <View style={styles.flex}>
            <Button label={editing ? 'Save changes' : 'Save'} onPress={save} dim={!result.ok} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  close: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { color: colors.text, fontSize: 22 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  kindRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  pair: { flexDirection: 'row', gap: spacing.md },
  bigInput: { fontSize: 32, fontWeight: '700' },
  tripActions: { flexDirection: 'row', gap: spacing.sm },
  dashed: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  dashedText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  removeStop: { paddingHorizontal: spacing.xs },
  removeStopText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  deleteWrap: { width: 120 },
});
