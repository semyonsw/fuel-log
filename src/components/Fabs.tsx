/**
 * The floating buttons, bottom-right under the thumb, left to right: AI chat,
 * expense (wallet), service (wrench), refuel (the fuel pump) and "+" (trip /
 * range).
 *
 * Each kind of spending gets its own button so logging one is a single tap
 * straight into a form for just that kind, and "+" stays about driving. The
 * fuel button is the app icon in miniature (amber pump on the dark disc) so it
 * is recognisable without a label; wallet and wrench share that dark disc, so
 * the three "money" buttons read as a set between the AI and "+".
 *
 * Same circle for all so none reads as secondary. 56 dp, not the usual 64:
 * five of them plus gaps and the edge margin have to fit across a 360 dp
 * phone (5 × 56 + 4 × 10 + 16 = 336), and 56 is still above the 48 dp touch
 * minimum. The AI one says
 * "this is the new, smart thing" with motion rather than words: a soft amber
 * halo that breathes and a slow sparkle twinkle. Motion runs on the native
 * driver (opacity/scale only) so it costs nothing while the list scrolls, and
 * it stops when the OS asks for reduced motion.
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { colors, spacing } from '../theme';
import { FuelPumpIcon, PlusIcon, SparklesIcon, WalletIcon, WrenchIcon } from './icons';
import { Tap } from './ui';

const SIZE = 56;

export function Fabs({
  onAi,
  onExpense,
  onService,
  onRefuel,
  onAdd,
}: {
  onAi: () => void;
  onExpense: () => void;
  onService: () => void;
  onRefuel: () => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.row} pointerEvents="box-none">
      <AiFab onPress={onAi} />
      <Tap
        onPress={onExpense}
        accessibilityRole="button"
        accessibilityLabel={t('components.fab.expense')}
        style={[styles.fab, styles.dark]}
      >
        <WalletIcon size={26} color={colors.accent} width={2} />
      </Tap>
      <Tap
        onPress={onService}
        accessibilityRole="button"
        accessibilityLabel={t('components.fab.service')}
        style={[styles.fab, styles.dark]}
      >
        <WrenchIcon size={24} color={colors.accent} width={2} />
      </Tap>
      <Tap
        onPress={onRefuel}
        accessibilityRole="button"
        accessibilityLabel={t('components.fab.refuel')}
        style={[styles.fab, styles.dark]}
      >
        <FuelPumpIcon size={26} />
      </Tap>
      <Tap
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={t('components.fab.add')}
        style={styles.fab}
      >
        <PlusIcon size={24} />
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
        accessibilityLabel={t('components.fab.ai')}
        style={[styles.fab, styles.ai]}
      >
        <Animated.View style={sparkle}>
          <SparklesIcon size={24} />
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
    gap: 10,
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
  dark: { backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.accent },
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
    width: SIZE + 18,
    height: SIZE + 18,
    borderRadius: (SIZE + 18) / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(245,165,36,0.45)',
  },
});
