/**
 * App shell: safe area, system colours, the three tabs, and the overlays (the
 * entry form and the AI chat).
 *
 * No navigation library: there are three tabs, one form and one chat, so plain
 * state is simpler and has no native setup. Overlays render above the tabs
 * (tab bar included) so they behave like full-screen sheets and handle their
 * own Android back. Back on Summary or Settings returns to History before
 * leaving the app, which is what Android users expect from a bottom-tab app.
 *
 * The tab bar is icons only; a long press reveals the names (see
 * `lib/tabLabels`). The root view watches every touch so the next touch
 * outside the bar, a tap or the start of a scroll, hides them again.
 *
 * Until the stores have read AsyncStorage we show a bare loading state, so a
 * user with history never sees the "nothing logged yet" screen flash. The
 * first launch shows the welcome/permissions screen once.
 *
 * The UI language is the persisted setting, applied with `setLang` during
 * render, before any child renders, so the first frame after hydration is
 * already in the right language. Strings are read at render time, so on a
 * switch everything under the `key={language}` wrapper remounts and reads
 * them afresh; nothing has to subscribe to the language itself. Auto-backup starts
 * only after everything has loaded, so a half-read store is never written out.
 *
 * App-icon shortcuts (long-press the launcher icon) are published once the
 * app is ready and again on every language switch, so their titles follow the
 * setting. The one that launched the app, or arrives while it runs, is held
 * until the stores are loaded and is then routed by `lib/shortcuts`; before
 * onboarding it is dropped, since the welcome screen comes first. Chat and
 * Start trip close an open form, because the form would otherwise sit on top
 * of what was asked for.
 *
 * `services/tracking` is imported for its side effect: the background GPS
 * task must be defined before anything mounts.
 */

import * as QuickActions from 'expo-quick-actions';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import './src/services/tracking';
import { LogTabIcon, SettingsTabIcon, SummaryTabIcon } from './src/components/icons';
import { Tap } from './src/components/ui';
import { setLang, t, type StringKey } from './src/i18n';
import { emptyDraft, type Draft } from './src/lib/draft';
import { shortcutItems, shortcutRoute } from './src/lib/shortcuts';
import { nextLabelsShown, type TabLabelEvent } from './src/lib/tabLabels';
import { startAutoBackup } from './src/services/backup';
import { startReminders } from './src/services/notifications';
import { loadApiKey } from './src/services/secrets';
import { restoreTracking } from './src/services/tracking';
import { ChatScreen } from './src/screens/ChatScreen';
import { EntryForm, type FormMarkers } from './src/screens/EntryForm';
import { LogScreen, startTrip } from './src/screens/LogScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SummaryScreen } from './src/screens/SummaryScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { useSettings } from './src/state/settings';
import { useLog } from './src/state/store';
import { colors, fonts, spacing } from './src/theme';
import type { Entry, EntryKind } from './src/types';

