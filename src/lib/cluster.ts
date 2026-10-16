/**
 * Reading the instrument cluster: the prompt Gemini gets, the shape it must
 * answer in, and the checks its answer has to pass before it touches a form.
 *
 * ── THE MODEL'S ANSWER IS DATA, AND DATA IS CHECKED ──────────────────────
 *
 * Gemini answers with JSON against a schema, but a schema only promises the
 * shape. A photo of the odometer can come back as a 40 000 km "trip"; a
 * blurry digit can come back as a 900 km range. So each value is checked on
 * its own and an implausible one becomes null — that field is left for the
 * user — instead of failing the whole reading.
 *
 * Limits: range 0–1200 km (a Sentra's 47 L tank at a very frugal 4 L/100 km is
 * about 1 175 km); trip 0–2000 km (a trip meter reset for one drive, not the
 * odometer — anything larger is the odometer or a misread).
 *
 * ── NOTHING IS SAVED FROM HERE ───────────────────────────────────────────
 *
 * A reading only ever becomes form strings, exactly as if typed, and only
 * into fields that are still empty. The user reviews the form and presses
 * Save; validation, haptics and range used apply unchanged.
 */

import type { Draft } from './draft';
import type { Entry } from '../types';
import { formatTime } from './entries';

export const MAX_RANGE_KM = 1200;
export const MAX_TRIP_KM = 2000;

export type Confidence = 'high' | 'medium' | 'low';

export type ClusterReading = {
  rangeKm: number | null;
  tripKm: number | null;
  /** "HH:MM", 24-hour. */
  clock: string | null;
  confidence: Confidence;
  notes: string | null;
};

/** One chat turn's answer: prose for the bubble, a reading when there is one. */
export type ChatReply = { reply: string; reading: ClusterReading | null };

export const CAR = 'Nissan Sentra 2023 SV (2.0 L petrol)';

export const SYSTEM_PROMPT = `You are the assistant inside Fuel Log, a personal Android app for logging car trips, dashboard fuel-range readings and refuels. The car is a ${CAR}. Money is Armenian dram (AMD); distances are km.

You do two things:
1. Read photos of the car's instrument cluster. Extract:
   - rangeKm: the distance-to-empty estimate in km (may sit next to a fuel-pump icon, labelled "Range" or similar).
   - tripKm: the resettable trip meter (Trip A / Trip B), NOT the total odometer.
   - clock: the time shown, as HH:MM in 24-hour format (convert a 12-hour clock).
   Return null for anything not clearly visible. Never guess. Units are km.
   When the user corrects you ("that's the odometer", "trip is 14.2"), send the corrected reading again.
2. Answer questions about the user's log, which is given below as JSON. Use only that data; say plainly when the log does not contain the answer. Keep answers short.

Always answer as JSON matching the schema: "reply" is your message to the user (plain text, short). "reading" is the cluster reading when this turn is about a photo or a correction of one, otherwise null.`;

/** Gemini's OpenAPI-style schema (types upper-case, `nullable`), as generateContent expects. */
export const REPLY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    reading: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        rangeKm: { type: 'NUMBER', nullable: true },
        tripKm: { type: 'NUMBER', nullable: true },
        clock: { type: 'STRING', nullable: true, description: 'HH:MM, 24-hour' },
        confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
        notes: { type: 'STRING', nullable: true },
      },
      required: ['rangeKm', 'tripKm', 'clock', 'confidence'],
    },
  },
  required: ['reply', 'reading'],
} as const;

/** The log, compact, for the model to answer questions from. Local times, as the user lives them. */
export function logContext(entries: Entry[]): string {
  const rows = [...entries]
    .sort((a, b) => a.at - b.at)
    .map((e) => {
      const d = new Date(e.at);
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const { id: _id, at: _at, ...rest } = e;
      const clean: Record<string, unknown> = { when: `${day} ${formatTime(e.at)}`, ...rest };
      if (e.kind === 'trip' && e.track) clean.track = `${e.track.length} GPS points`;
      return clean;
    });
  return JSON.stringify(rows);
}

const num = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null;

const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Validates whatever came back; undefined when there is no usable reply at all. */
export function parseChatReply(raw: unknown): ChatReply | undefined {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (typeof obj !== 'object' || obj === null) return undefined;
  const o = obj as { reply?: unknown; reading?: unknown };
  const reply = typeof o.reply === 'string' ? o.reply.trim() : '';
  const reading = parseClusterReply(o.reading);
  if (!reply && !reading) return undefined;
  return { reply, reading };
}

export function parseClusterReply(raw: unknown): ClusterReading | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const clockRaw = typeof r.clock === 'string' ? r.clock.trim() : '';
  const m = CLOCK.exec(clockRaw);
  const reading: ClusterReading = {
    rangeKm: num(r.rangeKm, MAX_RANGE_KM),
    tripKm: num(r.tripKm, MAX_TRIP_KM),
    clock: m ? `${m[1].padStart(2, '0')}:${m[2]}` : null,
    confidence:
      r.confidence === 'high' || r.confidence === 'medium' || r.confidence === 'low'
        ? r.confidence
        : 'low',
    notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim() : null,
  };
  return reading.rangeKm === null && reading.tripKm === null && reading.clock === null
    ? null
    : reading;
}

/**
 * Today at HH:MM; if that is still in the future, the photo was taken before
 * midnight, so yesterday at HH:MM.
 */
export function clockToAt(clock: string, now: number): number | undefined {
  const m = CLOCK.exec(clock.trim());
  if (!m) return undefined;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/** Which draft fields a reading filled, so the form can mark them "from photo". */
export type PhotoFields = Partial<Record<'range' | 'distance' | 'at', true>>;

/**
 * Reading → draft strings, by kind (trip distance only for a Trip), into
 * EMPTY fields only. `at` counts as empty when `atIsDefault` (the form's
 * untouched "now").
 */
export function mergePhotoIntoDraft(
  draft: Draft,
  reading: ClusterReading,
  now: number,
  atIsDefault = true,
): { draft: Draft; filled: PhotoFields } {
  const next = { ...draft };
  const filled: PhotoFields = {};
  if (reading.rangeKm !== null && next.range.trim() === '') {
    next.range = String(reading.rangeKm);
    filled.range = true;
  }
  if (next.kind === 'trip' && reading.tripKm !== null && next.distance.trim() === '') {
    next.distance = String(reading.tripKm);
    filled.distance = true;
  }
  if (reading.clock !== null && atIsDefault) {
    const at = clockToAt(reading.clock, now);
    if (at !== undefined) {
      next.at = at;
      filled.at = true;
    }
  }
  return { draft: next, filled };
}

/** The ±0.1 / ±1 nudges on the reading card: one decimal, never below zero. */
export function nudge(value: number | null, step: number, max: number): number {
  const v = Math.round(((value ?? 0) + step) * 10) / 10;
  return Math.min(max, Math.max(0, v));
}

/** Which kind an inserted reading most likely is: a trip meter means a trip. */
export function suggestedKind(r: ClusterReading): 'trip' | 'reading' {
  return r.tripKm !== null ? 'trip' : 'reading';
}
