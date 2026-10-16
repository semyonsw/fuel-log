/**
 * App shell: safe area, system colours, the two tabs, and the entry form overlay.
 *
 * No navigation library: there are exactly two tabs and one form, so plain
 * state is simpler and has no native setup. The form renders above the tabs
 * (tab bar included) so it behaves like a full-screen sheet; it handles its own
 * Android back. Back on the Summary tab returns to Log before leaving the app,
 * which is what Android users expect from a bottom-tab app.
 *
 * Until the store has read AsyncStorage we show a bare loading state, so a
 * user with history never sees the "nothing logged yet" screen flash.
 */

import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from './src/components/ui';
import { EntryForm } from './src/screens/EntryForm';
import { LogScreen } from './src/screens/LogScreen';
import { SummaryScreen } from './src/screens/SummaryScreen';
import { useLog } from './src/state/store';
import { colors, spacing } from './src/theme';
import type { Entry } from './src/types';

type Tab = 'log' | 'summary';
/** null = closed; `editing` undefined = a new entry. */
type FormState = { editing?: Entry } | null;

export default function App() {
  useEffect(() => {
    // The root view's colour shows behind the keyboard and during transitions.
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, []);

  return (
    <SafeAreaProvider style={{ backgroundColor: colors.bg }}>
      {/* "light" content: white status-bar icons on the dark background. */}
      <StatusBar style="light" />
      <Shell />
    </SafeAreaProvider>
  );
}

function Shell() {
  const hydrated = useLog((s) => s.hydrated);
  const [tab, setTab] = useState<Tab>('log');
  const [form, setForm] = useState<FormState>(null);

  const openNew = useCallback(() => setForm({}), []);
  const openEdit = useCallback((entry: Entry) => setForm({ editing: entry }), []);
  const closeForm = useCallback(() => setForm(null), []);

  useEffect(() => {
    if (form || tab === 'log') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setTab('log');
      return true;
    });
    return () => sub.remove();
  }, [form, tab]);

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Fuel Log</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.screen}>
        {tab === 'log' ? <LogScreen onAdd={openNew} onEdit={openEdit} /> : <SummaryScreen />}
      </View>
      <TabBar tab={tab} onChange={setTab} />
      {form ? (
        <EntryForm key={form.editing?.id ?? 'new'} editing={form.editing} onClose={closeForm} />
      ) : null}
    </View>
  );
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const insets = useSafeAreaInsets();
  const items: { value: Tab; label: string; glyph: string }[] = [
    { value: 'log', label: 'Log', glyph: '☰' },
    { value: 'summary', label: 'Summary', glyph: 'Σ' },
  ];
  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.value === tab;
        return (
          <Tap
            key={it.value}
            onPress={() => onChange(it.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.label}
            style={styles.tab}
          >
            <Text style={[styles.tabGlyph, on && styles.tabOn]}>{it.glyph}</Text>
            <Text style={[styles.tabLabel, on && styles.tabOn]}>{it.label}</Text>
            <View style={[styles.tabIndicator, on && styles.tabIndicatorOn]} />
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    backgroundColor: colors.bg,
  },
  loadingText: { color: colors.muted, fontSize: 16, fontWeight: '600' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tab: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabGlyph: { color: colors.muted, fontSize: 18, fontWeight: '700' },
  tabLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  tabOn: { color: colors.accent },
  tabIndicator: { position: 'absolute', top: 0, height: 3, width: 40, borderRadius: 2 },
  tabIndicatorOn: { backgroundColor: colors.accent },
});
