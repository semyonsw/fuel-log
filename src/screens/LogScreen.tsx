/**
 * The Log tab: current range up top, the trip recorder, then the day-grouped
 * timeline.
 *
 * The range card answers the question the user opens the app with ("how much
 * is left?") before anything else. Under it sits the GPS recorder: "Start
 * trip" when setting off, then a live card (km so far, minutes) with Stop.
 * It lives here rather than in the Trip form because the form would have to
 * stay open for the whole drive; Stop opens a new Trip already holding the
 * route and its distance.
 *
 * The timeline reads like the old notes, newest first, one card per day.
 * Rows in a day share one rounded card (corners on the first/last row only)
 * so a busy day reads as a unit. The AI, refuel and "+" buttons float bottom-right,
 * inside thumb reach, above the tab bar.
 */

import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryRow } from '../components/EntryRow';
import { splitUnit } from '../components/format';
import { Fabs } from '../components/Fabs';
import { RecordIcon } from '../components/icons';
import { RangeCard } from '../components/RangeCard';
import { Tap } from '../components/ui';
import { useNow } from '../components/useNow';
import { t } from '../i18n';
import { draftFromTrack, type Draft } from '../lib/draft';
import { currentRangeKm, groupByDay, periodStart, rangeUsedById, summarize } from '../lib/entries';
import { effectiveKmPerLiter, periodFuelCost, tripEstimates } from '../lib/fuel';
import { formatAmd, formatKm } from '../lib/numbers';
import { guessEnds } from '../lib/placeGuess';
import { liveDistanceKm, startTracking, stopTracking, useTracking } from '../services/tracking';
import { useSettings } from '../state/settings';
import { useLog } from '../state/store';
import { colors, fonts, radius, spacing, TOUCH } from '../theme';
import type { Entry } from '../types';

type Section = { key: string; title: string; data: Entry[] };

export function LogScreen({
  onAdd,
  onAddRefuel,
  onEdit,
  onAi,
  onTripRecorded,
}: {
  onAdd: () => void;
  onAddRefuel: () => void;
  onEdit: (entry: Entry) => void;
  onAi: () => void;
  onTripRecorded: (
    draft: Draft,
    markers: { from?: boolean; to?: boolean; distance?: boolean },
  ) => void;
}) {
  const insets = useSafeAreaInsets();
  const entries = useLog((s) => s.entries);
  const consumption = useSettings((s) => s.consumption);
  const now = useNow();

  const sections = useMemo<Section[]>(
    () => groupByDay(entries, now).map((g) => ({ key: g.key, title: g.label, data: g.entries })),
    [entries, now],
  );
  const used = useMemo(() => rangeUsedById(entries), [entries]);
  const kmPerL = useMemo(() => effectiveKmPerLiter(entries, consumption), [entries, consumption]);
  const estimates = useMemo(() => tripEstimates(entries, used, kmPerL), [entries, used, kmPerL]);
  const range = useMemo(() => currentRangeKm(entries), [entries]);
  // Open-ended so an entry stepped a few minutes into the future still counts.
  const week = useMemo(
    () => summarize(entries, periodStart('week', now), Number.POSITIVE_INFINITY),
    [entries, now],
  );
  const today = useMemo(() => {
    const from = periodStart('today', now);
    return {
      driven: summarize(entries, from, Number.POSITIVE_INFINITY).distanceKm,
      cost: periodFuelCost(entries, from, Number.POSITIVE_INFINITY, kmPerL),
    };
  }, [entries, now, kmPerL]);

  const renderItem = useCallback(
    ({ item, index, section }: { item: Entry; index: number; section: Section }) => (
      <View
        style={[
          styles.rowWrap,
          index === 0 && styles.rowFirst,
          index === section.data.length - 1 && styles.rowLast,
          index > 0 && styles.rowDivider,
        ]}
      >
        <EntryRow
          entry={item}
          rangeUsed={used.get(item.id)}
          estimate={estimates.get(item.id)}
          onPress={onEdit}
        />
      </View>
    ),
    [used, onEdit, estimates],
  );

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
      <RangeCard
        entries={entries}
        range={range === undefined ? '—' : splitUnit(formatKm(range))[0]}
        todayLine={
          today.cost
            ? t('app.log.today', {
                driven: formatKm(today.driven),
                cost: formatAmd(today.cost.amd),
              })
            : t('app.log.todayNoCost', { driven: formatKm(today.driven) })
        }
        weekLine={t('app.log.week', {
          driven: formatKm(week.distanceKm),
          used: formatKm(week.rangeUsedKm),
        })}
      />
      <Recorder entries={entries} now={now} onTripRecorded={onTripRecorded} />
    </View>
  );

  return (
    <View style={styles.root}>
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('app.log.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('app.log.emptyText')}</Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
      <Fabs onAi={onAi} onRefuel={onAddRefuel} onAdd={onAdd} />
    </View>
  );
}

