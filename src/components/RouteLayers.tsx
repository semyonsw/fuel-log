/**
 * The route as map layers: an amber line, a hollow dot where the trip started
 * and a filled one where it ended. Shared by the edit screen's map and the
 * full-screen one so the two can never draw the same trip differently.
 */

import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';

import { colors } from '../theme';
import type { TrackPoint } from '../types';

/** OpenFreeMap's dark style; why this provider is in RouteMap.tsx. */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';

export function RouteLayers({ track }: { track: TrackPoint[] }) {
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
  return (
    <>
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
    </>
  );
}
