/**
 * The floating buttons, bottom-right under the thumb: refuel (the fuel pump)
 * and "+" (trip / range).
 *
 * Refuel gets its own button so logging one is a single tap straight into a
 * refuel form, and "+" stays about driving. The fuel button is the app icon in
 * miniature (amber pump on the dark disc) so it is recognisable without a
 * label. Same circle for both so neither reads as secondary.
 */

import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { colors, spacing } from '../theme';
import { FuelPumpIcon, PlusIcon } from './icons';
import { Tap } from './ui';

const SIZE = 56;

export function Fabs({ onRefuel, onAdd }: { onRefuel: () => void; onAdd: () => void }) {
  return (
    <View style={styles.row} pointerEvents="box-none">
      <Tap
        onPress={onRefuel}
        accessibilityRole="button"
        accessibilityLabel={t('components.fab.refuel')}
        style={[styles.fab, styles.dark]}
      >
        <FuelPumpIcon size={26} />
      </Tap>
      <Tap
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={t('components.fab.add')}
        style={styles.fab}
      >
        <PlusIcon size={24} />
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  fab: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  dark: { backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.accent },
});
