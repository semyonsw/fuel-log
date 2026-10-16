/**
 * App shell: safe area, system colours, the two tabs, and the overlays (the
 * entry form and the AI chat).
 *
 * No navigation library: there are two tabs, one form and one chat, so plain
 * state is simpler and has no native setup. Overlays render above the tabs
 * (tab bar included) so they behave like full-screen sheets and handle their
 * own Android back. Back on the Summary tab returns to Log before leaving the
 * app, which is what Android users expect from a bottom-tab app.
 *
 * Until the stores have read AsyncStorage we show a bare loading state, so a
 * user with history never sees the "nothing logged yet" screen flash. The
 * first launch shows the welcome/permissions screen once. Auto-backup starts
 * only after everything has loaded, so a half-read store is never written out.
 *
 * `services/tracking` is imported for its side effect: the background GPS
 * task must be defined before anything mounts.
 */

import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import './src/services/tracking';
import { LogTabIcon, SummaryTabIcon } from './src/components/icons';
import { Tap } from './src/components/ui';
import { emptyDraft, type Draft } from './src/lib/draft';
import { startAutoBackup } from './src/services/backup';
import { loadApiKey } from './src/services/secrets';
import { restoreTracking } from './src/services/tracking';
import { ChatScreen } from './src/screens/ChatScreen';
import { EntryForm, type FormMarkers } from './src/screens/EntryForm';
import { LogScreen } from './src/screens/LogScreen';
import { SummaryScreen } from './src/screens/SummaryScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { useSettings } from './src/state/settings';
import { useLog } from './src/state/store';
import { colors, fonts, spacing } from './src/theme';
import type { Entry } from './src/types';

type Tab = 'log' | 'summary';
/** null = closed; `editing` = an existing entry; `initial` = a pre-filled new one. */
type FormState = { editing?: Entry; initial?: Draft; markers?: FormMarkers; key: string } | null;

const GPS_MARK = 'from GPS';

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
  const logReady = useLog((s) => s.hydrated);
  const settingsReady = useSettings((s) => s.hydrated);
  const onboarded = useSettings((s) => s.onboarded);
  const [extrasReady, setExtrasReady] = useState(false);
  const [tab, setTab] = useState<Tab>('log');
  const [form, setForm] = useState<FormState>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const ready = logReady && settingsReady && extrasReady;

  useEffect(() => {
    Promise.all([loadApiKey(), restoreTracking()]).finally(() => setExtrasReady(true));
  }, []);
  useEffect(() => (ready ? startAutoBackup() : undefined), [ready]);

  const openNew = useCallback(() => setForm({ key: `new-${Date.now()}` }), []);
  const openEdit = useCallback((entry: Entry) => setForm({ editing: entry, key: entry.id }), []);
  const openRefuel = useCallback(
    () => setForm({ initial: emptyDraft('refuel', Date.now()), key: `refuel-${Date.now()}` }),
    [],
  );
  const openRecorded = useCallback(
    (draft: Draft, m: { from?: boolean; to?: boolean; distance?: boolean }) =>
      setForm({
        initial: draft,
        markers: {
          ...(m.from ? { from: GPS_MARK } : {}),
          ...(m.to ? { to: GPS_MARK } : {}),
          ...(m.distance ? { distance: GPS_MARK } : {}),
        },
        key: `gps-${Date.now()}`,
      }),
    [],
  );
  const closeForm = useCallback(() => setForm(null), []);
  const openChat = useCallback(() => setChatOpen(true), []);
  const closeChat = useCallback(() => setChatOpen(false), []);

  useEffect(() => {
    if (form || chatOpen || tab === 'log') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setTab('log');
      return true;
    });
    return () => sub.remove();
  }, [form, chatOpen, tab]);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Fuel Log</Text>
      </View>
    );
  }

  if (!onboarded) return <WelcomeScreen />;

  return (
    <View style={styles.root}>
      <View style={styles.screen}>
        {tab === 'log' ? (
          <LogScreen
            onAdd={openNew}
            onEdit={openEdit}
            onAi={openChat}
            onTripRecorded={openRecorded}
          />
        ) : (
          <SummaryScreen onEdit={openEdit} onAddRefuel={openRefuel} />
        )}
      </View>
      <TabBar tab={tab} onChange={setTab} />
      {chatOpen ? <ChatScreen onClose={closeChat} /> : null}
      {form ? (
        <EntryForm
          key={form.key}
          editing={form.editing}
          initial={form.initial}
          initialMarkers={form.markers}
          onClose={closeForm}
        />
      ) : null}
    </View>
  );
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const insets = useSafeAreaInsets();
  const items: { value: Tab; label: string }[] = [
    { value: 'log', label: 'Log' },
    { value: 'summary', label: 'Summary' },
  ];
  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.value === tab;
        const color = on ? colors.accent : colors.muted;
        return (
          <Tap
            key={it.value}
            onPress={() => onChange(it.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.label}
            style={styles.tab}
          >
            {it.value === 'log' ? <LogTabIcon color={color} /> : <SummaryTabIcon color={color} />}
            <Text style={[styles.tabLabel, { color }]}>{it.label}</Text>
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
  loadingText: { color: colors.muted, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tab: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabLabel: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700' },
  tabIndicator: { position: 'absolute', top: -1, height: 3, width: 40, borderRadius: 2 },
  tabIndicatorOn: { backgroundColor: colors.accent },
});
