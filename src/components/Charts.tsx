/**
 * The Summary's statistics, hand-drawn in SVG like the range sparkline, so no
 * chart library is shipped for a few pictures.
 *
 *   MonthBars   one figure per calendar month (fuel money, km driven). The
 *               current month is bright amber and the rest dim, as on the
 *               range card, with its value in the header; one dashed line
 *               marks a round top value. Exact figures for the other months
 *               are not printed on the bars: six labels do not fit 360dp.
 *   TrendLine   one value per refuel, in order, the newest point bright,
 *               the newest value in the header and the low / high under it.
 *   RouteTable  the most driven From → To pairs, two lines a row so a long
 *               place name wraps instead of squeezing the numbers.
 *
 * Charts measure their own width (onLayout) and draw nothing until they know
 * it. Geometry comes from lib/stats so it is tested without a renderer; this
 * file only turns it into shapes. A chart with nothing to say shows a muted
 * line instead of an empty frame.
 */

import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';

import { plural, t, type StringKey } from '../i18n';
import { formatAmd, formatKm } from '../lib/numbers';
import { linePoints, niceCeil, type MonthTotal, type RouteStat } from '../lib/stats';
import { colors, fonts, radius, spacing } from '../theme';

const BARS_H = 120;
const LINE_H = 72;
// Room above the tallest bar for the top-line label.
const BARS_TOP = 18;
const MAX_BAR_W = 28;
const BAR_FILL = 0.56;

export function MonthBars({
  title,
  months,
  value,
  format,
  empty,
  footer,
}: {
  title: string;
  months: MonthTotal[];
  value: (m: MonthTotal) => number;
  format: (n: number) => string;
  empty: string;
  footer?: ReactNode;
}) {
  const [w, setW] = useState(0);
  const values = months.map(value);
  const top = niceCeil(Math.max(0, ...values));
  const slot = months.length > 0 ? w / months.length : 0;
  const barW = Math.min(MAX_BAR_W, slot * BAR_FILL);
  const span = BARS_H - BARS_TOP;
  const last = values[values.length - 1];

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {top > 0 && last !== undefined ? <Text style={styles.latest}>{format(last)}</Text> : null}
      </View>
      {top === 0 ? (
        <Text style={styles.muted}>{empty}</Text>
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
                {values.map((v, i) => {
                  const h = (v / top) * span;
                  if (!(h > 0)) return null;
                  return (
                    <Rect
                      key={months[i].start}
                      x={i * slot + (slot - barW) / 2}
                      y={BARS_H - h}
                      width={barW}
                      height={h}
                      rx={2}
                      fill={i === values.length - 1 ? colors.accent : colors.accentDim}
                    />
                  );
                })}
              </Svg>
            ) : (
              <View style={{ height: BARS_H }} />
            )}
            <Text style={styles.topLabel}>{format(top)}</Text>
          </View>
          <View style={styles.axis}>
            {months.map((m, i) => (
              <Text
                key={m.start}
                style={[styles.axisLabel, i === months.length - 1 && styles.axisNow]}
                numberOfLines={1}
              >
                {t(`lib.month.${new Date(m.start).getMonth()}` as StringKey)}
              </Text>
            ))}
          </View>
          {footer}
        </>
      )}
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

/** A route's cost is "—" when none of its trips could be priced, never 0 AMD. */
export function RouteTable({ routes }: { routes: RouteStat[] }) {
  if (routes.length === 0) {
    return <Text style={styles.muted}>{t('stats.routes.empty')}</Text>;
  }
  return (
    <View style={styles.list}>
      {routes.map((r, i) => {
        const trips = plural('stats.routes.trips', r.count);
        const cost = r.amd > 0 ? `≈ ${formatAmd(r.amd)}` : '—';
        return (
          <View
            key={`${r.from}\u0000${r.to}`}
            style={[styles.routeRow, i > 0 && styles.divider]}
            accessible
            accessibilityLabel={t('stats.routes.a11y', {
              from: r.from,
              to: r.to,
              trips,
              km: formatKm(r.km),
              cost,
            })}
          >
            <View style={styles.routeTop}>
              <Text style={styles.routeName} numberOfLines={2}>
                {r.from} → {r.to}
              </Text>
              <Text style={styles.routeCount}>{trips}</Text>
            </View>
            <Text style={styles.routeMore}>
              {formatKm(r.km)} · {cost}
            </Text>
          </View>
        );
      })}
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
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  routeRow: {
    justifyContent: 'center',
    gap: 2,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  routeTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  routeName: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  routeCount: { color: colors.accent, fontFamily: fonts.num, fontSize: 14, fontWeight: '700' },
  routeMore: { color: colors.muted, fontFamily: fonts.num, fontSize: 14, fontWeight: '600' },
});