function Recorder({
  entries,
  now,
  onTripRecorded,
}: {
  entries: Entry[];
  now: number;
  onTripRecorded: (
    draft: Draft,
    markers: { from?: boolean; to?: boolean; distance?: boolean },
  ) => void;
}) {
  const startedAt = useTracking((s) => s.startedAt);
  const points = useTracking((s) => s.points);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    const r = await startTracking();
    setBusy(false);
    if (r === 'started') return;
    if (r === 'no-background') {
      Alert.alert(t('app.log.bgTitle'), t('app.log.bgText'), [
        { text: t('app.log.notNow'), style: 'cancel' },
        { text: t('app.log.openSettings'), onPress: () => Linking.openSettings() },
      ]);
    } else if (r === 'no-permission') {
      Alert.alert(t('app.log.permTitle'), t('app.log.permText'), [
        { text: t('app.log.notNow'), style: 'cancel' },
        { text: t('app.log.openSettings'), onPress: () => Linking.openSettings() },
      ]);
    } else {
      Alert.alert(t('app.log.failTitle'), t('app.log.failText'));
    }
  };

  const stop = async () => {
    setBusy(true);
    const { track, distanceKm } = await stopTracking();
    setBusy(false);
    const names = guessEnds(entries, track);
    onTripRecorded(draftFromTrack(track, distanceKm, Date.now(), names), {
      from: !!names.from,
      to: !!names.to,
      distance: track.length > 1,
    });
  };

  if (startedAt === null) {
    return (
      <Tap
        onPress={start}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={t('app.log.startA11y')}
        style={styles.startBtn}
      >
        <RecordIcon />
        <Text style={styles.startText}>{t('app.log.start')}</Text>
        <Text style={styles.startHint}>{t('app.log.startHint')}</Text>
      </Tap>
    );
  }

  const minutes = Math.max(0, Math.floor((now - startedAt) / 60000));
  return (
    <View style={styles.live} accessibilityLiveRegion="polite">
      <View style={styles.liveDot} />
      <View style={styles.liveBody}>
        <Text style={styles.liveTitle}>{t('app.log.recording')}</Text>
        <Text style={styles.liveNums}>
          {formatKm(liveDistanceKm(points))} · {t('lib.duration.minutes', { m: minutes })}
        </Text>
      </View>
      <Tap
        onPress={stop}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={t('app.log.stopA11y')}
        style={styles.stopBtn}
      >
        <View style={styles.stopSquare} />
        <Text style={styles.stopText}>{t('app.log.stop')}</Text>
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  header: { paddingBottom: spacing.sm, gap: spacing.md },
  sectionTitle: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  rowWrap: {
    overflow: 'hidden',
    borderColor: colors.border,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  rowDivider: { borderTopWidth: 1 },
  empty: { marginTop: spacing.xxl, paddingHorizontal: spacing.lg, gap: spacing.sm },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  startBtn: {
    minHeight: TOUCH + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  startText: { color: colors.accent, fontFamily: fonts.ui, fontSize: 16, fontWeight: '700' },
  startHint: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    paddingLeft: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  liveBody: { flex: 1, gap: 2 },
  liveTitle: { color: colors.text, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700' },
  liveNums: {
    color: colors.accent,
    fontFamily: fonts.num,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  stopBtn: {
    minHeight: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  stopSquare: { width: 12, height: 12, borderRadius: 2, backgroundColor: colors.onAccent },
  stopText: { color: colors.onAccent, fontFamily: fonts.ui, fontSize: 16, fontWeight: '700' },
});
