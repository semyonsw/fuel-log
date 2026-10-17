/**
 * A place text field with a dropdown of remembered places.
 *
 * The user drives between the same dozen places ("4micro", "charents school",
 * "raykom"), so typing them is the slow part of logging. The list comes from
 * suggestPlaces (places already in the log, filtered by what's typed); the
 * chevron opens it without the keyboard, which is the fastest way to log a
 * trip, and one tap fills the field.
 */

import { forwardRef, useCallback, type ReactNode } from 'react';
import type { TextInput } from 'react-native';

import { suggestPlaces } from '../lib/places';
import { useLog } from '../state/store';
import { ComboField } from './Dropdown';

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Places already used elsewhere in this trip, so they aren't suggested again. */
  exclude: string[];
  error?: string;
  placeholder?: string;
  accessory?: ReactNode;
  /** "from GPS" when the name was guessed from the recorded route. */
  marker?: string;
  onSubmitEditing?: () => void;
};

export const PlaceField = forwardRef<TextInput, Props>(function PlaceField(
  { label, value, onChange, exclude, error, placeholder, accessory, marker, onSubmitEditing },
  ref,
) {
  const entries = useLog((s) => s.entries);

  // `exclude` is a fresh array each render; key the callback on its contents.
  const excludeKey = exclude.join('\u0000');
  const suggest = useCallback(
    (q: string) => suggestPlaces(entries, q, excludeKey ? excludeKey.split('\u0000') : [], 50),
    [entries, excludeKey],
  );

  return (
    <ComboField
      ref={ref}
      label={label}
      value={value}
      onChangeText={onChange}
      suggest={suggest}
      error={error}
      placeholder={placeholder}
      accessory={accessory}
      marker={marker}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="next"
      submitBehavior="submit"
      onSubmitEditing={onSubmitEditing}
    />
  );
});
