/**
 * The Log tab: current range up top, then the day-grouped timeline.
 *
 * The range card answers the question the user opens the app with ("how much
 * is left?") before anything else. The timeline reads like the old notes,
 * newest first, one card per day. Rows in a day share one rounded card (corners
 * on the first/last row only) so a busy day reads as a unit.
 *
 * The "+" button floats bottom-right, inside thumb reach, above the tab bar.
 */

import { useCallback, useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryRow } from '../components/EntryRow';
import { Card, Tap } from '../components/ui';
import { useNow } from '../components/useNow';
import { currentRangeKm, groupByDay, periodStart, rangeUsedById, summarize } from '../lib/entries';
import { formatKm } from '../lib/numbers';
import { useLog } from '../state/store';
import { colors, radius, spacing } from '../theme';
import type { Entry } from '../types';

type Section = { key: string; title: string; data: Entry[] };

export function LogScreen({
  onAdd,
  onEdit,
}: {
  onAdd: () => void;
  onEdit: (entry: Entry) => void;
}) {
  const insets = useSafeAreaInsets();
  const entries = useLog((s) => s.entries);
  const now = useNow();

  const sections = useMemo<Section[]>(
    () => groupByDay(entries, now).map((g) => ({ key: g.key, title: g.label, data: g.entries })),
    [entries, now],
  );
  const used = useMemo(() => rangeUsedById(entries), [entries]);
  const range = useMemo(() => currentRangeKm(entries), [entries]);
  // Open-ended so an entry stepped a few minutes into the future still counts.
  const week = useMemo(
    () => summarize(entries, periodStart('week', now), Number.POSITIVE_INFINITY),
    [entries, now],
  );

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
        <EntryRow entry={item} rangeUsed={used.get(item.id)} onPress={onEdit} />
      </View>
    ),
    [used, onEdit],
  );

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
      <Card style={styles.rangeCard}>
        <View style={styles.rangeLine}>
          <Text style={styles.rangeValue} adjustsFontSizeToFit numberOfLines={1}>
            {range === undefined ? '—' : formatKm(range).replace(/ km$/, '')}
          </Text>
          <Text style={styles.rangeUnit}>km range left</Text>
        </View>
        <Text style={styles.week}>
          This week: {formatKm(week.distanceKm)} driven · {formatKm(week.rangeUsedKm)} range used
        </Text>
      </Card>
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
            <Text style={styles.emptyTitle}>Nothing logged yet</Text>
            <Text style={styles.emptyText}>
              Tap the + button below. Start with Range to note what the dashboard shows now, then
              log a Trip each time you drive: where from, where to, distance and range left.
            </Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
      <Tap
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Add entry"
        style={styles.fab}
      >
        <Text style={styles.fabGlyph}>+</Text>
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  header: { paddingBottom: spacing.sm },
  rangeCard: { gap: spacing.sm, paddingVertical: spacing.xl },
  rangeLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  rangeValue: {
    color: colors.accent,
    fontSize: 72,
    lineHeight: 80,
    fontWeight: '800',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  rangeUnit: { color: colors.text, fontSize: 18, fontWeight: '600' },
  week: { color: colors.muted, fontSize: 14, fontWeight: '500' },
  sectionTitle: {
    color: colors.muted,
    fontSize: 13,
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
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  empty: { marginTop: spacing.xxl, paddingHorizontal: spacing.lg, gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  fabGlyph: { color: colors.onAccent, fontSize: 36, fontWeight: '500', marginTop: -3 },
});
