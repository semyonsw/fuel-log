/**
 * The Log's hero: "how much is left?", answered before anything else.
 *
 * Night Cluster styling from the prototype: a faint dot grid and odometer
 * ticks along the bottom edge make the card read as an instrument, and the
 * sparkline under the number shows the last ten readings, the newest point
 * bright, with a drop wherever a refuel fell. The texture is drawn once in SVG
 * behind the content and ignores touches.
 */

import { memo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, Pattern, Polyline, Rect } from 'react-native-svg';

import { t } from '../i18n';
import { rangeSpark } from '../lib/spark';
import { colors, fonts, radius, spacing } from '../theme';
import type { Entry } from '../types';

const SPARK_H = 44;

export const RangeCard = memo(function RangeCard({
  entries,
  range,
  todayLine,
  weekLine,
}: {
  entries: Entry[];
  range: string;
  todayLine: string;
  weekLine: string;
}) {
  const [w, setW] = useState(0);
  const [cardSize, setCardSize] = useState({ w: 0, h: 0 });
  const spark = w > 0 ? rangeSpark(entries, w, SPARK_H) : undefined;

  return (
    <View
      style={styles.card}
      onLayout={(e: LayoutChangeEvent) =>
        setCardSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
    >
      {cardSize.w > 0 ? (
        <Svg
          width={cardSize.w}
          height={cardSize.h}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Defs>
            <Pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse">
              <Circle cx="1" cy="1" r="1" fill="#222927" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#dots)" />
          {Array.from({ length: Math.floor((cardSize.w - 32) / 10) + 1 }, (_, i) => (
            <Line
              key={i}
              x1={16 + i * 10}
              x2={16 + i * 10}
              y1={cardSize.h - (i % 5 === 0 ? 11 : 6)}
              y2={cardSize.h}
              stroke={colors.faint}
              strokeWidth={1}
            />
          ))}
        </Svg>
      ) : null}
      <View style={styles.line}>
        <Text style={styles.value} adjustsFontSizeToFit numberOfLines={1}>
          {range}
        </Text>
        <Text style={styles.unit}>{t('components.range.unit')}</Text>
      </View>
      <Text style={styles.week}>{todayLine}</Text>
      <Text style={styles.week}>{weekLine}</Text>
      <View style={styles.spark} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {spark && w > 0 ? (
          <Svg width={w} height={SPARK_H}>
            <Line
              x1={0}
              y1={SPARK_H - 4}
              x2={w}
              y2={SPARK_H - 4}
              stroke={colors.border}
              strokeWidth={1}
            />
            {spark.drops.map((x, i) => (
              <Line
                key={`d${i}`}
                x1={x}
                x2={x}
                y1={14}
                y2={SPARK_H - 4}
                stroke={colors.faint}
                strokeWidth={1}
                strokeDasharray="3,3"
              />
            ))}
            <Polyline
              points={spark.line.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke={colors.accentDim}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {spark.line.map((p, i) => {
              const last = i === spark.line.length - 1;
              return (
                <Circle
                  key={`p${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={last ? 4 : 2}
                  fill={last ? colors.accent : colors.accentDim}
                />
              );
            })}
          </Svg>
        ) : null}
        {spark
          ? spark.drops.map((x, i) => <View key={i} style={[styles.drop, { left: x - 4.5 }]} />)
          : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  value: {
    color: colors.accent,
    fontFamily: fonts.num,
    fontSize: 72,
    lineHeight: 80,
    fontWeight: '700',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  unit: { color: colors.text, fontFamily: fonts.ui, fontSize: 18, fontWeight: '600' },
  week: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  spark: { height: SPARK_H, marginTop: 6 },
  drop: {
    position: 'absolute',
    top: 2,
    width: 9,
    height: 9,
    backgroundColor: colors.accent,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    transform: [{ rotate: '45deg' }],
  },
});
