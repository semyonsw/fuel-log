/**
 * The log, modelled on the Samsung Notes it replaces.
 *
 * Every note entry was one of three things: a trip ("4micro - charents school
 * 22.5km / 107km benzin"), a bare look at the dashboard ("20:16 / 106km benzin"),
 * or — new here — a fill-up. So there are three entry kinds, and every one of them
 * may carry the dashboard's remaining range at that moment. Range is the one
 * number every note had; "range used" by a trip is derived from the reading
 * before it, never typed.
 *
 * Distances and range are kilometres, money is whole AMD, times are epoch ms.
 */

export type EntryKind = 'trip' | 'reading' | 'refuel';

interface EntryBase {
  id: string;
  /** When it happened (epoch ms). Editable — notes were often written after. */
  at: number;
  /** Dashboard fuel range after this entry, in km. */
  rangeKm?: number;
  note?: string;
}

export interface TripEntry extends EntryBase {
  kind: 'trip';
  from: string;
  /** Places passed through, in order. */
  stops: string[];
  to: string;
  /** Trip distance from the odometer/trip meter. */
  distanceKm?: number;
}

export interface ReadingEntry extends EntryBase {
  kind: 'reading';
  rangeKm: number;
}

export interface RefuelEntry extends EntryBase {
  kind: 'refuel';
  liters: number;
  /** Total paid at the station, AMD. */
  priceAmd: number;
}

export type Entry = TripEntry | ReadingEntry | RefuelEntry;
