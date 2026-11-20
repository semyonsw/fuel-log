import { defineStrings } from '../define';

/** Strings for the Summary's statistics: month charts, trends, top routes. Keys are prefixed "stats.". */
export const stats = defineStrings({
  'stats.title': 'Statistics',
  'stats.hint': 'Not tied to the period above: the last {n} months, and every refuel and trip.',

  'stats.chart.spent': 'Fuel money by month',
  'stats.chart.km': 'Km driven by month',
  'stats.chart.noSpending': 'No refuels in the last {n} months.',
  'stats.chart.noKm': 'No driving in the last {n} months.',
  'stats.compare': 'This month {current} · {month} {previous}',

  'stats.chart.price': 'Price per litre',
  'stats.chart.kmPerL': 'Km per litre (dashboard)',
  'stats.chart.amdPerKm': 'AMD per km (dashboard)',
  'stats.chart.kmPerLValue': '{n} km/L',
  'stats.chart.amdPerKmValue': '{n} AMD/km',
  'stats.chart.notEnough': 'Needs at least two refuels.',
  'stats.chart.kmPerLNotEnough': 'Needs two refuels with range before and after.',

  'stats.routes': 'Top routes',
  'stats.routes.empty': 'Trips with a From and a To show here.',
  'stats.routes.trips.one': '{n} trip',
  'stats.routes.trips.other': '{n} trips',
  'stats.routes.a11y': '{from} to {to}: {trips}, {km}, {cost}',
});
