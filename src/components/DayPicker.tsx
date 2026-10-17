/**
 * Opens Android's calendar on a day, as the entry form's date does (see
 * WhenPicker). Bounds are passed in so the caller decides what may be picked;
 * the result is the start of the chosen day.
 */

import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import { shiftDay } from '../lib/fuel';

export function openDayPicker({
  day,
  min,
  max,
  onPick,
}: {
  day: number;
  min?: number;
  max?: number;
  onPick: (day: number) => void;
}) {
  DateTimePickerAndroid.open({
    value: new Date(day),
    mode: 'date',
    ...(min !== undefined ? { minimumDate: new Date(min) } : {}),
    ...(max !== undefined ? { maximumDate: new Date(max) } : {}),
    onChange: (event, date) => {
      if (event.type !== 'set' || !date) return;
      onPick(shiftDay(date.getTime(), 0));
    },
  });
}
