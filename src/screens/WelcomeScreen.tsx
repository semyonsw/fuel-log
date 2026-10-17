/**
 * First launch: what Fuel Log will ask for and why, then every Android prompt
 * in a row from one "Allow" press. Skippable; anything skipped or refused is
 * asked again the first time that feature is used. Shown once.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Tap } from '../components/ui';
import { t, type StringKey } from '../i18n';
import { requestAll, type PermissionReport } from '../services/permissions';
import { useSettings } from '../state/settings';
import { colors, fonts, radius, spacing, TOUCH } from '../theme';

// Keys only; the texts are looked up at render so they follow the current language.
const ITEMS: { key: keyof PermissionReport; title: StringKey; why: StringKey }[] = [
  { key: 'location', title: 'welcome.location.title', why: 'welcome.location.why' },
  { key: 'background', title: 'welcome.background.title', why: 'welcome.background.why' },
  {
    key: 'notifications',
    title: 'welcome.notifications.title',
    why: 'welcome.notifications.why',
  },
  { key: 'camera', title: 'welcome.camera.title', why: 'welcome.camera.why' },
  { key: 'folder', title: 'welcome.folder.title', why: 'welcome.folder.why' },
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
      <Text style={styles.title}>{t('welcome.title')}</Text>
      <Text style={styles.lead}>{t('welcome.lead')}</Text>
      <View style={styles.list}>
        {ITEMS.map((it, i) => {
          const state = report ? t(report[it.key] ? 'welcome.allowed' : 'welcome.notAllowed') : '';
          return (
            <View key={it.key} style={[styles.item, i > 0 && styles.divider]}>
              <View style={styles.itemHead}>
                <Text style={styles.itemTitle}>{t(it.title)}</Text>
                {state ? (
                  <Text style={[styles.state, report?.[it.key] ? styles.ok : styles.no]}>
                    {state}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.why}>{t(it.why, { notice: t('services.tracking.title') })}</Text>
            </View>
          );
        })}
      </View>
      {report ? (
        <>
          <Text style={styles.note}>{t('welcome.askedLater')}</Text>
          <Button label={t('welcome.start')} onPress={() => set({ onboarded: true })} />
        </>
      ) : (
        <>
          <Button
            label={t(busy ? 'welcome.asking' : 'welcome.allowAll')}
            onPress={allow}
            dim={busy}
          />
          <Tap
            onPress={() => set({ onboarded: true })}
            accessibilityRole="button"
            style={styles.skip}
          >
            <Text style={styles.skipText}>{t('welcome.skip')}</Text>
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
