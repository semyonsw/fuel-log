import { defineStrings } from '../define';

/**
 * Strings for the app area (shell, History and Settings tabs, timeline rows,
 * the map); keys are prefixed "app.". The empty-state text names the form's
 * Trip / Range / Refuel buttons, so it must use the form's own words.
 */
export const app = defineStrings({
  'app.tab.history': 'History',
  'app.tab.summary': 'Summary',
  'app.tab.settings': 'Settings',
  'app.fromGps': 'from GPS',

  'app.settings.consumption': 'Car consumption',
  'app.settings.fromLog': '{n} from log',
  'app.settings.consumptionA11y': 'Consumption, litres per 100 km',
  'app.settings.consumptionUnit': 'L/100 km',
  'app.settings.consumptionHint': 'Leave blank to use the figure worked out from your refuels.',
  'app.settings.ai': 'AI chat',
  'app.settings.keyA11y': 'Gemini API key',
  'app.settings.keySaved': 'Key saved. Type a new one to replace it',
  'app.settings.keyHint':
    'Gemini API key. Get one at aistudio.google.com. It is stored on this phone and in your backup file.',
  'app.settings.keyPrivacy':
    'Privacy: photos you send and your log (trips, places, refuels) go to Google Gemini to answer. Photos are not kept on this phone.',
  'app.settings.saveKey': 'Save key',
  'app.settings.removeKey': 'Remove key',
  'app.settings.modelIntro': 'Model: current Gemini models that read photos.',
  'app.settings.modelChecking': 'Checking which models your key can use…',

  'app.log.today': 'Today: {driven} driven',
  'app.log.todayUsed': '{used} range used',
  'app.log.todayCost': '≈ {cost}',
  'app.log.emptyTitle': 'Nothing logged yet',
  'app.log.emptyText':
    'Tap the + button below. Start with Range to note what the dashboard shows now, then log a Trip each time you drive: where from, where to, distance and range left. Log a refuel with the fuel-pump button.',
  'app.log.start': 'Start trip',
  'app.log.startHint': 'records the route with GPS',
  'app.log.startA11y': 'Start trip, record the route with GPS',
  'app.log.recording': 'Recording trip',
  'app.log.stop': 'Stop',
  'app.log.stopA11y': 'Stop trip',
  'app.log.bgTitle': 'Allow location all the time',
  'app.log.bgText':
    'To keep recording with the screen off, set Location to "Allow all the time" for Fuel Log.',
  'app.log.notNow': 'Not now',
  'app.log.openSettings': 'Open settings',
  'app.log.permTitle': 'Location is off for Fuel Log',
  'app.log.permText': 'Allow location to record a trip.',
  'app.log.failTitle': 'Could not start recording',
  'app.log.failText': 'Check that location is turned on, then try again.',

  'app.row.editHint': 'Edit this entry',
  'app.row.left': '{km} left',
  'app.row.used': 'used',

  'app.map.offline': 'Offline: map unavailable, route shown on a grid',
  'app.map.expand': 'Full-screen map',
  'app.map.close': 'Close map',
  'app.map.zoomIn': 'Zoom in',
  'app.map.zoomOut': 'Zoom out',
  'app.map.recenter': 'Show the whole route',
});
