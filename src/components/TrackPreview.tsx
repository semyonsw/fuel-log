/**
 * A route drawn as a line on a blank grid, with no map and no network.
 *
 * Two uses: the small thumbnail on a Log row (a list must not load map tiles
 * per row — the OSM-based tile servers ask apps not to, and it would make
 * scrolling stutter), and the fallback on the edit screen when the map
 * cannot load offline. Start is a hollow amber ring, end a solid dot, the
 * same marks the route text uses.
 *
 * When the trip's duration is known it sits in a small pill in whichever
 * corner the route stays farthest from, so the badge fills empty grid rather
 * than covering the line. RouteMap reuses the same pill over the real map.
 */

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, Path, Pattern, Polyline, Rect } from 'react-native-svg';

import { formatDuration } from '../lib/duration';
import { emptiestCorner, projectTrack, type Corner } from '../lib/geo';
import { colors, fonts, radius } from '../theme';
import type { TrackPoint } from '../types';

export const TrackPreview = memo(function TrackPreview({
  track,
  width,
  height,
  grid = 12,
  strokeWidth = 2,
  durationMs,
  avoid,
  badgeSize = 'sm',
}: {
  track: TrackPoint[];
  width: number;
  height: number;
  grid?: number;
  strokeWidth?: number;
  /** Trip duration for the corner badge; no badge when undefined. */
  durationMs?: number;
  /** Corners already taken by something drawn over the preview. */
  avoid?: Corner[];
  badgeSize?: BadgeSize;
}) {
  const pts = projectTrack(track, width, height, Math.max(6, strokeWidth * 3));
  if (pts.length === 0) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const svg = (
    <Svg width={width} height={height}>
      <Defs>
        <Pattern id="grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
          <Line x1="0" y1="0" x2={grid} y2="0" stroke={colors.border} strokeWidth={1} />
          <Line x1="0" y1="0" x2="0" y2={grid} stroke={colors.border} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill={colors.bg} />
      <Rect width={width} height={height} fill="url(#grid)" />
      <Polyline
        points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke={colors.accent}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle
        cx={first.x}
        cy={first.y}
        r={strokeWidth + 1.5}
        fill={colors.bg}
        stroke={colors.accent}
        strokeWidth={2}
      />
      <Circle cx={last.x} cy={last.y} r={strokeWidth + 1.5} fill={colors.accent} />
    </Svg>
  );
  if (durationMs === undefined) return svg;
  return (
    <View style={{ width, height }}>
      {svg}
      <DurationBadge
        durationMs={durationMs}
        corner={emptiestCorner(pts, width, height, avoid)}
        size={badgeSize}
      />
    </View>
  );
});

export type BadgeSize = 'sm' | 'md';

/**
 * "24 min" in a dark translucent pill, pinned to `corner` of the parent.
 * Mono like every other number in the app; muted so the route stays the
 * thing the eye lands on. The clock is drawn, not an emoji (see icons.tsx).
 */
export function DurationBadge({
  durationMs,
  corner,
  size = 'sm',
}: {
  durationMs: number;
  corner: Corner;
  size?: BadgeSize;
}) {
  const s = SIZES[size];
  const pin = {
    [corner[0] === 't' ? 'top' : 'bottom']: s.inset,
    [corner[1] === 'l' ? 'left' : 'right']: s.inset,
  };
  return (
    <View
      style={[styles.pill, { paddingHorizontal: s.padX, paddingVertical: s.padY, gap: s.gap }, pin]}
      pointerEvents="none"
    >
      <ClockGlyph size={s.icon} />
      <Text style={[styles.text, { fontSize: s.font, lineHeight: s.line }]}>
        {formatDuration(durationMs)}
      </Text>
    </View>
  );
}

const SIZES = {
  sm: { inset: 3, padX: 5, padY: 1, gap: 3, icon: 8, font: 10, line: 13 },
  md: { inset: 8, padX: 8, padY: 3, gap: 5, icon: 11, font: 12, line: 16 },
} as const;

function ClockGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Circle cx={6} cy={6} r={5} fill="none" stroke={colors.muted} strokeWidth={1.4} />
      <Path
        d="M6 3.2V6l1.9 1.3"
        fill="none"
        stroke={colors.muted}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(11,13,12,0.72)',
    borderRadius: radius.pill,
  },
  text: {
    color: colors.muted,
    fontFamily: fonts.num,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
