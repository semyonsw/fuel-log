import { defineStrings } from '../define';

/**
 * Strings for the app-icon shortcuts (long-press the launcher icon); keys are
 * prefixed "shortcuts.". Launchers cut labels at about ten characters, so
 * they stay short.
 */
export const shortcuts = defineStrings(
  {
    'shortcuts.refuel': 'Refuel',
    'shortcuts.range': 'Range',
    'shortcuts.startTrip': 'Start trip',
    'shortcuts.chat': 'AI chat',
  },
  {
    'shortcuts.refuel': 'Լիցքավորում',
    'shortcuts.range': 'Պաշար',
    'shortcuts.startTrip': 'Սկսել ուղևորություն',
    'shortcuts.chat': 'AI զրույց',
  },
  {
    'shortcuts.refuel': 'Заправка',
    'shortcuts.range': 'Запас хода',
    'shortcuts.startTrip': 'Начать поездку',
    'shortcuts.chat': 'Чат с ИИ',
  },
);
