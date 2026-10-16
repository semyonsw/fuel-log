/**
 * First launch: what Fuel Log will ask for and why, then every Android prompt
 * in a row from one "Allow" press. Skippable; anything skipped or refused is
 * asked again the first time that feature is used. Shown once.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Tap } from '../components/ui';
import { requestAll, type PermissionReport } from '../services/permissions';
import { useSettings } from '../state/settings';
import { colors, fonts, radius, spacing, TOUCH } from '../theme';

const ITEMS: { key: keyof PermissionReport; title: string; why: string }[] = [
  {
    key: 'location',
    title: 'Location',
    why: 'Records the route and distance of a trip you start.',
  },
  {
    key: 'background',
    title: 'Location all the time',
    why: 'Keeps recording with the screen off. Android opens a settings page: choose "Allow all the time".',
  },
  {
    key: 'notifications',
    title: 'Notifications',
    why: 'Shows "Recording your trip" while GPS is on, so you always know.',
  },
  { key: 'camera', title: 'Camera', why: 'Photographs the dashboard for the AI to read.' },
  {
    key: 'folder',
    title: 'Backup folder',
    why: 'Pick a folder once; every change is saved there as one JSON file.',
  },
];

export function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const set = useSettings((s) => s.set);
  const [report, setReport] = useState<PermissionReport | null>(null);
  const [busy, setBusy] = useState(false);

  const allow = async () => {
    setBusy(true);
    setReport(await requestAll());
    setBusy(false);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <Text style={styles.title}>Welcome to Fuel Log</Text>
      <Text style={styles.lead}>
        Everything stays on this phone. To record trips, read dashboard photos and back up your
        data, Fuel Log needs:
      </Text>
      <View style={styles.list}>
        {ITEMS.map((it, i) => {
          const state = report ? (report[it.key] ? 'Allowed' : 'Not allowed') : '';
          return (
            <View key={it.key} style={[styles.item, i > 0 && styles.divider]}>
              <View style={styles.itemHead}>
                <Text style={styles.itemTitle}>{it.title}</Text>
                {state ? (
                  <Text style={[styles.state, report?.[it.key] ? styles.ok : styles.no]}>
                    {state}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.why}>{it.why}</Text>
            </View>
          );
        })}
      </View>
      {report ? (
        <>
          <Text style={styles.note}>
            Anything not allowed is asked again when you first use it.
          </Text>
          <Button label="Start using Fuel Log" onPress={() => set({ onboarded: true })} />
        </>
      ) : (
        <>
          <Button label={busy ? 'Asking…' : 'Allow all'} onPress={allow} dim={busy} />
          <Tap
            onPress={() => set({ onboarded: true })}
            accessibilityRole="button"
            style={styles.skip}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </Tap>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  title: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  lead: { color: colors.muted, fontFamily: fonts.ui, fontSize: 16, lineHeight: 23 },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  item: { padding: spacing.lg, gap: spacing.xs },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  itemHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  itemTitle: { color: colors.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '700' },
  why: { color: colors.muted, fontFamily: fonts.ui, fontSize: 14, lineHeight: 20 },
  state: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700' },
  ok: { color: colors.success },
  no: { color: colors.danger },
  note: { color: colors.muted, fontFamily: fonts.ui, fontSize: 14, lineHeight: 20 },
  skip: { minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
  skipText: { color: colors.muted, fontFamily: fonts.ui, fontSize: 15, fontWeight: '600' },
});
