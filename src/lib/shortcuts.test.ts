import { describe, expect, it } from 'vitest';

import { setLang } from '../i18n';
import { shortcutItems, shortcutRoute } from './shortcuts';

describe('shortcutRoute', () => {
  it('opens a new refuel or range reading form', () => {
    expect(shortcutRoute('refuel')).toEqual({ to: 'form', kind: 'refuel' });
    expect(shortcutRoute('range')).toEqual({ to: 'form', kind: 'reading' });
  });

  it('starts a trip or opens the chat', () => {
    expect(shortcutRoute('startTrip')).toEqual({ to: 'startTrip' });
    expect(shortcutRoute('chat')).toEqual({ to: 'chat' });
  });

  it('ignores ids it does not know, and no id at all', () => {
    expect(shortcutRoute('trip')).toBeNull();
    expect(shortcutRoute('')).toBeNull();
    expect(shortcutRoute(undefined)).toBeNull();
    expect(shortcutRoute(null)).toBeNull();
  });
});

describe('shortcutItems', () => {
  it('lists every shortcut with a route, titled in the current language', () => {
    setLang('en');
    const en = shortcutItems();
    expect(en.map((i) => i.id)).toEqual(['refuel', 'range', 'startTrip', 'chat']);
    for (const item of en) expect(shortcutRoute(item.id)).not.toBeNull();
    expect(en[0].title).toBe('Refuel');

    setLang('ru');
    expect(shortcutItems()[0].title).toBe('Заправка');
    setLang('en');
  });
});
