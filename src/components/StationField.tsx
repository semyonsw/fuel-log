/**
 * The Refuel form's station: a text field with remembered-station chips,
 * like PlaceField. Tapping a chip fills the name AND the address that
 * station had last time (lib/stations), since the same pump is the usual
 * case; the address stays editable.
 */

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { lastAddressFor, suggestStations } from '../lib/stations';
import { useLog } from '../state/store';
import { spacing } from '../theme';
import { Chip, Field } from './ui';

export function StationField({
  value,
  onChange,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  /** A chip was tapped: the name and its last-used address. */
  onPick: (name: string, address: string | undefined) => void;
}) {
  const entries = useLog((s) => s.entries);
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => suggestStations(entries, value), [entries, value]);
  const show = (focused || value.trim() === '') && suggestions.length > 0;

  return (
    <View style={styles.wrap}>
      <Field
        label="Station (optional)"
        value={value}
        onChangeText={onChange}
        placeholder="e.g. Max Petrol"
        autoCapitalize="words"
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {show ? (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {suggestions.map((s) => (
            <Chip
              key={s}
              label={s}
              tone="place"
              accessibilityLabel={`Use ${s} as the station`}
              onPress={() => onPick(s, lastAddressFor(entries, s))}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chips: { gap: spacing.sm, paddingVertical: 4 },
});
