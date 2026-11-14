import { defineStrings } from '../define';

/**
 * Strings for the add/edit form and the lib code behind it (draft
 * validation); keys are prefixed "form.".
 */
export const form = defineStrings({
  'form.title.new': 'New entry',
  'form.title.edit': 'Edit entry',
  'form.title.newRefuel': 'New refuel',
  'form.title.editRefuel': 'Edit refuel',
  'form.close': 'Close',

  'form.kind.trip': 'Trip',
  'form.kind.reading': 'Range',
  'form.kind.refuel': 'Refuel',
  'form.kindHint.trip': 'Where you drove, and the range left after.',
  'form.kindHint.reading': 'What the dashboard shows as range left right now.',
  'form.kindHint.refuel': 'Fuel you bought: litres and the total paid.',

  'form.route': 'Route',
  'form.gpsDistance': 'GPS distance {km}',
  'form.from': 'From',
  'form.to': 'To',
  'form.fromPlaceholder': 'e.g. 4micro',
  'form.toPlaceholder': 'e.g. charents school',
  'form.stop': 'Stop {n}',
  'form.remove': 'Remove',
  'form.removeStopA11y': 'Remove stop {n}',
  'form.addStop': '+ Add stop',
  'form.returnTrip': '↔ Return trip',
  'form.returnTripA11y': 'Swap from and to (return trip)',
  'form.distance': 'Distance',
  'form.rangeLeft': 'Range left',
  'form.unit.km': 'km',
  'form.unit.l': 'L',
  'form.lastRange': 'last {km}',
  'form.estimate': '≈ {liters} · ≈ {amd} for this trip',
  'form.sinceLast': 'since last reading',

  'form.liters': 'Liters',
  'form.totalPaid': 'Total paid',
  'form.rangeAfter': 'Range after refueling (optional)',
  'form.note': 'Note (optional)',
  'form.notePlaceholder': 'Anything worth remembering',

  'form.delete': 'Delete',
  'form.saveChanges': 'Save changes',
  'form.deleteTitle': 'Delete this entry?',
  'form.deleteBody': 'This can’t be undone.',

  'form.showSaved': 'Show saved values for {field}',
  'form.hideSaved': 'Hide saved values for {field}',

  'form.err.notNumber': 'Not a number',
  'form.err.from': 'Where did you start?',
  'form.err.to': 'Where did you end?',
  'form.err.range': 'Enter the range left',
  'form.err.liters': 'Enter liters',
  'form.err.price': 'Enter the price',
  'form.save.need': 'To save, fill in: {fields}',
  'form.save.check': 'Check: {fields}',
});
