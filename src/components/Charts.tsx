/**
 * The Summary's two hand-drawn charts, in SVG like the range sparkline, so no
 * chart library is shipped for two pictures.
 *
 *   MonthBars   spending per calendar month, fuel (amber) under other costs
 *               (grey) in one stacked bar, so the bar's height is what the
 *               car cost that month and the amber part is the fuel in it.
 *               One dashed line marks a round top value; exact figures live
 *               in the tiles and the "This month" card, not on the bars.
 *   TrendLine   one value per refuel (price per litre, km per litre), in
 *               order, the newest point bright as on the range card, with
 *               the newest value in the header and the low / high under it.
 *
 * Both measure their own width (onLayout) and draw nothing until they know
 * it. Geometry comes from lib/stats so it is tested without a renderer; this
 * file only turns it into shapes. A chart with nothing to say shows a muted
 * line instead of an empty frame.
 */

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Rect } from 'react-native-svg';

import { t, type StringKey } from '../i18n';
import { formatAmd } from '../lib/numbers';
import { linePoints, niceCeil, type MonthSpending } from '../lib/stats';
import { colors, fonts, radius, spacing } from '../theme';

const BARS_H = 120;
const LINE_H = 72;
// Room above the tallest bar for the top-line label.
const BARS_TOP = 18;

export function MonthBars({ months }: { months: MonthSpending[] }) {
  const [w, setW] = useState(0);
  const top = niceCeil(Math.max(0, ...months.map((m) => m.fuelAmd + m.otherAmd)));
  const slot = months.length > 0 ? w / months.length : 0;
  const barW = Math.min(28, slot * 0.56);
  const span = BARS_H - BARS_TOP;
  const h = (amd: number) => (top > 0 ? (amd / top) * span : 0);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('stats.chart.monthly')}</Text>
        <View style={styles.legend}>
          <Swatch color={colors.accent} label={t('stats.chart.fuel')} />
          <Swatch color={colors.muted} label={t('stats.chart.other')} />
        </View>
      </View>
      {top === 0 ? (
        <Text style={styles.muted}>{t('stats.chart.noSpending', { n: months.length })}</Text>
      ) : (
        <>
          <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
            {w > 0 ? (
              <Svg width={w} height={BARS_H}>
                <Line
                  x1={0}
                  x2={w}
                  y1={BARS_TOP}
                  y2={BARS_TOP}
                  stroke={colors.faint}
                  strokeWidth={1}
                  strokeDasharray="3,3"
                />
                <Line x1={0} x2={w} y1={BARS_H} y2={BARS_H} stroke={colors.border} />
                {months.map((m, i) => {
                  const x = i * slot + (slot - barW) / 2;
                  const fuel = h(m.fuelAmd);
                  const other = h(m.otherAmd);
                  return (
                    <G key={m.key}>
                      {fuel > 0 ? (
                        <Rect
                          x={x}
                          y={BARS_H - fuel}
                          width={barW}
                          height={fuel}
                          fill={colors.accent}
                        />
                      ) : null}
                      {other > 0 ? (
                        <Rect
                          x={x}
                          y={BARS_H - fuel - other}
                          width={barW}
                          height={other}
                          fill={colors.muted}
                        />
                      ) : null}
                    </G>
                  );
                })}
              </Svg>
            ) : null}
            <Text style={styles.topLabel}>{formatAmd(top)}</Text>
          </View>
          <View style={styles.axis}>
            {months.map((m, i) => (
              <Text
                key={m.key}
                style={[styles.axisLabel, i === months.length - 1 && styles.axisNow]}
                numberOfLines={1}
              >
                {t(`lib.month.${m.month}` as StringKey)}
              </Text>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.swatchRow}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.swatchLabel}>{label}</Text>
    </View>
  );
}

/**
 * One value per refuel. Fewer than two points is not a trend: the header
 * still shows the one value there is, and `empty` says what is missing.
 */
export function TrendLine({
  title,
  values,
  format,
  empty,
}: {
  title: string;
  values: number[];
  format: (n: number) => string;
  empty: string;
}) {
  const [w, setW] = useState(0);
  const points = w > 0 && values.length >= 2 ? linePoints(values, w, LINE_H) : [];
  const last = values[values.length - 1];

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {last !== undefined ? <Text style={styles.latest}>{format(last)}</Text> : null}
      </View>
      {values.length < 2 ? (
        <Text style={styles.muted}>{empty}</Text>
      ) : (
        <>
          <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
            {points.length > 0 ? (
              <Svg width={w} height={LINE_H}>
                <Polyline
                  points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke={colors.accentDim}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {points.map((p, i) => {
                  const newest = i === points.length - 1;
                  return (
                    <Circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={newest ? 4 : 2}
                      fill={newest ? colors.accent : colors.accentDim}
                    />
                  );
                })}
              </Svg>
            ) : (
              <View style={{ height: LINE_H }} />
            )}
          </View>
          <Text style={styles.range}>
            {format(Math.min(...values))} – {format(Math.max(...values))}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  title: { color: colors.text, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700' },
  latest: { color: colors.accent, fontFamily: fonts.num, fontSize: 15, fontWeight: '700' },
  legend: { flexDirection: 'row', gap: spacing.md },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  swatchLabel: { color: colors.muted, fontFamily: fonts.ui, fontSize: 12, fontWeight: '600' },
  topLabel: {
    position: 'absolute',
    top: 0,
    right: 0,
    color: colors.muted,
    fontFamily: fonts.num,
    fontSize: 11,
    fontWeight: '500',
  },
  axis: { flexDirection: 'row', marginTop: -spacing.xs },
  axisLabel: {
    flex: 1,
    textAlign: 'center',
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 12,
    fontWeight: '600',
  },
  axisNow: { color: colors.text },
  range: { color: colors.muted, fontFamily: fonts.num, fontSize: 13, fontWeight: '500' },
  muted: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
});
