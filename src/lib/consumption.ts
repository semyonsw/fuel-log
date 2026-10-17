/**
 * Which consumption the Summary calculator is using, for the line that says
 * so. The figure is edited in Settings, so the calculator has no input for it
 * any more; without this line the result would rest on a number the user
 * cannot see. Mirrors `effectiveKmPerLiter`: a valid typed figure wins, else
 * the log's.
 */

import { t } from '../i18n';
import { kmPerLiterFromRefuels } from './fuel';
import { parseNumber } from './numbers';
import type { Entry } from '../types';

export type ConsumptionSource = { lPer100: number; from: 'settings' | 'log' };

export function consumptionSource(typed: string, entries: Entry[]): ConsumptionSource | undefined {
  const n = typed ? parseNumber(typed) : undefined;
  if (n !== undefined && n > 0) return { lPer100: n, from: 'settings' };
  const kmPerL = kmPerLiterFromRefuels(entries);
  if (kmPerL === undefined || !(kmPerL > 0)) return undefined;
  return { lPer100: Math.round((100 / kmPerL) * 10) / 10, from: 'log' };
}

/** "Using 7.2 L/100 km (set in Settings)" / "Using 6.8 L/100 km from log". */
export function consumptionNote(src: ConsumptionSource | undefined): string | undefined {
  if (!src) return undefined;
  return src.from === 'settings'
    ? t('summary.consumption.settings', { l: src.lPer100 })
    : t('summary.consumption.log', { l: src.lPer100 });
}
