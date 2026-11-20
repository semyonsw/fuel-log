/**
 * The editable rows on a chat card: text, date, time and number. Each keeps
 * what is being typed in local state and reports only values that parse, so
 * "15." is not rewritten to "15" mid-typing, and follows outside changes (a
 * correction from the chat, a ± tap) without fighting the keyboard.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { t } from '../../i18n';
import { nudge, parseClock, parseDate } from '../../lib/assistant';
import { dayKey } from '../../lib/entries';
import { parseNumber } from '../../lib/numbers';
import { colors, fonts, radius, spacing, TOUCH } from '../../theme';
import { Tap } from '../ui';

/** The old → new line under a field an edit changes. */
export function Was({ text }: { text?: string }) {
  return text ? <Text style={styles.was}>{text}</Text> : null;
}

interface RowProps<T> {
  value: T;
  locked: boolean;
  was?: string;
  onChange: (v: T) => void;
}

export function TextRow({
  label,
  value,
  locked,
  was,
  onChange,
}: RowProps<string> & { label: string }) {
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          editable={!locked}
          placeholder="—"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={label}
          style={styles.textInput}
        />
      </View>
      <Was text={was} />
    </View>
  );
}

/**
 * A short typed value (date or time) that is only reported once it parses;
 * blank reports null. `isBad` marks what Approve would refuse.
 */
function ParsedRow({
  label,
  placeholder,
  a11y,
  parse,
  isBad,
  width,
  value,
  locked,
  was,
  onChange,
}: RowProps<string | null> & {
  label: string;
  placeholder: string;
  a11y: string;
  parse: (v: unknown) => string | null;
  isBad: (raw: string, parsed: string | null) => boolean;
  width: number;
}) {
  const [raw, setRaw] = useState(value ?? '');
  // Follow outside changes (a correction from the chat) without fighting the typing.
  useEffect(() => {
    if (parse(raw) !== value) setRaw(value ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const bad = raw.trim() !== '' && isBad(raw, parse(raw));
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          value={raw}
          onChangeText={(v) => {
            setRaw(v);
            const parsed = parse(v);
            if (v.trim() === '') onChange(null);
            else if (parsed) onChange(parsed);
          }}
          editable={!locked}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          selectionColor={colors.accent}
          accessibilityLabel={a11y}
          style={[styles.numInput, styles.boxed, { width }, bad && styles.bad]}
        />
      </View>
      <Was text={was} />
    </View>
  );
}

/** A day as YYYY-MM-DD. A future day is marked here and refused by Approve. */
export function DateRow(props: RowProps<string | null>) {
  return (
    <ParsedRow
      {...props}
      label={t('chat.field.date')}
      placeholder={t('chat.field.dateToday')}
      a11y={t('chat.field.dateA11y')}
      parse={parseDate}
      isBad={(_, parsed) => parsed === null || parsed > dayKey(Date.now())}
      width={140}
    />
  );
}

export function ClockRow(props: RowProps<string | null>) {
  return (
    <ParsedRow
      {...props}
      label={t('chat.field.time')}
      placeholder={t('chat.field.timeNow')}
      a11y={t('chat.field.timeA11y')}
      parse={parseClock}
      isBad={(_, parsed) => parsed === null}
      width={110}
    />
  );
}

export function NumberRow({
  label,
  unit,
  value,
  max,
  steps = [1, 0.1],
  whole = false,
  locked,
  was,
  onChange,
}: RowProps<number | null> & {
  label: string;
  unit: string;
  max: number;
  /** Big step, small step. Money steps in hundreds; dram has no decimals. */
  steps?: [number, number];
  whole?: boolean;
}) {
  const [raw, setRaw] = useState(value === null ? '' : String(value));
  // Follow outside changes (± buttons, a correction) but never rewrite what is
  // being typed: "15." parses to 15, and replacing it would eat the dot.
  useEffect(() => {
    const typed = parseNumber(raw);
    if ((typed ?? null) !== value) setRaw(value === null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const parsed = parseNumber(raw);
  const bad = raw.trim() !== '' && (parsed === undefined || parsed > max);
  const clean = (n: number) => (whole ? Math.round(n) : Math.round(n * 10) / 10);

  const btn = (d: number) => {
    const l = `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
    return (
      <Tap
        onPress={() => onChange(clean(nudge(value, d, max)))}
        disabled={locked}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${l}`}
        style={styles.nudge}
      >
        <Text style={styles.nudgeText}>{l}</Text>
      </Tap>
    );
  };

  return (
    <View style={styles.numBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.numControls}>
        {locked ? null : btn(-steps[0])}
        {locked ? null : btn(-steps[1])}
        <View style={[styles.numBox, bad && styles.bad]}>
          <TextInput
            value={raw}
            onChangeText={(v) => {
              setRaw(v);
              const n = parseNumber(v);
              if (v.trim() === '') onChange(null);
              else if (n !== undefined && n <= max) onChange(clean(n));
            }}
            editable={!locked}
            placeholder="—"
            placeholderTextColor={colors.muted}
            keyboardType={whole ? 'number-pad' : 'decimal-pad'}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            accessibilityLabel={`${label}, ${unit}`}
            style={styles.numInput}
          />
          <Text style={styles.unit}>{unit}</Text>
        </View>
        {locked ? null : btn(steps[1])}
        {locked ? null : btn(steps[0])}
      </View>
      <Was text={was} />
    </View>
  );
}

const styles = StyleSheet.create({
  fieldBlock: { gap: 4 },
  was: { color: colors.accent, fontFamily: fonts.num, fontSize: 13, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  label: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  textInput: {
    flex: 1,
    minHeight: TOUCH,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 16,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
  },
  numBlock: { gap: 6 },
  numControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nudge: {
    minWidth: 44,
    height: TOUCH,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  nudgeText: { color: colors.accent, fontFamily: fonts.num, fontSize: 13, fontWeight: '700' },
  numBox: {
    flex: 1,
    minWidth: 0,
    height: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.sm,
  },
  numInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontFamily: fonts.num,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 0,
  },
  boxed: {
    flex: 0,
    height: TOUCH,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  bad: { borderColor: colors.danger },
  unit: { color: colors.muted, fontFamily: fonts.ui, fontSize: 12, fontWeight: '600' },
});
