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
 * map the bottom-right belongs to the attribution button; on the grid the
 * bottom-left belongs to the offline note.
 */

import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { t } from '../i18n';
import { trackDurationMs } from '../lib/duration';
import { emptiestCorner, projectTrack, trackBounds } from '../lib/geo';
import { colors, fonts, radius, spacing } from '../theme';
import type { TrackPoint } from '../types';
import { DurationBadge, TrackPreview } from './TrackPreview';

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const HEIGHT = 220;
const CAMERA_PADDING = 32;

export function RouteMap({ track }: { track: TrackPoint[] }) {
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const bounds = useMemo(() => trackBounds(track), [track]);
  const durationMs = useMemo(() => trackDurationMs(track), [track]);
  const mapCorner = useMemo(
    () =>
      width > 0
        ? emptiestCorner(projectTrack(track, width, HEIGHT, CAMERA_PADDING), width, HEIGHT, ['br'])
        : undefined,
    [track, width],
  );
  const line = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: track.map((p) => [p.lon, p.lat]) },
    }),
    [track],
  );
  const ends = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: [track[0], track[track.length - 1]].map((p, i) => ({
        type: 'Feature' as const,
        properties: { end: i },
        geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
      })),
    }),
    [track],
  );

  if (!bounds || track.length < 2) return null;

  return (
    <View
      style={styles.wrap}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
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
            <GeoJSONSource id="route" data={line}>
              <Layer
                id="route-line"
                type="line"
                paint={{ 'line-color': colors.accent, 'line-width': 4 }}
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              />
            </GeoJSONSource>
            <GeoJSONSource id="ends" data={ends}>
              <Layer
                id="ends-dot"
                type="circle"
                paint={{
                  'circle-radius': 6,
                  'circle-color': ['case', ['==', ['get', 'end'], 0], colors.bg, colors.accent],
                  'circle-stroke-color': colors.accent,
                  'circle-stroke-width': 2.5,
                }}
              />
            </GeoJSONSource>
          </Map>
          {durationMs !== undefined && mapCorner ? (
            <DurationBadge durationMs={durationMs} corner={mapCorner} size="md" />
          ) : null}
        </>
      )}
    </View>
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
