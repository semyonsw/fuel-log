/**
 * A trip's route on a real map, for the edit screen.
 *
 * MapLibre with OpenFreeMap's dark style: open source, no API key, no
 * billing, OpenStreetMap data (Armenia is well mapped there). Tiles need a
 * connection; if the style cannot load, the same route is drawn as a plain
 * line on a blank grid instead, so the route is never missing.
 */

import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { trackBounds } from '../lib/geo';
import { colors, fonts, radius, spacing } from '../theme';
import type { TrackPoint } from '../types';
import { TrackPreview } from './TrackPreview';

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const HEIGHT = 220;

export function RouteMap({ track }: { track: TrackPoint[] }) {
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const bounds = useMemo(() => trackBounds(track), [track]);
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
            <TrackPreview track={track} width={width} height={HEIGHT} grid={20} strokeWidth={3} />
            <Text style={styles.offline}>Offline: map unavailable, route shown on a grid</Text>
          </>
        ) : null
      ) : (
        <Map
          style={styles.map}
          mapStyle={MAP_STYLE}
          attribution
          logo={false}
          onDidFailLoadingMap={() => setFailed(true)}
        >
          <Camera
            initialViewState={{ bounds, padding: { top: 32, bottom: 32, left: 32, right: 32 } }}
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
