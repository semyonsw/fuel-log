/**
 * Dropdowns for the form: a closed box showing the current value with a
 * chevron, and a list that opens directly underneath it.
 *
 *   Dropdown    pick one of a fixed set (fuel grade); no typing
 *   ComboField  a text field whose chevron opens the values used before
 *               (station, address, places), so a new value can still be typed
 *
 * The list opens INLINE, pushing the fields below it down, rather than as an
 * overlay: the form is one ScrollView, and an absolutely positioned panel
 * would be clipped by it or sit under the next field. It is its own nested
 * ScrollView capped at about five rows; a long name wraps instead of being
 * cut off, so fewer of those fit, which beats guessing between two truncated
 * addresses.
 *
 * Replaces the horizontal chip strips: with five place fields on a trip form
 * the strips turned the form into a wall of pills, and a chip row only shows
 * what fits across the screen.
 */

import { forwardRef, useMemo, useState, type ComponentProps } from 'react';
import { ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';

import { t } from '../i18n';
import { normalizePlace } from '../lib/places';
import { colors, fonts, radius, spacing, TOUCH, type } from '../theme';
import { ChevronIcon } from './icons';
import { Field, Tap } from './ui';

/** About five one-line rows; the list scrolls past that. */
const LIST_MAX = TOUCH * 5;

function Chevron({ open }: { open: boolean }) {
  // icons.tsx has only down/right; up is down turned over.
  return (
    <View style={open ? styles.flipped : null}>
      <ChevronIcon down size={18} color={open ? colors.accent : colors.muted} />
    </View>
  );
}

function OptionList({
  options,
  selected,
  onPick,
}: {
  options: { key: string; label: string; muted?: boolean }[];
  selected: (key: string) => boolean;
  onPick: (key: string) => void;
}) {
  return (
    <View style={styles.panel}>
      <ScrollView
        style={styles.list}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        {options.map((o, i) => {
          const on = selected(o.key);
          return (
            <Tap
              key={o.key}
              onPress={() => onPick(o.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.label}
              style={[styles.row, i > 0 && styles.rowRule, on && styles.rowOn]}
            >
              <Text style={[styles.rowText, o.muted && styles.rowMuted, on && styles.rowTextOn]}>
                {o.label}
              </Text>
            </Tap>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** A fixed-choice dropdown. With `clearLabel`, a first row sets it back to nothing. */
export function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = t('form.choose'),
  clearLabel,
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T | undefined) => void;
  placeholder?: string;
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  // '' can't collide with a real value: an empty string is never an option.
  const rows = [
    ...(clearLabel ? [{ key: '', label: clearLabel, muted: true }] : []),
    ...options.map((o) => ({ key: o.value as string, label: o.label })),
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Tap
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
        accessibilityState={{ expanded: open }}
        style={[styles.box, open && styles.boxOpen]}
      >
        <Text style={[styles.boxText, !current && styles.placeholder]} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Chevron open={open} />
      </Tap>
      {open ? (
        <OptionList
          options={rows}
          selected={(k) => (k === '' ? value === undefined : k === value)}
          onPick={(k) => {
            onChange(k === '' ? undefined : (k as T));
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

type ComboProps = Omit<ComponentProps<typeof Field>, 'value' | 'onChangeText' | 'trailing'> & {
  value: string;
  onChangeText: (v: string) => void;
  /** The remembered values for what's typed ('' = all of them), best first. */
  suggest: (query: string) => string[];
  /** A row was picked; defaults to onChangeText. */
  onPick?: (v: string) => void;
};

/**
 * A text field with a dropdown of remembered values. The chevron opens the
 * whole list (the current value highlighted, so switching is one tap); typing
 * opens it filtered to what's typed. Picking a row or pressing Next closes it.
 * Blur does NOT close it: the tap on a row blurs the input first and would
 * pull the row out from under the finger.
 */
export const ComboField = forwardRef<TextInput, ComboProps>(function ComboField(
  { value, onChangeText, suggest, onPick, onSubmitEditing, ...field },
  ref,
) {
  const [open, setOpen] = useState(false);
  // What the user typed since the list was last opened from the chevron:
  // the chevron means "show me everything", typing means "narrow it down".
  const [query, setQuery] = useState('');
  const options = useMemo(() => suggest(query), [suggest, query]);
  const any = useMemo(() => suggest('').length > 0, [suggest]);
  const own = normalizePlace(value).toLowerCase();

  return (
    <View style={styles.wrap}>
      <Field
        ref={ref}
        {...field}
        value={value}
        onChangeText={(v) => {
          onChangeText(v);
          setQuery(v);
          setOpen(true);
        }}
        onSubmitEditing={(e) => {
          setOpen(false);
          onSubmitEditing?.(e);
        }}
        trailing={
          any ? (
            <Tap
              onPress={() => {
                setQuery('');
                setOpen((o) => !o);
              }}
              accessibilityRole="button"
              accessibilityLabel={t(open ? 'form.hideSaved' : 'form.showSaved', {
                field: field.label,
              })}
              accessibilityState={{ expanded: open }}
              hitSlop={8}
              style={styles.chevronTap}
            >
              <Chevron open={open} />
            </Tap>
          ) : null
        }
      />
      {open && options.length > 0 ? (
        <OptionList
          options={options.map((o) => ({ key: o, label: o }))}
          selected={(k) => normalizePlace(k).toLowerCase() === own}
          onPick={(k) => {
            (onPick ?? onChangeText)(k);
            setQuery('');
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs + 2 },
  label: { color: colors.muted, ...type.label },
  // The closed box matches ui Field's input box, so a dropdown and a text
  // field side by side read as the same kind of control.
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  boxOpen: { borderColor: colors.accent },
  boxText: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 18 },
  placeholder: { color: colors.muted },
  chevronTap: {
    width: TOUCH,
    height: TOUCH,
    marginRight: -spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipped: { transform: [{ rotate: '180deg' }] },
  panel: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  list: { maxHeight: LIST_MAX },
  row: {
    minHeight: TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowOn: { backgroundColor: colors.accentSoft },
  rowText: { color: colors.text, ...type.body },
  rowMuted: { color: colors.muted },
  rowTextOn: { color: colors.accent, fontWeight: '600' },
});
