/**
 * The Refuel form's station and address: text fields with a dropdown of the
 * ones used before (lib/stations). Picking a station also fills the address
 * that station had last time, since the same pump is the usual case; the
 * address stays editable, and its own list puts that station's addresses
 * first.
 */

import { useCallback } from 'react';

import { t } from '../i18n';
import { lastAddressFor, suggestAddresses, suggestStations } from '../lib/stations';
import { useLog } from '../state/store';
import { ComboField } from './Dropdown';

/** Enough to scroll through every station the user has ever used. */
const LIMIT = 50;

export function StationField({
  value,
  onChange,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  /** A remembered station was picked: the name and its last-used address. */
  onPick: (name: string, address: string | undefined) => void;
}) {
  const entries = useLog((s) => s.entries);
  const suggest = useCallback((q: string) => suggestStations(entries, q, LIMIT), [entries]);

  return (
    <ComboField
      label={t('form.station')}
      value={value}
      onChangeText={onChange}
      onPick={(name) => onPick(name, lastAddressFor(entries, name))}
      suggest={suggest}
      placeholder={t('form.stationPlaceholder')}
      autoCapitalize="words"
      autoCorrect={false}
    />
  );
}

export function AddressField({
  value,
  station,
  onChange,
}: {
  value: string;
  /** The station on the form, whose addresses are listed first. */
  station: string;
  onChange: (v: string) => void;
}) {
  const entries = useLog((s) => s.entries);
  const suggest = useCallback(
    (q: string) => suggestAddresses(entries, q, station, LIMIT),
    [entries, station],
  );

  return (
    <ComboField
      label={t('form.address')}
      value={value}
      onChangeText={onChange}
      suggest={suggest}
      placeholder={t('form.addressPlaceholder')}
      autoCapitalize="words"
      autoCorrect={false}
    />
  );
}
