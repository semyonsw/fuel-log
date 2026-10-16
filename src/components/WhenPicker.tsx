/**
 * "When" control for the entry form, without a native date picker.
 *
 * Most entries are logged right away or a little after ("I parked 15 minutes
 * ago"), so quick chips cover the common cases in one tap, and hour/minute
 * steppers handle the rest. Holding a stepper repeats, so getting from :00 to
 * :45 doesn't take 45 taps. Steps add/subtract real time, so minutes roll over
 * into the hour and hours into the day naturally.
 */

import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, TOUCH } from '../theme';
import { whenLabel } from './format';
import { Chip, SectionLabel, Tap } from './ui';

const MIN = 60_000;
const HOUR = 60 * MIN;

export function WhenPicker({ at, onChange }: { at: number; onChange: (at: number) => void }) {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={styles.wrap}>
      <SectionLabel>When</SectionLabel>
      <Text style={styles.label}>{whenLabel(at, Date.now())}</Text>
      <View style={styles.steppers}>
        <Stepper
          value={pad(d.getHours())}
          name="hour"
          onStep={(dir) => onChange(at + dir * HOUR)}
        />
        <Text style={styles.colon}>:</Text>
        <Stepper
          value={pad(d.getMinutes())}
          name="minute"
          onStep={(dir) => onChange(at + dir * MIN)}
        />
      </View>
      <View style={styles.chips}>
        <Chip label="Now" onPress={() => onChange(Date.now())} />
        <Chip label="−15 min" onPress={() => onChange(at - 15 * MIN)} />
        <Chip label="−1 h" onPress={() => onChange(at - HOUR)} />
        <Chip label="Yesterday" onPress={() => onChange(at - 24 * HOUR)} />
      </View>
    </View>
  );
}

function Stepper({
  value,
  name,
  onStep,
}: {
  value: string;
  name: string;
  onStep: (dir: 1 | -1) => void;
}) {
  // The latest onStep, so a held repeat keeps stepping from the current time
  // rather than from the value captured when the press began.
  const stepRef = useRef(onStep);
  useEffect(() => {
    stepRef.current = onStep;
  });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const button = (dir: 1 | -1) => (
    <Tap
      onPress={() => onStep(dir)}
      onLongPress={() => {
        stop();
        timer.current = setInterval(() => stepRef.current(dir), 90);
      }}
      onPressOut={stop}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${dir > 0 ? 'Increase' : 'Decrease'} ${name}`}
      style={styles.stepBtn}
    >
      <Text style={styles.stepGlyph}>{dir > 0 ? '+' : '−'}</Text>
    </Tap>
  );

  return (
    <View style={styles.stepper}>
      {button(-1)}
      <Text style={styles.stepValue}>{value}</Text>
      {button(1)}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { color: colors.text, fontSize: 22, fontWeight: '700' },
  steppers: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  colon: { color: colors.muted, fontSize: 24, fontWeight: '700' },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepBtn: { width: TOUCH + 4, height: TOUCH + 4, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { color: colors.accent, fontSize: 26, fontWeight: '600' },
  stepValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
