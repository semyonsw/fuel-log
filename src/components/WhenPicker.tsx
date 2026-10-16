/**
 * "When" control for the entry form.
 *
 * Most entries are logged right away or a little after ("I parked 15 minutes
 * ago"), so quick chips cover the common cases in one tap, and hour/minute
 * steppers handle the rest. A refuel from weeks ago (entered from the
 * spending history) is one tap on the date, which opens Android's own
 * calendar; the time of day is kept, and the future is not offered. Holding a stepper repeats, so getting from :00 to
 * :45 doesn't take 45 taps. Steps add/subtract real time, so minutes roll over
 * into the hour and hours into the day naturally.
 */

import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dayKey, dayLabel, formatTime } from '../lib/entries';
import { colors, fonts, radius, spacing, TOUCH } from '../theme';
import { ChevronIcon } from './icons';
import { Chip, SectionLabel, Tap } from './ui';

const MIN = 60_000;
const HOUR = 60 * MIN;

export function WhenPicker({ at, onChange }: { at: number; onChange: (at: number) => void }) {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={styles.wrap}>
      <SectionLabel>When</SectionLabel>
      <Tap
        onPress={() => pickDate(at, onChange)}
        accessibilityRole="button"
        accessibilityLabel={`Date: ${dayLabel(dayKey(at), Date.now())}. Change date`}
        style={styles.dateRow}
      >
        <Text style={styles.label}>{dayLabel(dayKey(at), Date.now())}</Text>
        <Text style={[styles.label, styles.labelNum]}>{formatTime(at)}</Text>
        <ChevronIcon down color={colors.muted} />
      </Tap>
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

/** Opens the calendar on the entry's day; keeps its hour and minute. */
function pickDate(at: number, onChange: (at: number) => void) {
  DateTimePickerAndroid.open({
    value: new Date(at),
    mode: 'date',
    maximumDate: new Date(),
    onChange: (event, date) => {
      if (event.type !== 'set' || !date) return;
      const next = new Date(at);
      next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      onChange(next.getTime());
    },
  });
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
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: TOUCH - 8 },
  label: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  labelNum: { fontFamily: fonts.num, fontVariant: ['tabular-nums'] },
  steppers: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  colon: { color: colors.muted, fontFamily: fonts.num, fontSize: 24, fontWeight: '700' },
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
  stepGlyph: { color: colors.accent, fontFamily: fonts.ui, fontSize: 26, fontWeight: '600' },
  stepValue: {
    color: colors.text,
    fontFamily: fonts.num,
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
