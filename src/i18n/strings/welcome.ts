import { defineStrings } from '../define';

/** Strings for the welcome area; keys are prefixed "welcome.". */
export const welcome = defineStrings({
  'welcome.title': 'Welcome to Fuel Log',
  'welcome.lead':
    'Everything stays on this phone. To record trips, read dashboard photos and back up your data, Fuel Log needs:',
  'welcome.location.title': 'Location',
  'welcome.location.why': 'Records the route and distance of a trip you start.',
  'welcome.background.title': 'Location all the time',
  'welcome.background.why':
    'Keeps recording with the screen off. Android opens a settings page: choose "Allow all the time".',
  'welcome.notifications.title': 'Notifications',
  'welcome.notifications.why': 'Shows "{notice}" while GPS is on, so you always know.',
  'welcome.camera.title': 'Camera',
  'welcome.camera.why': 'Photographs the dashboard for the AI to read.',
  'welcome.folder.title': 'Backup folder',
  'welcome.folder.why': 'Pick a folder once; every change is saved there as one JSON file.',
  'welcome.allowed': 'Allowed',
  'welcome.notAllowed': 'Not allowed',
  'welcome.askedLater': 'Anything not allowed is asked again when you first use it.',
  'welcome.start': 'Start using Fuel Log',
  'welcome.asking': 'Asking…',
  'welcome.allowAll': 'Allow all',
  'welcome.skip': 'Skip for now',
});
