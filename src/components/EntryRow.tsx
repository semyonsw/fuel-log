/**
 * One timeline row, in one of three shapes: trip, range reading, refuel.
 *
 * Each mirrors a line of the Samsung Notes log it replaces, so the user can
 * scan it the same way: time on the left, then what happened, then the range
 * the dashboard showed afterwards. Range used ("−15") is the number they used
 * to work out in their head, so it gets the accent colour. The whole row is the
 * tap target for editing; there are no per-row buttons to miss, and a chevron
 * says so.
 *
 * Refuels get an amber edge and a faint wash so fill-ups stand out when
 * scrolling a month back. A tracked trip shows its route as a small drawn
 * line (no map tiles in a list) and every trip with enough data shows its
 * approximate fuel cost.
 */

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Entry } from '../types';
import { formatTime } from '../lib/entries';
import type { FuelResult } from '../lib/fuel';
import { formatAmd, formatKm, formatLiters } from '../lib/numbers';
import { stationLine } from '../lib/stations';
import { colors, fonts, radius, spacing } from '../theme';
import { formatDelta } from './format';
import { ChevronIcon, DropIcon, GaugeIcon } from './icons';
import { RouteLine } from './RouteLine';
import { TrackPreview } from './TrackPreview';
import { Tap } from './ui';

type Props = {
  entry: Entry;
  /** Range consumed since the previous reading; undefined when not derivable. */
  rangeUsed?: number;
  /** A trip's approximate fuel and cost; undefined when any input is missing. */
  estimate?: FuelResult;
  onPress: (entry: Entry) => void;
};

export const EntryRow = memo(function EntryRow({ entry, rangeUsed, estimate, onPress }: Props) {
  const station = entry.kind === 'refuel' ? stationLine(entry) : '';
  return (
    <Tap
      onPress={() => onPress(entry)}
      accessibilityRole="button"
      accessibilityHint="Edit this entry"
      style={styles.row}
    >
      {entry.kind === 'refuel' ? (
        <>
          <View style={styles.wash} pointerEvents="none" />
          <View style={styles.edge} pointerEvents="none" />
        </>
      ) : null}
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
              {estimate ? (
                <Text style={styles.meta}>
                  ≈ {formatLiters(Math.round(estimate.liters * 10) / 10)} · ≈{' '}
                  {formatAmd(estimate.amd)}
                </Text>
              ) : null}
            </View>
            {entry.track && entry.track.length > 1 ? (
              <View style={styles.thumb}>
                <TrackPreview track={entry.track} width={120} height={56} />
              </View>
            ) : null}
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
            {station ? (
              <Text style={styles.station} numberOfLines={2}>
                {station}
              </Text>
            ) : null}
          </>
        )}
        {entry.note ? (
          <Text style={styles.note} numberOfLines={3}>
            {entry.note}
          </Text>
        ) : null}
      </View>
      <View style={styles.chevron}>
        <ChevronIcon />
      </View>
    </Tap>
  );
});

function RangeChip({ rangeKm, used }: { rangeKm: number; used?: number }) {
  return (
    <View style={[styles.chip, styles.rangeChip]}>
      <Text style={styles.chipText}>{formatKm(rangeKm)} left</Text>
      <Delta used={used} withWord />
    </View>
  );
}

/** "−15 used" in amber: the range this entry used since the previous reading. */
function Delta({ used, withWord = true }: { used?: number; withWord?: boolean }) {
  if (used === undefined || used <= 0) return null;
  return (
    <Text style={styles.delta}>
      −{formatDelta(used)}
      {withWord ? <Text style={styles.deltaWord}> used</Text> : null}
    </Text>
  );
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
  wash: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.accentWash },
  edge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.accent,
  },
  time: {
    width: 48,
    color: colors.muted,
    fontFamily: fonts.num,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  body: { flex: 1, gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  primary: {
    color: colors.text,
    fontFamily: fonts.num,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    flexShrink: 1,
  },
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
  rangeChip: { borderWidth: 1, borderColor: colors.border, paddingVertical: 4 },
  chipText: {
    color: colors.text,
    fontFamily: fonts.num,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  delta: {
    color: colors.accent,
    fontFamily: fonts.num,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  deltaWord: { color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontWeight: '500' },
  meta: {
    color: colors.muted,
    fontFamily: fonts.num,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  station: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  note: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 14,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  thumb: { borderRadius: radius.sm, overflow: 'hidden', alignSelf: 'flex-start' },
  chevron: { alignSelf: 'center', marginRight: -4 },
});
