/**
 * App-icon shortcuts (long-press the launcher icon): which ones exist, and
 * what each one opens.
 *
 * The ids are what Android stores with a shortcut, including one pinned to
 * the home screen, so they never change; titles are read in the current
 * language every time the list is (re)published. Routing is a pure function
 * so that an unknown id, from an older or newer build's pinned shortcut,
 * provably does nothing rather than opening something odd.
 */

import { t, type StringKey } from '../i18n';

export type ShortcutId = 'refuel' | 'range' | 'startTrip' | 'chat';

/** Launcher order: the most frequent things first, as the menu reads top-down. */
const SHORTCUTS: { id: ShortcutId; titleKey: StringKey }[] = [
  { id: 'refuel', titleKey: 'shortcuts.refuel' },
  { id: 'range', titleKey: 'shortcuts.range' },
  { id: 'startTrip', titleKey: 'shortcuts.startTrip' },
  { id: 'chat', titleKey: 'shortcuts.chat' },
];

/**
 * What the app does for a shortcut:
 *   form       a new entry of this kind
 *   startTrip  start GPS recording, as the Log screen's button does
 *   chat       open the AI chat
 */
export type ShortcutRoute =
  { to: 'form'; kind: 'refuel' | 'reading' } | { to: 'startTrip' } | { to: 'chat' };

export function shortcutItems(): { id: ShortcutId; title: string }[] {
  return SHORTCUTS.map(({ id, titleKey }) => ({ id, title: t(titleKey) }));
}

export function shortcutRoute(id: string | undefined | null): ShortcutRoute | null {
  switch (id) {
    case 'refuel':
      return { to: 'form', kind: 'refuel' };
    case 'range':
      return { to: 'form', kind: 'reading' };
    case 'startTrip':
      return { to: 'startTrip' };
    case 'chat':
      return { to: 'chat' };
    default:
      return null;
  }
}
