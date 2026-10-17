/**
 * A trip's route drawn as a wrapped dot-line: ○ from → • stop → • stop → ● to.
 *
 * Wrapped rather than vertical because most trips are two places and a
 * vertical rail would make every row tall; the wrap is per place (each place
 * and its leading arrow are one unbreakable unit) so a seven-stop airport run
 * flows onto extra lines without splitting "haxtanak most" from its dot.
 * Endpoints are bright, stops muted, so "where to where" reads at a glance.
 */

import { StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import { colors, fonts, spacing } from '../theme';

export function RouteLine({ from, stops, to }: { from: string; stops: string[]; to: string }) {
  const points: { name: string; role: 'from' | 'stop' | 'to' }[] = [
    ...(from ? [{ name: from, role: 'from' as const }] : []),
    ...stops.filter(Boolean).map((name) => ({ name, role: 'stop' as const })),
    ...(to ? [{ name: to, role: 'to' as const }] : []),
  ];

  if (points.length === 0) return <Text style={styles.empty}>{t('components.route.empty')}</Text>;

  return (
    <View style={styles.wrap}>
      {points.map((p, i) => (
        <View key={`${i}-${p.name}`} style={styles.point}>
          {i > 0 ? <Text style={styles.arrow}>→</Text> : null}
          <View
            style={[
              styles.dot,
              p.role === 'from' && styles.dotFrom,
              p.role === 'to' && styles.dotTo,
            ]}
          />
          <Text style={[styles.name, p.role === 'stop' && styles.nameStop]}>{p.name}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4 },
  point: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, maxWidth: '100%' },
  arrow: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 14,
    marginHorizontal: spacing.xs + 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.muted,
    marginRight: spacing.xs + 2,
  },
  dotFrom: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  dotTo: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: colors.accent },
  name: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    flexShrink: 1,
  },
  nameStop: { color: colors.muted, fontWeight: '500', fontSize: 15 },
  empty: { color: colors.muted, fontFamily: fonts.ui, fontSize: 16 },
});