type Tab = 'history' | 'summary' | 'settings';
/** null = closed; `editing` = an existing entry; `initial` = a pre-filled new one. */
type FormState = { editing?: Entry; initial?: Draft; markers?: FormMarkers; key: string } | null;

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
  const language = useSettings((s) => s.language);
  // Cheap and idempotent; must run before the children below read strings.
  setLang(language);
  const [extrasReady, setExtrasReady] = useState(false);
  const [tab, setTab] = useState<Tab>('history');
  const [form, setForm] = useState<FormState>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [labelsShown, setLabelsShown] = useState(false);
  // The id of a shortcut not yet acted on: the launch one, or a later one.
  const [shortcut, setShortcut] = useState<string | null>(() => QuickActions.initial?.id ?? null);
  const barTouch = useRef(false);
  const ready = logReady && settingsReady && extrasReady;

  useEffect(() => {
    Promise.all([loadApiKey(), restoreTracking()]).finally(() => setExtrasReady(true));
  }, []);
  useEffect(() => (ready ? startAutoBackup() : undefined), [ready]);
  // After onboarding, so its permission prompt never lands on the welcome screen.
  useEffect(() => (ready && onboarded ? startReminders() : undefined), [ready, onboarded]);

  const openNew = useCallback(() => setForm({ key: `new-${Date.now()}` }), []);
  const openEdit = useCallback((entry: Entry) => setForm({ editing: entry, key: entry.id }), []);
  const openKind = useCallback(
    (kind: EntryKind) =>
      setForm({ initial: emptyDraft(kind, Date.now()), key: `${kind}-${Date.now()}` }),
    [],
  );
  const openRefuel = useCallback(() => openKind('refuel'), [openKind]);
  const openService = useCallback(() => openKind('service'), [openKind]);
  const openExpense = useCallback(() => openKind('expense'), [openKind]);
  const openRecorded = useCallback(
    (draft: Draft, m: { from?: boolean; to?: boolean; distance?: boolean }) => {
      const mark = t('app.fromGps');
      setForm({
        initial: draft,
        markers: {
          ...(m.from ? { from: mark } : {}),
          ...(m.to ? { to: mark } : {}),
          ...(m.distance ? { distance: mark } : {}),
        },
        key: `gps-${Date.now()}`,
      });
    },
    [],
  );
  const closeForm = useCallback(() => setForm(null), []);
  const openChat = useCallback(() => setChatOpen(true), []);
  const closeChat = useCallback(() => setChatOpen(false), []);
  const labelEvent = useCallback(
    (e: TabLabelEvent) => setLabelsShown((shown) => nextLabelsShown(shown, e)),
    [],
  );
  const markBarTouch = useCallback(() => {
    barTouch.current = true;
  }, []);
  // Touch events bubble child-first, so the bar's handler has already run for
  // a touch that started inside it by the time this one sees it.
  const onRootTouch = useCallback(() => {
    labelEvent(barTouch.current ? 'touchInBar' : 'touchOutside');
    barTouch.current = false;
  }, [labelEvent]);

  useEffect(() => {
    const sub = QuickActions.addListener((action) => setShortcut(action.id));
    return () => sub.remove();
  }, []);
  // `language` is a dependency on purpose: titles are read with t() here.
  useEffect(() => {
    if (!ready) return;
    // ic_launcher is the app icon mipmap prebuild generates; a missing one just means no icon.
    QuickActions.setItems(shortcutItems().map((i) => ({ ...i, icon: 'ic_launcher' }))).catch(
      () => {},
    );
  }, [ready, language]);
  useEffect(() => {
    if (!ready || shortcut === null) return;
    setShortcut(null);
    const route = onboarded ? shortcutRoute(shortcut) : null;
    if (!route) return;
    if (route.to === 'form') {
      openKind(route.kind);
    } else if (route.to === 'chat') {
      setForm(null);
      setChatOpen(true);
    } else {
      setForm(null);
      setChatOpen(false);
      setTab('history');
      startTrip().catch(() => {});
    }
  }, [ready, onboarded, shortcut, openKind]);

  useEffect(() => {
    if (form || chatOpen || tab === 'history') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setTab('history');
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

  if (!onboarded) return <WelcomeScreen key={language} />;

  return (
    // onTouchStart only observes: it never claims the responder, so every
    // touch still reaches its target. A touch that began in the tab bar has
    // already marked itself (child handlers run first) and is let through.
    // Keyed by language so a switch in Settings remounts it all translated.
    <View key={language} style={styles.root} onTouchStart={onRootTouch}>
      <View style={styles.screen}>
        {tab === 'history' ? (
          <LogScreen
            onAdd={openNew}
            onAddRefuel={openRefuel}
            onAddService={openService}
            onAddExpense={openExpense}
            onEdit={openEdit}
            onAi={openChat}
            onTripRecorded={openRecorded}
          />
        ) : tab === 'summary' ? (
          <SummaryScreen onEdit={openEdit} onAddRefuel={openRefuel} />
        ) : (
          <SettingsScreen />
        )}
      </View>
      <TabBar
        tab={tab}
        onChange={setTab}
        labelsShown={labelsShown}
        onLabelEvent={labelEvent}
        onBarTouch={markBarTouch}
      />
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

/** Names are string keys, translated when the bar renders. */
const TABS: { value: Tab; labelKey: StringKey; Icon: typeof LogTabIcon }[] = [
  { value: 'history', labelKey: 'app.tab.history', Icon: LogTabIcon },
  { value: 'summary', labelKey: 'app.tab.summary', Icon: SummaryTabIcon },
  { value: 'settings', labelKey: 'app.tab.settings', Icon: SettingsTabIcon },
];

/** How far the icon sits lowered while the names are hidden, so it looks centred. */
const ICON_DROP = 9;

function TabBar({
  tab,
  onChange,
  labelsShown,
  onLabelEvent,
  onBarTouch,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  labelsShown: boolean;
  onLabelEvent: (e: TabLabelEvent) => void;
  onBarTouch: () => void;
}) {
  const insets = useSafeAreaInsets();
  // 0 = icons only, 1 = names showing. Only opacity and translateY move, so the
  // bar never changes height and the animation runs on the native driver.
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(shown, {
      toValue: labelsShown ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [labelsShown, shown]);

  const iconShift = shown.interpolate({ inputRange: [0, 1], outputRange: [ICON_DROP, 0] });
  const labelShift = shown.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <View
      style={[styles.tabBar, { paddingBottom: insets.bottom }]}
      accessibilityRole="tablist"
      onTouchStart={onBarTouch}
    >
      {TABS.map(({ value, labelKey, Icon }) => {
        const label = t(labelKey);
        const on = value === tab;
        const color = on ? colors.accent : colors.muted;
        return (
          <Tap
            key={value}
            onPress={() => onChange(value)}
            // With onLongPress set, Pressable does not also fire onPress, so a
            // long press only reveals the names and leaves the tab as it is.
            onLongPress={() => onLabelEvent('longPress')}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            style={styles.tab}
          >
            <Animated.View style={{ transform: [{ translateY: iconShift }] }}>
              <Icon color={color} />
            </Animated.View>
            <Animated.Text
              importantForAccessibility="no"
              style={[
                styles.tabLabel,
                { color, opacity: shown, transform: [{ translateY: labelShift }] },
              ]}
            >
              {label}
            </Animated.Text>
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
