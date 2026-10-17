/**
 * Add / edit an entry: a full-screen sheet that slides up over the tabs.
 *
 * Layout is built for one hand in a parked car: the kind switch at the top
 * (Trip / Range from "+"; none on the fuel button's refuel-only form) with one
 * line saying what that kind is for, the fields the user actually
 * types in the middle (places first, because a trip is mostly "where to
 * where"), the time below them since it's usually "now" already, and Save
 * pinned at the bottom under the thumb, with one line above it saying what
 * is still missing.
 *
 * The form holds a lib `Draft` (raw strings) so half-typed "33," survives;
 * `validateDraft` is the only place that turns it into an Entry. Field errors
 * stay hidden until the first Save press so a fresh form isn't covered in red.
 *
 * A form can open pre-filled — from a GPS recording or from the AI's reading
 * of a dashboard photo. Pre-filled fields carry a small marker ("from GPS",
 * "from photo") until the user edits them; nothing is saved until Save.
 *
 * Keyboard: the window resizes (softwareKeyboardLayoutMode "resize"), but with
 * edge-to-edge that isn't guaranteed on every Android version, so the sheet
 * also sits in a KeyboardAvoidingView with "padding". That behaviour measures
 * the actual overlap, so it adds nothing when the window already resized.
 */

import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
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

import { CloseIcon } from '../components/icons';
import { PlaceField } from '../components/PlaceField';
import { RouteMap } from '../components/RouteMap';
import { Dropdown } from '../components/Dropdown';
import { AddressField, StationField } from '../components/StationField';
import { Button, ConfirmSheet, Field, SectionLabel, Segmented, Tap } from '../components/ui';
import { WhenPicker } from '../components/WhenPicker';
import {
  draftFromEntry,
  emptyDraft,
  formKinds,
  saveHint,
  validateDraft,
  type Draft,
} from '../lib/draft';
import { currentRangeKm, rangeUsedById } from '../lib/entries';
import { effectiveKmPerLiter, tripFuelEstimate } from '../lib/fuel';
import { trackDistanceKm } from '../lib/geo';
import { newId } from '../lib/id';
import { formatAmd, formatKm, formatLiters, parseNumber } from '../lib/numbers';
import { addressForStation, FUEL_GRADES, refuelDefaults } from '../lib/stations';
import { formatDelta } from '../components/format';
import { t, type StringKey } from '../i18n';
import { useSettings } from '../state/settings';
import { useLog } from '../state/store';
import { colors, fonts, radius, spacing, TOUCH } from '../theme';
import type { Entry, EntryKind } from '../types';

const KINDS: EntryKind[] = ['trip', 'reading', 'refuel'];

const KIND_LABEL: Record<EntryKind, StringKey> = {
  trip: 'form.kind.trip',
  reading: 'form.kind.reading',
  refuel: 'form.kind.refuel',
};

const KIND_HINT: Record<EntryKind, StringKey> = {
  trip: 'form.kindHint.trip',
  reading: 'form.kindHint.reading',
  refuel: 'form.kindHint.refuel',
};

/** Where a pre-filled value came from, shown next to its label. */
export type FormMarkers = Partial<Record<'range' | 'distance' | 'at' | 'from' | 'to', string>>;

