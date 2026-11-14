import { defineStrings } from '../define';

/**
 * Strings for the lib area; keys are prefixed "lib.".
 *
 * Day and month names are abbreviations as a phone calendar shows them.
 * Units stay after the number with one space: `splitUnit` cuts there.
 */
export const lib = defineStrings({
  'lib.unit.km': 'km',
  'lib.unit.l': 'L',
  'lib.date.day': '{weekday}, {date} {month}',
  'lib.weekday.0': 'Sun',
  'lib.weekday.1': 'Mon',
  'lib.weekday.2': 'Tue',
  'lib.weekday.3': 'Wed',
  'lib.weekday.4': 'Thu',
  'lib.weekday.5': 'Fri',
  'lib.weekday.6': 'Sat',
  'lib.month.0': 'Jan',
  'lib.month.1': 'Feb',
  'lib.month.2': 'Mar',
  'lib.month.3': 'Apr',
  'lib.month.4': 'May',
  'lib.month.5': 'Jun',
  'lib.month.6': 'Jul',
  'lib.month.7': 'Aug',
  'lib.month.8': 'Sep',
  'lib.month.9': 'Oct',
  'lib.month.10': 'Nov',
  'lib.month.11': 'Dec',
  'lib.duration.lessThanMinute': '<1 min',
  'lib.duration.minutes': '{m} min',
  'lib.duration.hours': '{h}h',
  'lib.duration.hoursMinutes': '{h}h {m}m',
});
