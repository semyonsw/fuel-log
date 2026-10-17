/**
 * A trip's route on a real map, for the edit screen.
 *
 * MapLibre with OpenFreeMap's dark style: open source, no API key, no
 * billing, OpenStreetMap data (Armenia is well mapped there). Tiles need a
 * connection; if the style cannot load, the same route is drawn as a plain
 * line on a blank grid instead, so the route is never missing.
 *
 * A GPS trip's duration rides in a pill in the corner the route avoids. The
 * corner is found on the offline projection of the same track at the same
 * size and camera padding: the map's Web Mercator fit differs from it only
 * slightly at city scale, and the map's own camera is never queried. On the
 * map the bottom-right belongs to the attribution button and the top-right
 * to the full-screen button; on the grid the bottom-left belongs to the
 * offline note.
 *
 * The map sits inside the edit screen's ScrollView. Android lets a ScrollView
 * take over a gesture its child started once the fingers move far enough, so
 * a pinch whose fingers slid past the map's edge became a page scroll. The
 * raw touch events (which reach this wrapper whoever handles them) report
 * whether a finger that started here is still down, via `onHeldChange`, and
 * the form turns its scrolling off for that long (lib/mapControls).
 *
 * The full-screen button is only on the real map: offline, the full-screen
 * map could not load its tiles either.
 */

import { Camera, Map } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { t } from '../i18n';
import { trackDurationMs } from '../lib/duration';
import { emptiestCorner, projectTrack, trackBounds } from '../lib/geo';
import { mapHeldAfter, type MapTouchKind } from '../lib/mapControls';
import { colors, fonts, radius, spacing } from '../theme';
import type { TrackPoint } from '../types';
import { FullscreenMap } from './FullscreenMap';
import { ExpandIcon } from './icons';
import { MAP_STYLE, RouteLayers } from './RouteLayers';
import { DurationBadge, TrackPreview } from './TrackPreview';
import { Tap } from './ui';

const HEIGHT = 220;
const CAMERA_PADDING = 32;

export function RouteMap({
  track,
  onHeldChange,
}: {
  track: TrackPoint[];
  /** True while a finger that went down on the map is still down. */
  onHeldChange?: (held: boolean) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  const [width, setWidth] = useState(0);
  const bounds = useMemo(() => trackBounds(track), [track]);
  const durationMs = useMemo(() => trackDurationMs(track), [track]);
  const mapCorner = useMemo(
    () =>
      width > 0
        ? emptiestCorner(projectTrack(track, width, HEIGHT, CAMERA_PADDING), width, HEIGHT, [
            'br',
            'tr',
          ])
        : undefined,
    [track, width],
  );

  // Unmounting mid-gesture (the kind switched away from Trip) must not leave
  // the form unable to scroll.
  useEffect(() => () => onHeldChange?.(false), [onHeldChange]);

  if (!bounds || track.length < 2) return null;

  const touch = (kind: MapTouchKind) => (e: GestureResponderEvent) =>
    onHeldChange?.(mapHeldAfter(kind, e.nativeEvent.touches.length));

  // The full-screen map renders beside the wrapper, not in it: React bubbles
  // touches along the component tree, so inside it the Modal's touches would
  // reach the hold handlers above.
  return (
    <>
      <View
        style={styles.wrap}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onTouchStart={touch('start')}
        onTouchEnd={touch('end')}
        onTouchCancel={touch('cancel')}
      >
        {failed ? (
          width > 0 ? (
            <>
              <TrackPreview
                track={track}
                width={width}
                height={HEIGHT}
                grid={20}
                strokeWidth={3}
                durationMs={durationMs}
                avoid={['bl']}
                badgeSize="md"
              />
              <Text style={styles.offline}>{t('app.map.offline')}</Text>
            </>
          ) : null
        ) : (
          <>
            <Map
              style={styles.map}
              mapStyle={MAP_STYLE}
              attribution
              logo={false}
              onDidFailLoadingMap={() => setFailed(true)}
            >
              <Camera
                initialViewState={{
                  bounds,
                  padding: {
                    top: CAMERA_PADDING,
                    bottom: CAMERA_PADDING,
                    left: CAMERA_PADDING,
                    right: CAMERA_PADDING,
                  },
                }}
              />
              <RouteLayers track={track} />
            </Map>
            {durationMs !== undefined && mapCorner ? (
              <DurationBadge durationMs={durationMs} corner={mapCorner} size="md" />
            ) : null}
            <Tap
              onPress={() => setFull(true)}
              style={styles.expand}
              accessibilityRole="button"
              accessibilityLabel={t('app.map.expand')}
              hitSlop={6}
            >
              <ExpandIcon />
            </Tap>
          </>
        )}
      </View>
      {full ? <FullscreenMap track={track} visible onClose={() => setFull(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: HEIGHT,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  map: { flex: 1 },
  expand: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,13,12,0.72)',
  },
  offline: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.sm,
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 12,
    fontWeight: '500',
  },
});
