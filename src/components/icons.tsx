/**
 * The app's three icons, built from plain Views.
 *
 * react-native-svg isn't installed and emoji render in full colour (and differ
 * per OEM font), so the gauge and the fuel drop are drawn with borders and a
 * rotation. They sit inside a round badge so every row kind has the same left
 * edge and the kind is recognisable before the text is read.
 */

import { StyleSheet, View } from 'react-native';

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
