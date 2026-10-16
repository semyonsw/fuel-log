/**
 * Shared building blocks: the small vocabulary every screen is assembled from.
 *
 *   Tap         Pressable with the app's one pressed look (dim + slight shrink)
 *   Card        a surface panel
 *   Chip        a pill that is tappable, optionally "on"
 *   Segmented   equal-width options in one track (Trip/Range/Refuel, Week/Month/All)
 *   Field       label + TextInput + error line, 56 high so it's thumb-friendly
 *   Button      full-width primary / ghost / danger action
 *
 * Kept deliberately unparameterised: the variants here are the ones the screens
 * actually use, so a new control is a composition, not new spacing decisions.
 */

import { forwardRef, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, TOUCH, type } from '../theme';

/**
 * Pressable with pressed feedback. Android ripple alone is easy to miss on a
 * dark surface in daylight, so we also dim and shrink a little.
 */
export function Tap({
  style,
  children,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [
        style,
        pressed && styles.pressed,
        rest.disabled ? styles.disabledTap : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({
  label,
  onPress,
  active = false,
  tone = 'default',
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  /** `place` chips get a pin glyph so they read as "reuse a remembered place". */
  tone?: 'default' | 'place';
  accessibilityLabel?: string;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      // The visible pill is 40 high to keep rows of chips compact; hitSlop
      // brings the touch target up to 48.
      hitSlop={4}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {tone === 'place' ? '⌖ ' : ''}
        {label}
      </Text>
    </Tap>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segTrack} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tap
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.seg, on && styles.segOn]}
          >
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </Tap>
        );
      })}
    </View>
  );
}

export const Field = forwardRef<
  TextInput,
  TextInputProps & {
    label: string;
    /** Unit shown inside the field's right edge ("km", "L", "AMD"). */
    suffix?: string;
    error?: string;
    /** Rendered at the right of the label row, e.g. a remove button. */
    accessory?: ReactNode;
  }
>(function Field({ label, suffix, error, accessory, style, ...input }, ref) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.label}>{label}</Text>
        {accessory}
      </View>
      <View style={[styles.inputWrap, error ? styles.inputWrapError : null]}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          style={[styles.input, style]}
          accessibilityLabel={label}
          {...input}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

export function Button({
  label,
  onPress,
  variant = 'primary',
  dim = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  /**
   * Looks disabled but still fires. The form's Save stays pressable while
   * invalid so the press can reveal what's missing, instead of a dead button.
   */
  dim?: boolean;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        dim && styles.buttonDim,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'primary' && { color: colors.onAccent },
          variant === 'danger' && { color: colors.danger },
        ]}
      >
        {label}
      </Text>
    </Tap>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  disabledTap: { opacity: 0.4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { color: colors.text, ...type.small, fontSize: 14 },
  chipTextActive: { color: colors.accent },
  segTrack: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  seg: {
    flex: 1,
    minHeight: TOUCH - 4,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segOn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.accent },
  segText: { color: colors.muted, ...type.bodyStrong },
  segTextOn: { color: colors.accent },
  field: { gap: spacing.xs + 2 },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 20,
  },
  label: { color: colors.muted, ...type.label },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  inputWrapError: { borderColor: colors.danger },
  input: { flex: 1, color: colors.text, fontSize: 18, paddingVertical: spacing.md },
  suffix: { color: colors.muted, ...type.bodyStrong, marginLeft: spacing.sm },
  error: { color: colors.danger, ...type.small },
  button: {
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonGhost: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  buttonDanger: { backgroundColor: colors.dangerSoft },
  buttonDim: { opacity: 0.45 },
  buttonText: { color: colors.text, fontSize: 17, fontWeight: '700' },
});