export function EntryForm({
  editing,
  initial,
  initialMarkers,
  onClose,
}: {
  editing?: Entry;
  /** A pre-filled new entry (GPS recording, AI reading, "Add refuel"). */
  initial?: Draft;
  initialMarkers?: FormMarkers;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const entries = useLog((s) => s.entries);
  const add = useLog((s) => s.add);
  const update = useLog((s) => s.update);
  const remove = useLog((s) => s.remove);
  const consumption = useSettings((s) => s.consumption);

  const [id] = useState(() => editing?.id ?? newId());
  const [draft, setDraft] = useState<Draft>(() => {
    if (editing) return draftFromEntry(editing);
    const d = initial ?? emptyDraft('trip', Date.now());
    // A new refuel starts at the last fill-up's pump and grade; only when the
    // opener left all three blank, so a pre-fill from elsewhere wins.
    if (d.kind === 'refuel' && !d.station.trim() && !d.address.trim() && !d.grade) {
      return { ...d, ...refuelDefaults(entries) };
    }
    return d;
  });
  // Fixed at open: the fuel button's form is refuel-only, the "+" form is trip/range.
  const [kindValues] = useState(() => KINDS.filter((k) => formKinds(draft.kind).includes(k)));
  // Labels at render time, so they follow the language.
  const kinds = kindValues.map((value) => ({ value, label: t(KIND_LABEL[value]) }));
  const [markers, setMarkers] = useState<FormMarkers>(initialMarkers ?? {});
  const [showErrors, setShowErrors] = useState(false);
  // While a finger is on the route map the page holds still, so a pinch that
  // drifts past the map's edge stays a zoom (see RouteMap).
  const [mapHeld, setMapHeld] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const result = useMemo(() => validateDraft(draft, id), [draft, id]);
  const errors = showErrors && !result.ok ? result.errors : {};
  const hint = result.ok ? '' : saveHint(result.errors);

  // A hint, not a pre-fill: what the dashboard said last time, so the user
  // has a sanity check for the number they're about to type.
  const lastRange = useMemo(
    () => (editing ? undefined : currentRangeKm(entries)),
    [editing, entries],
  );
  const km = t('form.unit.km');
  const rangePlaceholder =
    lastRange === undefined ? km : t('form.lastRange', { km: formatKm(lastRange) });
  const typedRange = parseNumber(draft.range);
  const liveUsed =
    lastRange !== undefined && typedRange !== undefined && lastRange - typedRange > 0
      ? lastRange - typedRange
      : undefined;

  // The trip's approximate cost, live: the log as it would be with this trip saved.
  const estimate = useMemo(() => {
    if (!result.ok || result.entry.kind !== 'trip') return undefined;
    const withThis = [...entries.filter((e) => e.id !== id), result.entry];
    return tripFuelEstimate(
      result.entry,
      withThis,
      rangeUsedById(withThis).get(id),
      effectiveKmPerLiter(withThis, consumption),
    );
  }, [result, entries, id, consumption]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    // Editing a pre-filled field makes it the user's own value.
    if (key in markers) setMarkers((m) => ({ ...m, [key]: undefined }));
  };

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

  /** Return trip: B → A with the stops in reverse (and the route, if recorded). */
  const swap = () =>
    setDraft((d) => ({ ...d, from: d.to, to: d.from, stops: [...d.stops].reverse() }));

  const places = [draft.from, ...draft.stops, draft.to];
  /** Every place on the form except the one at `index`, for chip exclusion. */
  const othersThan = (index: number) => places.filter((p, i) => i !== index && p.trim() !== '');
  const gpsKm = draft.track && draft.track.length > 1 ? trackDistanceKm(draft.track) : undefined;

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
            accessibilityLabel={t('form.close')}
            style={styles.close}
          >
            <CloseIcon />
          </Tap>
          <Text style={styles.title}>
            {t(
              draft.kind === 'refuel'
                ? editing
                  ? 'form.title.editRefuel'
                  : 'form.title.newRefuel'
                : editing
                  ? 'form.title.edit'
                  : 'form.title.new',
            )}
          </Text>
          <View style={styles.close} />
        </View>

        <View style={styles.kindRow}>
          {kinds.length > 1 ? (
            <Segmented options={kinds} value={draft.kind} onChange={(k) => set('kind', k)} />
          ) : null}
          <Text style={[styles.kindHint, kinds.length === 1 && styles.kindHintAlone]}>
            {t(KIND_HINT[draft.kind])}
          </Text>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!mapHeld}
        >
          {draft.kind === 'trip' ? (
            <>
              {draft.track && draft.track.length > 1 ? (
                <View style={styles.mapBlock}>
                  <SectionLabel>{t('form.route')}</SectionLabel>
                  <RouteMap track={draft.track} onHeldChange={setMapHeld} />
                  {gpsKm !== undefined ? (
                    <Text style={styles.muted}>
                      {t('form.gpsDistance', { km: formatKm(gpsKm) })}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <PlaceField
                label={t('form.from')}
                value={draft.from}
                onChange={(v) => set('from', v)}
                exclude={othersThan(0)}
                error={errors.from}
                marker={markers.from}
                placeholder={t('form.fromPlaceholder')}
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
                  label={t('form.stop', { n: i + 1 })}
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
                      accessibilityLabel={t('form.removeStopA11y', { n: i + 1 })}
                      hitSlop={14}
                      style={styles.removeStop}
                    >
                      <Text style={styles.removeStopText}>{t('form.remove')}</Text>
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
                  <Text style={styles.dashedText}>{t('form.addStop')}</Text>
                </Tap>
                <Tap
                  onPress={swap}
                  accessibilityRole="button"
                  accessibilityLabel={t('form.returnTripA11y')}
                  style={styles.dashed}
                >
                  <Text style={styles.dashedText}>{t('form.returnTrip')}</Text>
                </Tap>
              </View>

              <PlaceField
                ref={toRef}
                label={t('form.to')}
                value={draft.to}
                onChange={(v) => set('to', v)}
                exclude={othersThan(places.length - 1)}
                error={errors.to}
                marker={markers.to}
                placeholder={t('form.toPlaceholder')}
                onSubmitEditing={() => distanceRef.current?.focus()}
              />

              <View style={styles.pair}>
                <View style={styles.flex}>
                  <Field
                    ref={distanceRef}
                    label={t('form.distance')}
                    suffix={km}
                    numeric
                    keyboardType="decimal-pad"
                    value={draft.distance}
                    onChangeText={(v) => set('distance', v)}
                    error={errors.distance}
                    marker={markers.distance}
                    placeholder="22,5"
                  />
                </View>
                <View style={styles.flex}>
                  <Field
                    label={t('form.rangeLeft')}
                    suffix={km}
                    numeric
                    keyboardType="decimal-pad"
                    value={draft.range}
                    onChangeText={(v) => set('range', v)}
                    error={errors.range}
                    marker={markers.range}
                    placeholder={rangePlaceholder}
                  />
                </View>
              </View>
              {estimate ? (
                <Text style={styles.estimate}>
                  {t('form.estimate', {
                    liters: formatLiters(Math.round(estimate.liters * 10) / 10),
                    amd: formatAmd(estimate.amd),
                  })}
                </Text>
              ) : null}
            </>
          ) : draft.kind === 'reading' ? (
            <View style={styles.bigBlock}>
              <Field
                label={t('form.rangeLeft')}
                suffix={km}
                numeric
                big
                keyboardType="decimal-pad"
                value={draft.range}
                onChangeText={(v) => set('range', v)}
                error={errors.range}
                marker={markers.range}
                placeholder={rangePlaceholder}
                autoFocus={!editing && !initial}
              />
              {liveUsed !== undefined ? (
                <Text style={styles.live}>
                  <Text style={styles.liveNum}>−{formatDelta(liveUsed)}</Text> {t('form.sinceLast')}
                </Text>
              ) : null}
            </View>
          ) : (
            <>
              <View style={styles.pair}>
                <View style={styles.flex}>
                  <Field
                    label={t('form.liters')}
                    suffix={t('form.unit.l')}
                    numeric
                    keyboardType="decimal-pad"
                    value={draft.liters}
                    onChangeText={(v) => set('liters', v)}
                    error={errors.liters}
                    placeholder="30"
                  />
                </View>
                <View style={styles.flex}>
                  <Field
                    label={t('form.totalPaid')}
                    suffix="AMD"
                    numeric
                    keyboardType="number-pad"
                    value={draft.price}
                    onChangeText={(v) => set('price', v)}
                    error={errors.price}
                    placeholder="15000"
                  />
                </View>
              </View>
              <Field
                label={t('form.rangeAfter')}
                suffix={km}
                numeric
                keyboardType="decimal-pad"
                value={draft.range}
                onChangeText={(v) => set('range', v)}
                error={errors.range}
                marker={markers.range}
                placeholder={km}
              />
              <StationField
                value={draft.station}
                onChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    station: v,
                    address: addressForStation(entries, d.station, v, d.address),
                  }))
                }
                onPick={(name) =>
                  setDraft((d) => ({
                    ...d,
                    station: name,
                    address: addressForStation(entries, d.station, name, d.address),
                  }))
                }
              />
              <AddressField
                value={draft.address}
                station={draft.station}
                onChange={(v) => set('address', v)}
              />
              <Dropdown
                label={t('form.gradeLabel')}
                value={draft.grade}
                options={FUEL_GRADES}
                onChange={(g) => set('grade', g)}
                placeholder={t('form.notSet')}
                clearLabel={t('form.notSet')}
              />
            </>
          )}

          <View style={styles.divider} />
          <View>
            {markers.at ? <Text style={styles.atMarker}>{markers.at}</Text> : null}
            <WhenPicker at={draft.at} onChange={(at) => set('at', at)} />
          </View>
          <View style={styles.divider} />

          <Field
            label={t('form.note')}
            value={draft.note}
            onChangeText={(v) => set('note', v)}
            multiline
            textAlignVertical="top"
            placeholder={t('form.notePlaceholder')}
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          {hint ? <Text style={styles.saveHint}>{hint}</Text> : null}
          <View style={styles.footerRow}>
            {editing ? (
              <View style={styles.deleteWrap}>
                <Button
                  label={t('form.delete')}
                  variant="danger"
                  onPress={() => setConfirmDelete(true)}
                />
              </View>
            ) : null}
            <View style={styles.flex}>
              <Button
                label={editing ? t('form.saveChanges') : t('common.save')}
                onPress={save}
                dim={!result.ok}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <ConfirmSheet
        visible={confirmDelete}
        title={t('form.deleteTitle')}
        body={t('form.deleteBody')}
        confirmLabel={t('form.delete')}
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          remove(id);
          onClose();
        }}
      />
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
  title: { color: colors.text, fontFamily: fonts.ui, fontSize: 18, fontWeight: '700' },
  kindRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  kindHint: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginTop: spacing.sm,
    marginHorizontal: spacing.xs,
  },
  kindHintAlone: { marginTop: 0 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  pair: { flexDirection: 'row', gap: spacing.md },
  mapBlock: { gap: spacing.sm },
  muted: { color: colors.muted, fontFamily: fonts.num, fontSize: 13, fontWeight: '500' },
  estimate: {
    color: colors.muted,
    fontFamily: fonts.num,
    fontSize: 14,
    fontWeight: '600',
    marginTop: -spacing.sm,
  },
  bigBlock: { gap: spacing.sm },
  live: {
    color: colors.accent,
    fontFamily: fonts.ui,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  liveNum: { fontFamily: fonts.num, fontWeight: '800' },
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
  dashedText: { color: colors.accent, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700' },
  removeStop: { paddingHorizontal: spacing.xs },
  removeStopText: { color: colors.danger, fontFamily: fonts.ui, fontSize: 13, fontWeight: '700' },
  atMarker: {
    position: 'absolute',
    left: 52,
    top: 0,
    zIndex: 1,
    color: colors.accent,
    fontFamily: fonts.ui,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.border },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  footerRow: { flexDirection: 'row', gap: spacing.md },
  saveHint: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    paddingHorizontal: spacing.xs,
  },
  deleteWrap: { width: 120 },
});
