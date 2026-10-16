/**
 * A route drawn as a line on a blank grid, with no map and no network.
 *
 * Two uses: the small thumbnail on a Log row (a list must not load map tiles
 * per row — the OSM-based tile servers ask apps not to, and it would make
 * scrolling stutter), and the fallback on the edit screen when the map
 * cannot load offline. Start is a hollow amber ring, end a solid dot, the
 * same marks the route text uses.
 */

import { memo } from 'react';
import Svg, { Circle, Defs, Line, Pattern, Polyline, Rect } from 'react-native-svg';

import { projectTrack } from '../lib/geo';
import { colors } from '../theme';
import type { TrackPoint } from '../types';

export const TrackPreview = memo(function TrackPreview({
  track,
  width,
  height,
  grid = 12,
  strokeWidth = 2,
}: {
  track: TrackPoint[];
  width: number;
  height: number;
  grid?: number;
  strokeWidth?: number;
}) {
  const pts = projectTrack(track, width, height, Math.max(6, strokeWidth * 3));
  if (pts.length === 0) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  return (
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
});
