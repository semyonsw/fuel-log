/**
 * A place text field with remembered-place chips underneath.
 *
 * The user drives between the same dozen places ("4micro", "charents school",
 * "raykom"), so typing them is the slow part of logging. Chips come from
 * suggestPlaces (places already in the log, filtered by what's typed) and
 * one tap fills the field. They're a single horizontal strip so a form with
 * From + three stops + To doesn't turn into a wall of pills.
 *
 * Chips show while the field is focused or still empty: empty-and-unfocused is
 * the "just tap it, no keyboard" path, which is the fastest way to log a trip.
 */

import { forwardRef, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { normalizePlace, suggestPlaces } from '../lib/places';
import { useLog } from '../state/store';
import { spacing } from '../theme';
import { Chip, Field } from './ui';

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Places already used elsewhere in this trip, so they aren't suggested again. */
  exclude: string[];
  error?: string;
  placeholder?: string;
  accessory?: ReactNode;
  onSubmitEditing?: () => void;
};

export const PlaceField = forwardRef<TextInput, Props>(function PlaceField(
  { label, value, onChange, exclude, error, placeholder, accessory, onSubmitEditing },
  ref,
) {
  const entries = useLog((s) => s.entries);
  const [focused, setFocused] = useState(false);

  // `exclude` is a fresh array each render; key the memo on its contents.
  const excludeKey = exclude.join('\u0000');
  const suggestions = useMemo(() => {
    const own = normalizePlace(value);
    return suggestPlaces(entries, value, excludeKey ? excludeKey.split('\u0000') : []).filter(
      (p) => normalizePlace(p) !== own,
    );
  }, [entries, value, excludeKey]);

  const showChips = (focused || value.trim() === '') && suggestions.length > 0;

  return (
    <View style={styles.wrap}>
      <Field
        ref={ref}
        label={label}
        value={value}
        onChangeText={onChange}
        error={error}
        placeholder={placeholder}
        accessory={accessory}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {showChips ? (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {suggestions.map((p) => (
            <Chip
              key={p}
              label={p}
              tone="place"
              accessibilityLabel={`Use ${p} for ${label}`}
              onPress={() => onChange(p)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chips: { gap: spacing.sm, paddingVertical: 4 },
});
