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
  /** Trip distance from the odometer/trip meter, or pre-filled from the GPS track. */
  distanceKm?: number;
  /**
   * The recorded GPS route, already filtered and simplified (see lib/geo), so
   * it is small enough for AsyncStorage. Absent on trips logged by hand and on
   * every entry written before tracking existed.
   */
  track?: TrackPoint[];
}

/** One GPS fix: degrees, and epoch ms. */
export interface TrackPoint {
  lat: number;
  lon: number;
  t: number;
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
  /** Fuel company, e.g. "Max Petrol". Optional, as typed. */
  station?: string;
  /** Where the station is, free text. Optional. */
  address?: string;
  grade?: FuelGrade;
}

/** The pump grades sold in Armenia; the Sentra's manual asks for regular. */
export type FuelGrade = '92' | '95' | '98' | 'diesel';

export type Entry = TripEntry | ReadingEntry | RefuelEntry;
