/**
 * The AI assistant's contract: the prompt Gemini gets, the shape it must
 * answer in, the checks its answer has to pass, and how an approved answer
 * becomes log entries.
 *
 * ── SAY IT, APPROVE IT ───────────────────────────────────────────────────
 *
 * The user types what happened the way they would say it — "bought 15 L for
 * 9000 AMD, fuel was 15 km, now shows 250 km" — or sends a dashboard photo.
 * Gemini answers with the entries that implies, in the order they happened:
 * here a range reading of 15, then a refuel of 15 L / 9000 AMD with 250 km
 * after. The chat shows them as editable cards; one Approve saves them all.
 * That order matters: the reading before the refuel is what lets the app
 * derive km-per-litre, so approved entries get strictly increasing times.
 *
 * ── THE MODEL'S ANSWER IS DATA, AND DATA IS CHECKED ──────────────────────
 *
 * A schema only promises the shape. An odometer can come back as a 40 000 km
 * trip; a blurry digit as a 900 km range. Each value is checked on its own and
 * an implausible one becomes empty — that field is left for the user — rather
 * than failing the whole answer. Limits: range ≤ 1200 km, trip ≤ 2000 km,
 * one refuel ≤ 200 L and ≤ 2 000 000 AMD.
 *
 * Saving goes through `validateDraft`, exactly like the form, so an approved
 * entry is held to the same rules as a typed one.
 */

import type { Entry, EntryKind, FuelGrade } from '../types';
import { emptyDraft, saveHint, validateDraft, type Draft } from './draft';
import { formatTime } from './entries';
import { normalizePlace } from './places';

export const MAX_RANGE_KM = 1200;
export const MAX_TRIP_KM = 2000;
export const MAX_LITERS = 200;
export const MAX_PRICE_AMD = 2_000_000;

export type Confidence = 'high' | 'medium' | 'low';

/** One entry the assistant proposes, as the card edits it. Null/'' = not given. */
export type Proposal = {
  kind: EntryKind;
  rangeKm: number | null;
  distanceKm: number | null;
  liters: number | null;
  priceAmd: number | null;
  from: string;
  stops: string[];
  to: string;
  station: string;
  address: string;
  grade: FuelGrade | null;
  /** "HH:MM", 24-hour; null = now. */
  clock: string | null;
  note: string;
};

/** One chat turn's answer: prose for the bubble, entries when there is something to log. */
export type ChatReply = {
  reply: string;
  entries: Proposal[];
  confidence: Confidence | null;
};

export const SYSTEM_PROMPT = `You are the assistant inside Fuel Log, an Android app where the user keeps a diary of their car: trips, dashboard fuel-range readings and refuels. Call it "the car". Money is Armenian dram (AMD), distances km, fuel litres.

Entry kinds:
- "reading": the range left (km) the dashboard shows at a moment. Field: rangeKm.
- "trip": a drive. Fields: from, stops (places passed, in order), to, distanceKm (trip distance), rangeKm (range left after the trip).
- "refuel": fuel bought. Fields: liters, priceAmd (the TOTAL paid; if the user gives a price per litre, multiply by the litres), rangeKm (range shown after refuelling), station (company), address, grade ("92", "95", "98" or "diesel").

Your jobs:
1. When the user tells you something to log, put it in "entries", in the order it happened, with every value they gave. Leave anything they did not say as null or "". Never invent a value.
   Example: "I bought 15L for 9000 AMD, my fuel was 15km now shows 250km" -> entries: [{"kind":"reading","rangeKm":15}, {"kind":"refuel","liters":15,"priceAmd":9000,"rangeKm":250}].
   Example: "drove from home to work, 12.5 km, 230 left" -> [{"kind":"trip","from":"home","to":"work","distanceKm":12.5,"rangeKm":230}].
2. Photos of the instrument cluster: the distance-to-empty estimate is rangeKm (may sit next to a fuel-pump icon); the resettable trip meter (Trip A / Trip B, NOT the total odometer) is distanceKm on a trip; the clock is "clock". Only range visible -> one "reading". Use null for anything not clearly visible; never guess.
3. Corrections ("that's the odometer", "it was 16 litres"): send the full corrected set of entries again.
4. Questions about the log: answer from the log JSON below, with "entries": []. Say plainly when the log does not have the answer.

"clock" is HH:MM in 24-hour time, only when the user or the photo gives a time; otherwise null. "confidence" is how sure you are about values read from a photo (null when there is no photo).
"reply" is a short plain-text message. The app shows the entries as cards for the user to check and approve, so do not repeat every number.`;

const nullable = (type: string, extra: object = {}) => ({ type, nullable: true, ...extra });

/** Gemini's OpenAPI-style schema (upper-case types, `nullable`), as generateContent expects. */
export const REPLY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    entries: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: ['trip', 'reading', 'refuel'] },
          rangeKm: nullable('NUMBER'),
          distanceKm: nullable('NUMBER'),
          liters: nullable('NUMBER'),
          priceAmd: nullable('NUMBER'),
          from: nullable('STRING'),
          stops: nullable('ARRAY', { items: { type: 'STRING' } }),
          to: nullable('STRING'),
          station: nullable('STRING'),
          address: nullable('STRING'),
          grade: nullable('STRING', { enum: ['92', '95', '98', 'diesel'] }),
          clock: nullable('STRING', { description: 'HH:MM, 24-hour' }),
          note: nullable('STRING'),
        },
        required: ['kind'],
      },
    },
    confidence: nullable('STRING', { enum: ['high', 'medium', 'low'] }),
  },
  required: ['reply', 'entries'],
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

