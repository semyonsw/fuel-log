/**
 * The Summary tab: totals for this week / this month / all time, then a
 * per-day breakdown for the same period.
 *
 * Tiles draw the number large and the unit small, the way a dashboard does.
 * Per-day figures go through `summarize` over the FULL entry list with that
 * day's bounds (not over the day's entries alone), because range used is
 * measured from the previous reading, which may be on an earlier day.
 */

import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dayBounds, splitUnit } from '../components/format';
import { Segmented } from '../components/ui';
import { useNow } from '../components/useNow';
import { groupByDay, periodStart, summarize, type Summary } from '../lib/entries';
import { formatAmd, formatKm, formatLiters } from '../lib/numbers';
import { useLog } from '../state/store';
import { colors, radius, spacing } from '../theme';

type Period = 'week' | 'month' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All' },
];

type DayRow = { key: string; label: string; summary: Summary };

export function SummaryScreen() {
  const insets = useSafeAreaInsets();
  const entries = useLog((s) => s.entries);
  const now = useNow();
  const [period, setPeriod] = useState<Period>('week');

  const from = periodStart(period, now);
  const total = useMemo(() => summarize(entries, from, Number.POSITIVE_INFINITY), [entries, from]);
  const days = useMemo<DayRow[]>(
    () =>
      groupByDay(
        entries.filter((e) => e.at >= from),
        now,
      ).map((g) => {
        const [start, end] = dayBounds(g.entries[0].at);
        return { key: g.key, label: g.label, summary: summarize(entries, start, end) };
      }),
    [entries, from, now],
  );

  const tiles: { label: string; value: string }[] = [
    { label: 'Driven', value: formatKm(total.distanceKm) },
    { label: 'Trips', value: String(total.trips) },
    { label: 'Range used', value: formatKm(total.rangeUsedKm) },
    { label: 'Refuels', value: String(total.refuels) },
    { label: 'Fuel', value: formatLiters(total.liters) },
    { label: 'Spent', value: formatAmd(total.spentAmd) },
  ];
  if (total.liters > 0) {
    tiles.push({ label: 'Avg price', value: `${formatAmd(total.spentAmd / total.liters)}/L` });
  }

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.title}>Summary</Text>
      <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      <View style={styles.grid}>
        {tiles.map((t) => {
          const [num, unit] = splitUnit(t.value);
          return (
            <View key={t.label} style={styles.tile}>
              <Text style={styles.tileLabel}>{t.label}</Text>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
                {num}
                {unit ? <Text style={styles.tileUnit}> {unit}</Text> : null}
              </Text>
            </View>
          );
        })}
      </View>
      {days.length > 0 ? <Text style={styles.sectionTitle}>By day</Text> : null}
    </View>
  );

  return (
    <FlatList
      style={styles.root}
      data={days}
      keyExtractor={(d) => d.key}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
      renderItem={({ item, index }) => (
        <View
          style={[
            styles.day,
            index === 0 && styles.dayFirst,
            index === days.length - 1 && styles.dayLast,
          ]}
        >
          <Text style={styles.dayLabel}>{item.label}</Text>
          <View style={styles.dayNums}>
            <Text style={styles.dayKm}>{formatKm(item.summary.distanceKm)}</Text>
            {item.summary.rangeUsedKm > 0 ? (
              <Text style={styles.dayUsed}>−{formatKm(item.summary.rangeUsedKm)} range</Text>
            ) : null}
          </View>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>Nothing logged in this period yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.lg, paddingBottom: spacing.sm },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    // Two per row: half the width minus half the gap.
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
    minHeight: 92,
  },
  tileLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tileValue: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  tileUnit: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  sectionTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dayFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  dayLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  dayLabel: { color: colors.text, fontSize: 16, fontWeight: '600' },
  dayNums: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  dayKm: { color: colors.text, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dayUsed: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  empty: { color: colors.muted, fontSize: 16, textAlign: 'center', marginTop: spacing.xl },
});
