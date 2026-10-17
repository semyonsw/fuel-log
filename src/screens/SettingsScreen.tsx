/**
 * The Settings tab: things set once and left alone, moved off the Summary so
 * that tab is only about the numbers.
 *
 *   Language          English, Armenian or Russian. App.tsx applies it and
 *                     remounts the tabs, so this screen redraws translated.
 *                     Each option is labelled in its own language.
 *   Car consumption   the typed L/100 km the calculator and the per-trip cost
 *                     estimates use. Blank means "derive it from the log", and
 *                     the placeholder shows that derived figure so the user can
 *                     see what blank currently means.
 *   Data              export / import / backup folder (DataSection).
 */

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DataSection } from '../components/DataSection';
import { t } from '../i18n';
import { SectionLabel, Segmented } from '../components/ui';
import { effectiveKmPerLiter } from '../lib/fuel';
import { LANGUAGES } from '../lib/language';
import { useSettings } from '../state/settings';
import { useLog } from '../state/store';
import { colors, fonts, radius, spacing } from '../theme';

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const entries = useLog((s) => s.entries);
  const language = useSettings((s) => s.language);
  const consumption = useSettings((s) => s.consumption);
  const setSettings = useSettings((s) => s.set);

  // Passing no typed value asks for the log's own figure.
  const derived = useMemo(() => effectiveKmPerLiter(entries, undefined), [entries]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{t('app.tab.settings')}</Text>

      <View style={styles.group}>
        <SectionLabel>{t('app.settings.language')}</SectionLabel>
        <Segmented
          options={LANGUAGES}
          value={language}
          onChange={(v) => setSettings({ language: v })}
        />
      </View>

      <View style={styles.group}>
        <SectionLabel>{t('app.settings.consumption')}</SectionLabel>
        <View style={styles.box}>
          <TextInput
            value={consumption}
            onChangeText={(v) => setSettings({ consumption: v })}
            placeholder={
              derived ? t('app.settings.fromLog', { n: Math.round((100 / derived) * 10) / 10 }) : ''
            }
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            keyboardType="decimal-pad"
            accessibilityLabel={t('app.settings.consumptionA11y')}
            style={styles.input}
          />
          <Text style={styles.suffix} numberOfLines={1}>
            {t('app.settings.consumptionUnit')}
          </Text>
        </View>
        <Text style={styles.hint}>{t('app.settings.consumptionHint')}</Text>
      </View>

      <DataSection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  title: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  group: { gap: spacing.sm, marginTop: spacing.sm },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 56,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontFamily: fonts.num,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: spacing.md,
  },
  suffix: { color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600' },
  hint: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginHorizontal: spacing.xs,
  },
});
