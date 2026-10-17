/**
 * Shared building blocks: the small vocabulary every screen is assembled from.
 *
 *   Tap         Pressable with the app's one pressed look (dim + slight shrink)
 *   Card        a surface panel
 *   Chip        a pill that is tappable, optionally "on"
 *   Segmented   equal-width options in one track (Trip/Range/Refuel, Week/Month/All)
 *   Field       label + TextInput + error line, 56 high so it's thumb-friendly
 *   Button      full-width primary / ghost / danger action
 *   Sheet       a bottom sheet over a dimmed backdrop (confirmations)
 *
 * Kept deliberately unparameterised: the variants here are the ones the screens
 * actually use, so a new control is a composition, not new spacing decisions.
 */

import { forwardRef, useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
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

import { t } from '../i18n';
import { colors, fonts, radius, spacing, TOUCH, type } from '../theme';

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
  dark = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Inside a surface card the track sits darker, on the page colour. */
  dark?: boolean;
}) {
  return (
    <View style={[styles.segTrack, dark && styles.segTrackDark]} accessibilityRole="tablist">
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
    /** A small amber tag after the label: where a pre-filled value came from ("from photo"). */
    marker?: string;
    /** Number fields use the mono figures; text fields the UI face. */
    numeric?: boolean;
    /** The Range kind's one big field. */
    big?: boolean;
    /** Inside the box after the input, e.g. a dropdown's chevron. */
    trailing?: ReactNode;
  }
>(function Field(
  { label, suffix, error, accessory, marker, numeric, big, trailing, style, ...input },
  ref,
) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <View style={styles.labelLeft}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          {marker ? <Text style={styles.marker}>{marker}</Text> : null}
        </View>
        {accessory}
      </View>
      <View
        style={[styles.inputWrap, big && styles.inputWrapBig, error ? styles.inputWrapError : null]}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          style={[styles.input, numeric && styles.inputNum, big && styles.inputBig, style]}
          accessibilityLabel={label}
          {...input}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
        {trailing}
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

/**
 * A bottom sheet over a dimmed backdrop, sliding up from the thumb's side of
 * the screen. Tapping the backdrop or Android back is "cancel".
 */
export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      y.setValue(0);
      Animated.timing(y, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible, y]);
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView behavior="padding" style={styles.flex1}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('form.close')}>
          <Animated.View
            style={[
              styles.sheet,
              {
                opacity: y,
                transform: [
                  { translateY: y.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                ],
              },
            ]}
          >
            {/* Swallow taps inside the sheet so they don't reach the backdrop. */}
            <Pressable onPress={() => {}} style={styles.sheetInner}>
              {children}
            </Pressable>
          </Animated.View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** "Delete this entry?"-style confirmation, as a sheet with two equal buttons. */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onCancel}>
      <Text style={styles.sheetTitle}>{title}</Text>
      {body ? <Text style={styles.sheetBody}>{body}</Text> : null}
      <View style={styles.sheetActions}>
        <View style={styles.flex1}>
          <Button label={t('common.cancel')} variant="ghost" onPress={onCancel} />
        </View>
        <View style={styles.flex1}>
          <Button
            label={confirmLabel}
            variant={danger ? 'danger' : 'primary'}
            onPress={onConfirm}
          />
        </View>
      </View>
    </Sheet>
  );
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
  segTrackDark: { backgroundColor: colors.bg },
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
  label: { color: colors.muted, ...type.label, flexShrink: 1 },
  labelLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  marker: {
    color: colors.accent,
    fontFamily: fonts.ui,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    overflow: 'hidden',
  },
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
  inputWrapBig: { minHeight: 80 },
  inputWrapError: { borderColor: colors.danger },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 18,
    paddingVertical: spacing.md,
  },
  inputNum: { fontFamily: fonts.num, fontWeight: '500', fontVariant: ['tabular-nums'] },
  inputBig: { fontSize: 40, fontWeight: '700', letterSpacing: -1 },
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
  buttonText: { color: colors.text, fontFamily: fonts.ui, fontSize: 17, fontWeight: '700' },
  flex1: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  sheetInner: { padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: 36, gap: spacing.sm },
  sheetTitle: { color: colors.text, fontFamily: fonts.ui, fontSize: 20, fontWeight: '700' },
  sheetBody: { color: colors.muted, fontFamily: fonts.ui, fontSize: 16, lineHeight: 23 },
  sheetActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
