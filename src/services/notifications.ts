/**
 * Service reminders as Android notifications, kept in step with the log.
 *
 * The log is the only source of truth (see lib/reminders), so on every change
 * this throws away the reminder notifications it scheduled and schedules them
 * again from scratch. Diffing would save a few native calls on a list of at
 * most five reminders and would be one more thing to get wrong.
 *
 * ── DATE RULES ARE SCHEDULED, KM RULES ARE NOT ───────────────────────────
 *
 * A date is known in advance: one notification 7 days before (if that is
 * still ahead) and one on the day, both at 10:00 local — morning, but not the
 * moment the alarm goes off. Kilometres only move when something is logged, so
 * a km rule is checked on each change and, the first time it turns "soon" and
 * the first time it turns "due", one notification is shown right away. What
 * was already shown is remembered in AsyncStorage so a restart or an unrelated
 * edit does not repeat it.
 *
 * ── NEVER IN THE WAY ─────────────────────────────────────────────────────
 *
 * Every native call is wrapped: a refused permission, a missing module or a
 * scheduling error leaves the banner on the Log screen as the reminder, and
 * nothing else. Permission is asked only once a reminder actually exists, so
 * someone who never sets one is never prompted.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { t } from '../i18n';
import { serviceLabel } from '../lib/categories';
import { describeReminder, reminderStatus, type Reminder } from '../lib/reminders';
import { useSettings } from '../state/settings';
import { useLog } from '../state/store';

const CHANNEL = 'reminders';
const NOTIFIED_KEY = 'fuel-log/reminders-notified/v1';
/** Prefix on every identifier this module schedules, so it never cancels anyone else's. */
const ID_PREFIX = 'reminder:';
/** Edits come in bursts (save, then an auto-backup touch); one resync after they settle. */
const DEBOUNCE_MS = 1500;
const NOTIFY_HOUR = 10;
const WEEK_BEFORE_DAYS = 7;

/** 10:00 local on `at`'s day, `daysBefore` calendar days earlier. */
function morningOf(at: number, daysBefore = 0): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysBefore, NOTIFY_HOUR).getTime();
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: t('care.notify.channel'),
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// Asked at most once per app run: a dismissed dialog is an answer for now, and
// re-asking after every edit to the log would be nagging.
let askedThisRun = false;

async function permitted(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain || askedThisRun) return false;
  askedThisRun = true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function cancelOurs(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

async function scheduleDate(r: Reminder, now: number): Promise<void> {
  if (r.dueAt === undefined) return;
  const label = serviceLabel(r.category);
  const plan: { id: string; when: number; title: string }[] = [
    {
      id: `${ID_PREFIX}${r.serviceId}:week`,
      when: morningOf(r.dueAt, WEEK_BEFORE_DAYS),
      title: t('care.notify.week', { label }),
    },
    {
      id: `${ID_PREFIX}${r.serviceId}:day`,
      when: morningOf(r.dueAt),
      title: t('care.notify.due', { label }),
    },
  ];
  for (const p of plan) {
    if (p.when <= now) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, data: { serviceId: r.serviceId } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: p.when,
        channelId: CHANNEL,
      },
    });
  }
}

async function readNotified(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFIED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Shows each km reminder's "soon" and "due" once; returns what has now been
 * shown. Keyed by service id, so a newer service of the category is a new
 * reminder and may notify again, and keys of replaced services are dropped.
 * Once "due" was shown, a later "soon" (say, a corrected odometer) stays quiet.
 */
async function presentKm(reminders: Reminder[], notified: Set<string>): Promise<Set<string>> {
  const live = new Set(reminders.map((r) => r.serviceId));
  const shown = new Set([...notified].filter((k) => live.has(k.slice(0, k.lastIndexOf(':km:')))));
  for (const r of reminders) {
    if (r.kmState === undefined || r.kmState === 'ok') continue;
    const due = `${r.serviceId}:km:due`;
    const soon = `${r.serviceId}:km:soon`;
    if (shown.has(due) || (r.kmState === 'soon' && shown.has(soon))) continue;
    const label = serviceLabel(r.category);
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t(r.kmState === 'due' ? 'care.notify.due' : 'care.notify.soon', { label }),
          body: describeReminder(r),
          data: { serviceId: r.serviceId },
        },
        trigger: { channelId: CHANNEL },
      });
      shown.add(r.kmState === 'due' ? due : soon);
    } catch {
      // Not remembered, so the next change tries again.
    }
  }
  return shown;
}

async function sync(): Promise<void> {
  const now = Date.now();
  const reminders = reminderStatus(useLog.getState().entries, now);
  await cancelOurs();
  if (reminders.length === 0) return;
  await ensureChannel();
  if (!(await permitted())) return;
  for (const r of reminders) await scheduleDate(r, now);
  const notified = await readNotified();
  const keep = await presentKm(reminders, notified);
  await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify([...keep]));
}

/**
 * Starts keeping reminder notifications in sync with the log; returns the stop
 * function. Call once from the app root, after the stores exist.
 */
export function startReminders(): () => void {
  try {
    // Without a handler a notification that fires while the app is open is dropped.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // No native module (tests, a broken build): reminders stay in the banner only.
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  // Syncs run one after another so a slow cancel never races the next schedule.
  let chain: Promise<void> = Promise.resolve();
  const resync = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      chain = chain.then(sync).catch(() => undefined);
    }, DEBOUNCE_MS);
  };

  if (useLog.getState().hydrated) resync();
  const offLog = useLog.subscribe((s, prev) => {
    if (s.hydrated && (s.entries !== prev.entries || !prev.hydrated)) resync();
  });
  // Scheduled titles are rendered text; a language change has to re-render them.
  const offLang = useSettings.subscribe((s, prev) => {
    if (s.language !== prev.language && useLog.getState().hydrated) resync();
  });

  return () => {
    if (timer) clearTimeout(timer);
    offLog();
    offLang();
  };
}
