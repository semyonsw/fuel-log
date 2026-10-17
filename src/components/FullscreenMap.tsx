/**
 * A trip's route filling the whole screen, opened from the edit screen's map.
 *
 * Fingers alone are awkward on a 220-point strip, so this view adds buttons:
 * + and − step one zoom level (lib/mapControls), and "whole route" fits the
 * camera back to the track after wandering off. The compass shows only once
 * the map is rotated; tapping it turns north back up. X or Android back
 * closes it.
 *
 * Layout keeps every control out of the route's way and off the system bars
 * (the app is edge-to-edge): X top-right, compass top-left, the button stack
 * on the right edge's middle where a thumb rests, the trip duration
 * bottom-left and the OpenStreetMap attribution bottom-right. The camera
 * padding reserves the same strips so the fitted route never sits under them.
 */

import { Camera, Map, type CameraRef, type MapRef } from '@maplibre/maplibre-react-native';
import { useMemo, useRef } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../i18n';
import { trackDurationMs } from '../lib/duration';
import { trackBounds } from '../lib/geo';
import { stepZoom } from '../lib/mapControls';
import { colors, radius, spacing, TOUCH } from '../theme';
import type { TrackPoint } from '../types';
import { CloseIcon, RecenterIcon, ZoomInIcon, ZoomOutIcon } from './icons';
import { MAP_STYLE, RouteLayers } from './RouteLayers';
import { DurationBadge } from './TrackPreview';
import { Tap } from './ui';

const EDGE = spacing.md;
/** Room the fitted route leaves for the controls column on the right. */
const CONTROLS_W = TOUCH + 2 * EDGE;

export function FullscreenMap({
  track,
  visible,
  onClose,
}: {
  track: TrackPoint[];
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const bounds = useMemo(() => trackBounds(track), [track]);
  const durationMs = useMemo(() => trackDurationMs(track), [track]);
  const padding = {
    top: insets.top + TOUCH + 2 * EDGE,
    bottom: insets.bottom + 2 * TOUCH,
    left: 2 * EDGE,
    right: CONTROLS_W,
  };

  async function zoom(step: 1 | -1) {
    let z = NaN;
    try {
      z = (await mapRef.current?.getZoom()) ?? NaN;
    } catch {
      // The map hasn't reported a camera yet; stepZoom has a fallback.
    }
    cameraRef.current?.zoomTo(stepZoom(z, step), { duration: 200 });
  }

  function recenter() {
    if (bounds) cameraRef.current?.fitBounds(bounds, { padding, duration: 400 });
  }

  if (!bounds) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.root}>
        <Map
          ref={mapRef}
          style={styles.map}
          mapStyle={MAP_STYLE}
          logo={false}
          attribution
          attributionPosition={{ bottom: insets.bottom + spacing.sm, right: spacing.sm }}
          compass
          compassPosition={{ top: insets.top + EDGE, left: EDGE }}
        >
          <Camera ref={cameraRef} initialViewState={{ bounds, padding }} />
          <RouteLayers track={track} />
        </Map>

        {durationMs !== undefined ? (
          <View
            pointerEvents="none"
            style={[styles.badgeBox, { top: insets.top + EDGE, bottom: insets.bottom + EDGE }]}
          >
            <DurationBadge durationMs={durationMs} corner="bl" size="md" />
          </View>
        ) : null}

        <Tap
          onPress={onClose}
          style={[styles.button, styles.close, { top: insets.top + EDGE }]}
          accessibilityRole="button"
          accessibilityLabel={t('app.map.close')}
          hitSlop={8}
        >
          <CloseIcon />
        </Tap>

        {/* box-none: the strip around the buttons still drags the map. */}
        <View style={styles.stack} pointerEvents="box-none">
          <Tap
            onPress={() => void zoom(1)}
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel={t('app.map.zoomIn')}
          >
            <ZoomInIcon />
          </Tap>
          <Tap
            onPress={() => void zoom(-1)}
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel={t('app.map.zoomOut')}
          >
            <ZoomOutIcon />
          </Tap>
          <Tap
            onPress={recenter}
            style={[styles.button, styles.recenter]}
            accessibilityRole="button"
            accessibilityLabel={t('app.map.recenter')}
          >
            <RecenterIcon />
          </Tap>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  map: { flex: 1 },
  badgeBox: { position: 'absolute', left: EDGE - 8, right: 0 },
  button: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(21,25,24,0.88)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  close: { position: 'absolute', right: EDGE },
  stack: {
    position: 'absolute',
    right: EDGE,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  recenter: { marginTop: spacing.sm },
});
