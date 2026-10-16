/**
 * One timeline row, in one of three shapes: trip, range reading, refuel.
 *
 * Each mirrors a line of the Samsung Notes log it replaces, so the user can
 * scan it the same way: time on the left, then what happened, then the range
 * the dashboard showed afterwards. Range used ("−15") is the number they used
 * to work out in their head, so it gets the accent colour. The whole row is the
 * tap target for editing; there are no per-row buttons to miss.
 */

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Entry } from '../types';
import { formatTime } from '../lib/entries';
import { formatAmd, formatKm, formatLiters } from '../lib/numbers';
import { colors, radius, spacing } from '../theme';
import { DropIcon, GaugeIcon } from './icons';
import { RouteLine } from './RouteLine';
import { Tap } from './ui';
import { formatDelta } from './format';

type Props = {
  entry: Entry;
  /** Range consumed since the previous reading; undefined when not derivable. */
  rangeUsed?: number;
  onPress: (entry: Entry) => void;
};

export const EntryRow = memo(function EntryRow({ entry, rangeUsed, onPress }: Props) {
  return (
    <Tap
      onPress={() => onPress(entry)}
      accessibilityRole="button"
      accessibilityHint="Edit this entry"
      style={styles.row}
    >
      <Text style={styles.time}>{formatTime(entry.at)}</Text>
      <View style={styles.body}>
        {entry.kind === 'trip' ? (
          <>
            <RouteLine from={entry.from} stops={entry.stops} to={entry.to} />
            <View style={styles.chips}>
              {entry.distanceKm !== undefined ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{formatKm(entry.distanceKm)}</Text>
                </View>
              ) : null}
              {entry.rangeKm !== undefined ? (
                <RangeChip rangeKm={entry.rangeKm} used={rangeUsed} />
              ) : null}
            </View>
          </>
        ) : entry.kind === 'reading' ? (
          <View style={styles.inline}>
            <GaugeIcon />
            <Text style={styles.primary}>{formatKm(entry.rangeKm)} left</Text>
            <Delta used={rangeUsed} />
          </View>
        ) : (
          <>
            <View style={styles.inline}>
              <DropIcon />
              <Text style={styles.primary}>
                {formatLiters(entry.liters)} · {formatAmd(entry.priceAmd)}
              </Text>
            </View>
            <View style={styles.chips}>
              {entry.liters > 0 ? (
                <Text style={styles.meta}>
                  {formatAmd(Math.round(entry.priceAmd / entry.liters))}/L
                </Text>
              ) : null}
              {entry.rangeKm !== undefined ? (
                <RangeChip rangeKm={entry.rangeKm} used={rangeUsed} />
              ) : null}
            </View>
          </>
        )}
        {entry.note ? (
          <Text style={styles.note} numberOfLines={3}>
            {entry.note}
          </Text>
        ) : null}
      </View>
    </Tap>
  );
});

function RangeChip({ rangeKm, used }: { rangeKm: number; used?: number }) {
  return (
    <View style={[styles.chip, styles.rangeChip]}>
      <Text style={styles.chipText}>{formatKm(rangeKm)} left</Text>
      <Delta used={used} />
    </View>
  );
}

/** "−15" in amber: the range this entry used since the previous reading. */
function Delta({ used }: { used?: number }) {
  if (used === undefined || used <= 0) return null;
  return <Text style={styles.delta}>−{formatDelta(used)}</Text>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    minHeight: 56,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  time: {
    width: 48,
    color: colors.muted,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    paddingTop: 1,
  },
  body: { flex: 1, gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  primary: { color: colors.text, fontSize: 17, fontWeight: '600', flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  rangeChip: { borderWidth: 1, borderColor: colors.border },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  delta: { color: colors.accent, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  meta: { color: colors.muted, fontSize: 14, fontWeight: '500' },
  note: { color: colors.muted, fontSize: 14, fontStyle: 'italic' },
});
