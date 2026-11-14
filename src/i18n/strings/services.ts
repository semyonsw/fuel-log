import { defineStrings } from '../define';

/** Strings for the services area; keys are prefixed "services.". */
export const services = defineStrings({
  'services.backup.writeFailed': 'Could not write to the backup folder. Pick it again.',
  'services.backup.readFailed': 'Could not read that file.',
  'services.tracking.title': 'Recording your trip',
  'services.tracking.body': 'Fuel Log is recording the route. Open the app to stop.',
});
