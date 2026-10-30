/**
 * Service reminders that need attention, at the top of the Log.
 *
 * Only "soon" and "due" make it here; a reminder months away is not news, and
 * an empty card would push the range hero down for nothing, so with nothing
 * urgent the banner is not rendered at all. Due rows are red, soon rows amber,
 * so the one that is overdue is found without reading. Each row opens the
 * service it came from, which is where the next service gets logged from.
 */

import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import { serviceLabel } from '../lib/categories';
import { describeReminder, reminderStatus } from '../lib/reminders';
import { colors, radius, spacing, TOUCH, type } from '../theme';
import type { Entry } from '../types';

import { Tap } from './ui';

export const ReminderBanner = memo(function ReminderBanner({
  entries,
  now,
  onPress,
}: {
  entries: Entry[];
  now: number;
  onPress?: (serviceId: string) => void;
}) {
  const urgent = useMemo(
    () => reminderStatus(entries, now).filter((r) => r.state !== 'ok'),
    [entries, now],
  );
  if (urgent.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('care.banner.title')}</Text>
      {urgent.map((r) => {
        const label = serviceLabel(r.category);
        const line = describeReminder(r);
        const due = r.state === 'due';
        return (
          <Tap
            key={r.serviceId}
            onPress={onPress ? () => onPress(r.serviceId) : undefined}
            disabled={!onPress}
            accessibilityRole={onPress ? 'button' : 'text'}
            accessibilityLabel={`${label}, ${line}`}
            style={styles.row}
          >
            <View style={[styles.dot, due ? styles.dotDue : styles.dotSoon]} />
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
            <Text style={[styles.when, due ? styles.whenDue : styles.whenSoon]} numberOfLines={1}>
              {line}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  title: { color: colors.muted, ...type.label },
  row: {
    minHeight: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  dotDue: { backgroundColor: colors.danger },
  dotSoon: { backgroundColor: colors.accent },
  label: { color: colors.text, ...type.bodyStrong, flexShrink: 1 },
  when: { ...type.small, marginLeft: 'auto', flexShrink: 0 },
  whenDue: { color: colors.danger },
  whenSoon: { color: colors.accent },
});