const KINDS = new Set<EntryKind>(['trip', 'reading', 'refuel']);
const GRADES = new Set<FuelGrade>(['92', '95', '98', 'diesel']);
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const num = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null;

const text = (v: unknown): string => (typeof v === 'string' ? normalizePlace(v).slice(0, 80) : '');

export function parseClock(v: unknown): string | null {
  const m = typeof v === 'string' ? CLOCK.exec(v.trim()) : null;
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

export function emptyProposal(kind: EntryKind): Proposal {
  return {
    kind,
    rangeKm: null,
    distanceKm: null,
    liters: null,
    priceAmd: null,
    from: '',
    stops: [],
    to: '',
    station: '',
    address: '',
    grade: null,
    clock: null,
    note: '',
  };
}

/** One proposed entry from the model; null when it is not even a known kind. */
export function parseProposal(raw: unknown): Proposal | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!KINDS.has(r.kind as EntryKind)) return null;
  const price = num(r.priceAmd, MAX_PRICE_AMD);
  return {
    kind: r.kind as EntryKind,
    rangeKm: num(r.rangeKm, MAX_RANGE_KM),
    distanceKm: num(r.distanceKm, MAX_TRIP_KM),
    liters: num(r.liters, MAX_LITERS),
    priceAmd: price === null ? null : Math.round(price),
    from: text(r.from),
    stops: Array.isArray(r.stops) ? r.stops.map(text).filter(Boolean) : [],
    to: text(r.to),
    station: text(r.station),
    address: text(r.address),
    grade: GRADES.has(r.grade as FuelGrade) ? (r.grade as FuelGrade) : null,
    clock: parseClock(r.clock),
    note: typeof r.note === 'string' ? r.note.trim().slice(0, 200) : '',
  };
}

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
  const o = obj as { reply?: unknown; entries?: unknown; confidence?: unknown };
  const reply = typeof o.reply === 'string' ? o.reply.trim() : '';
  const entries = Array.isArray(o.entries)
    ? o.entries.map(parseProposal).filter((p): p is Proposal => p !== null)
    : [];
  if (!reply && entries.length === 0) return undefined;
  const confidence =
    o.confidence === 'high' || o.confidence === 'medium' || o.confidence === 'low'
      ? o.confidence
      : null;
  return { reply, entries, confidence };
}

/**
 * Today at HH:MM; if that is still in the future, it was before midnight, so
 * yesterday at HH:MM.
 */
export function clockToAt(clock: string, now: number): number | undefined {
  const m = CLOCK.exec(clock.trim());
  if (!m) return undefined;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

const MINUTE = 60_000;

/**
 * When each proposed entry happened: its clock if it has one, else now. Then
 * made strictly increasing in the order given — a later entry is never at or
 * before an earlier one — by moving earlier entries back a minute at a time,
 * so the last entry keeps its own time (usually "now").
 */
export function proposalTimes(proposals: Proposal[], now: number): number[] {
  const times = proposals.map((p) => (p.clock ? (clockToAt(p.clock, now) ?? now) : now));
  for (let i = times.length - 2; i >= 0; i--) {
    if (times[i] >= times[i + 1]) times[i] = times[i + 1] - MINUTE;
  }
  return times;
}

const str = (n: number | null) => (n === null ? '' : String(n));

export function proposalToDraft(p: Proposal, at: number): Draft {
  return {
    ...emptyDraft(p.kind, at),
    range: str(p.rangeKm),
    distance: str(p.distanceKm),
    liters: str(p.liters),
    price: str(p.priceAmd),
    from: p.from,
    stops: [...p.stops],
    to: p.to,
    station: p.station,
    address: p.address,
    ...(p.grade ? { grade: p.grade } : {}),
    note: p.note,
  };
}

/**
 * Approve: every proposal through the form's own validation. All or nothing —
 * a half-saved refuel-with-reading would make the log wrong — so any problem
 * is reported per card and nothing is saved.
 */
export function proposalsToEntries(
  proposals: Proposal[],
  now: number,
  newId: () => string,
): { ok: true; entries: Entry[] } | { ok: false; problems: (string | undefined)[] } {
  const times = proposalTimes(proposals, now);
  const results = proposals.map((p, i) => validateDraft(proposalToDraft(p, times[i]), newId()));
  const entries: Entry[] = [];
  for (const r of results) if (r.ok) entries.push(r.entry);
  if (entries.length === results.length) return { ok: true, entries };
  return { ok: false, problems: results.map((r) => (r.ok ? undefined : saveHint(r.errors))) };
}

/** The ±0.1 / ±1 nudges on the cards: one decimal, never below zero or above `max`. */
export function nudge(value: number | null, step: number, max: number): number {
  const v = Math.round(((value ?? 0) + step) * 10) / 10;
  return Math.min(max, Math.max(0, v));
}

/**
 * A reading saved by an earlier version of the app (photo only: range, trip
 * meter, clock) as today's proposals, so old chats still show a usable card.
 */
export function legacyReadingToProposals(raw: unknown): Proposal[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const r = raw as Record<string, unknown>;
  const trip = num(r.tripKm, MAX_TRIP_KM);
  const p = emptyProposal(trip !== null ? 'trip' : 'reading');
  p.rangeKm = num(r.rangeKm, MAX_RANGE_KM);
  p.distanceKm = trip;
  p.clock = parseClock(r.clock);
  return p.rangeKm === null && p.distanceKm === null && p.clock === null ? [] : [p];
}
