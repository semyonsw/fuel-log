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

export type EntryKind = 'trip' | 'reading' | 'refuel' | 'service' | 'expense';

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
  /** Odometer at the pump, km. Optional; it lets km-based service reminders follow real driving. */
  odometerKm?: number;
}

/** The pump grades sold in Armenia; the Sentra's manual asks for regular. */
export type FuelGrade = '92' | '95' | '98' | 'diesel';

/**
 * Car care, kept apart from other spending because it is what reminders are
 * about: "oil again in 10 000 km or 12 months, whichever comes first". The
 * odometer at the service is the km baseline; a later odometer (another
 * service, or a refuel that recorded one) says how far the car has gone since.
 */
export type ServiceCategory = 'oil' | 'repair' | 'tires' | 'inspection' | 'other';

export interface ServiceEntry extends EntryBase {
  kind: 'service';
  category: ServiceCategory;
  /** Total paid, AMD; 0 is allowed (warranty work, a free check). */
  costAmd: number;
  odometerKm?: number;
  /** Workshop or place, free text. */
  place?: string;
  /** Remind after this many km past `odometerKm`. */
  remindKm?: number;
  /** Remind this many months after `at`. */
  remindMonths?: number;
}

/** Everything else the car costs. Counted in spending, never in fuel figures. */
export type ExpenseCategory =
  | 'insurance'
  | 'fines'
  | 'taxes'
  | 'parking'
  | 'wash'
  | 'tolls'
  | 'parts'
  | 'accessories'
  | 'other';

export interface ExpenseEntry extends EntryBase {
  kind: 'expense';
  category: ExpenseCategory;
  /** Total paid, AMD. */
  amountAmd: number;
}

export type Entry = TripEntry | ReadingEntry | RefuelEntry | ServiceEntry | ExpenseEntry;
