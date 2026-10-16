/**
 * The two floating buttons, bottom-right under the thumb: AI chat and "+".
 *
 * Same 64 dp circle for both so neither reads as secondary. The AI one says
 * "this is the new, smart thing" with motion rather than words: a soft amber
 * halo that breathes and a slow sparkle twinkle. Motion runs on the native
 * driver (opacity/scale only) so it costs nothing while the list scrolls, and
 * it stops when the OS asks for reduced motion.
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme';
import { PlusIcon, SparklesIcon } from './icons';
import { Tap } from './ui';

const SIZE = 64;

export function Fabs({ onAi, onAdd }: { onAi: () => void; onAdd: () => void }) {
  return (
    <View style={styles.row} pointerEvents="box-none">
      <AiFab onPress={onAi} />
      <Tap
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Add entry"
        style={styles.fab}
      >
        <PlusIcon />
      </Tap>
    </View>
  );
}

function AiFab({ onPress }: { onPress: () => void }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;
  const [still, setStill] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setStill)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setStill);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(600),
          Animated.timing(twinkle, {
            toValue: 1,
            duration: 500,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(twinkle, {
            toValue: 0,
            duration: 700,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(1000),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still, pulse, twinkle]);

  const halo = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] }) }],
  };
  const sparkle = {
    transform: [
      { scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) },
      { rotate: twinkle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '12deg'] }) },
    ],
  };

  return (
    <View style={styles.aiWrap}>
      <Animated.View pointerEvents="none" style={[styles.halo, halo]} />
      <Animated.View pointerEvents="none" style={[styles.halo2, { opacity: pulse }]} />
      <Tap
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="AI chat"
        style={[styles.fab, styles.ai]}
      >
        <Animated.View style={sparkle}>
          <SparklesIcon />
        </Animated.View>
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'center',
  },
  fab: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  aiWrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  // The AI button is the amber disc with a warm outer ring, so it glows rather than shouts.
  ai: { backgroundColor: '#FFC24D', borderWidth: 2, borderColor: colors.accent },
  halo: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.accent,
  },
  halo2: {
    position: 'absolute',
    width: SIZE + 22,
    height: SIZE + 22,
    borderRadius: (SIZE + 22) / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(245,165,36,0.45)',
  },
});
