/**
 * The app's icons.
 *
 * The row badges (gauge, fuel drop) are plain Views with borders and a
 * rotation, as before; they sit inside a round badge so every row kind has
 * the same left edge. Line icons (tabs, AI, camera…) are SVG paths on a 24
 * grid, stroked in `currentColor`-style via a `color` prop, because emoji
 * render in full colour and differ per phone maker.
 */

import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '../theme';

/** A dashboard gauge: an open arc with a needle. Marks a bare range reading. */
export function GaugeIcon({ color = colors.muted }: { color?: string }) {
  return (
    <View style={styles.badge}>
      <View style={[styles.arc, { borderColor: color, borderBottomColor: 'transparent' }]} />
      <View style={[styles.needle, { backgroundColor: color }]} />
    </View>
  );
}

/** A fuel drop: a square with three rounded corners, turned 45°. Marks a refuel. */
export function DropIcon({ color = colors.accent }: { color?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
      <View style={[styles.drop, { backgroundColor: color }]} />
    </View>
  );
}

type IconProps = { color?: string; size?: number };

function Line({
  size = 24,
  color = colors.text,
  children,
  width = 1.8,
}: IconProps & { children: React.ReactNode; width?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

/** History tab: a clock beside list lines — the timeline. */
export function LogTabIcon(p: IconProps) {
  return (
    <Line {...p}>
      <Circle cx="6" cy="7" r="3.2" />
      <Path d="M6 5.6V7l1 .9" />
      <Path d="M12.5 7H21M3 13.5h18M3 18.5h18" />
    </Line>
  );
}

/** Summary tab: a gauge dial. */
export function SummaryTabIcon(p: IconProps) {
  return (
    <Line {...p}>
      <Path d="M3.5 17.5a8.5 8.5 0 0 1 17 0" />
      <Path d="M12 17.5l4-5" />
      <Path d="M6.4 11.6l.9.9M12 8.6v1.3M17.6 11.6l-.9.9" />
      <Path d="M3 21h18" />
    </Line>
  );
}

/** Settings tab: a gear around a hub. */
export function SettingsTabIcon(p: IconProps) {
  return (
    <Line {...p}>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Line>
  );
}

export function PlusIcon({ size = 26, color = colors.onAccent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26">
      <Path d="M13 3v20M3 13h20" stroke={color} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

/** Three four-point sparkles: the AI. Filled so it reads at a glance on the button. */
export function SparklesIcon({ size = 28, color = colors.onAccent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M10 2.5c.5 3.9 2.6 6 6.5 6.5-3.9.5-6 2.6-6.5 6.5-.5-3.9-2.6-6-6.5-6.5 3.9-.5 6-2.6 6.5-6.5z"
        fill={color}
      />
      <Path
        d="M18.5 13c.3 2 1.3 3 3.3 3.3-2 .3-3 1.3-3.3 3.3-.3-2-1.3-3-3.3-3.3 2-.3 3-1.3 3.3-3.3z"
        fill={color}
      />
      <Path
        d="M6 16.5c.2 1.4.9 2.1 2.3 2.3-1.4.2-2.1.9-2.3 2.3-.2-1.4-.9-2.1-2.3-2.3 1.4-.2 2.1-.9 2.3-2.3z"
        fill={color}
      />
    </Svg>
  );
}

/**
 * The fuel pump from the app icon (amber pump, dark window), redrawn on the 24
 * grid so the refuel button reads as "the app's own fuel thing" at a glance.
 * The window is a dark fill, not a hole, so it matches the icon on any background.
 */
export function FuelPumpIcon({
  size = 30,
  color = colors.accent,
  window = colors.bg,
}: IconProps & { window?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="4.2" y="1.3" width="11" height="20" rx="1.8" fill={color} />
      <Rect x="2.5" y="20.8" width="14.3" height="1.9" rx="0.7" fill={color} />
      <Rect x="6.1" y="3.5" width="7.1" height="5.5" rx="0.8" fill={window} />
      <Path
        d="M15 11.1h2.4v6.3a1.35 1.35 0 0 0 2.7 0V8.4M17.6 2.9l2 2"
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x="18.75" y="4" width="2.75" height="4.4" rx="0.5" fill={color} />
    </Svg>
  );
}

export function CameraIcon(p: IconProps) {
  return (
    <Line {...p}>
      <Path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <Circle cx="12" cy="13" r="3.6" />
    </Line>
  );
}

export function GalleryIcon(p: IconProps) {
  return (
    <Line {...p}>
      <Rect x="3" y="4.5" width="18" height="15" rx="2" />
      <Circle cx="8.5" cy="9.5" r="1.6" />
      <Path d="M21 16l-5-5-8 8.5" />
    </Line>
  );
}

export function SendIcon({ size = 22, color = colors.onAccent }: IconProps) {
  return (
    <Line size={size} color={color} width={2.2}>
      <Path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
    </Line>
  );
}

export function HistoryIcon(p: IconProps) {
  return (
    <Line {...p}>
      <Path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <Path d="M3 3.5V8h4.5" />
      <Path d="M12 7.5V12l3 2" />
    </Line>
  );
}

export function KeyIcon(p: IconProps) {
  return (
    <Line {...p}>
      <Circle cx="8" cy="14" r="4" />
      <Path d="M11 11l8-8M16 6l2.5 2.5M14 8l2 2" />
    </Line>
  );
}

export function ChevronIcon({
  size = 16,
  color = colors.faint,
  down = false,
}: IconProps & { down?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path
        d={down ? 'M3 6l5 5 5-5' : 'M6 3l5 5-5 5'}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CloseIcon({ size = 18, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path d="M3 3l12 12M15 3L3 15" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Record: a ring with a dot, like a dashcam's. */
export function RecordIcon({ size = 20, color = colors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx="10" cy="10" r="8" fill="none" stroke={color} strokeWidth={2} />
      <Circle cx="10" cy="10" r="4" fill={color} />
    </Svg>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <Line {...p}>
      <Path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
    </Line>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arc: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  needle: {
    position: 'absolute',
    width: 2,
    height: 8,
    borderRadius: 1,
    // Pivot at the needle's foot (the gauge centre), not its middle.
    top: 8,
    transform: [{ translateY: 4 }, { rotate: '40deg' }, { translateY: -4 }],
  },
  drop: {
    width: 11,
    height: 11,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    transform: [{ rotate: '45deg' }, { translateY: 1 }],
  },
});
