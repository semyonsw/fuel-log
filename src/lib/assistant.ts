/**
 * The AI assistant's contract: the prompt Gemini gets, the shape it must
 * answer in, the checks its answer has to pass, and how an approved answer
 * changes the log.
 *
 * ── SAY IT, APPROVE IT ───────────────────────────────────────────────────
 *
 * The user types what happened the way they would say it — "bought 15 L for
 * 9000 AMD, fuel was 15 km, now shows 250 km" — or sends a dashboard photo.
 * Gemini answers with the changes that implies, in the order they happened:
 * here a range reading of 15, then a refuel of 15 L / 9000 AMD with 250 km
 * after. The chat shows them as editable cards; one Approve saves them all.
 * That order matters: the reading before the refuel is what lets the app
 * derive km-per-litre, so added entries get strictly increasing times.
 *
 * ── EVERY CHANGE IS A CARD ───────────────────────────────────────────────
 *
 * A change is an add, an update or a delete. Nothing the model says touches
 * the log until the user approves the card, and an update or delete is shown
 * with the entry it is about (`before`), so "it was 30 L, not 20" reads as
 * 20 → 30 and a delete shows what is about to go.
 *
 * The model points at entries by a short ref ("e12") that exists only for one
 * request: refs are handed out per request and mapped back to real ids the
 * moment the answer arrives, so a card holds an id that survives the log
 * changing, and history sent back to the model uses that request's refs.
 *
 * ── THE MODEL'S ANSWER IS DATA, AND DATA IS CHECKED ──────────────────────
 *
 * A schema only promises the shape. An odometer can come back as a 40 000 km
 * trip; a blurry digit as a 900 km range. Each value is checked on its own and
 * an implausible one becomes empty — that field is left for the user — rather
 * than failing the whole answer. A change aimed at an entry that does not
 * exist is dropped. Limits: range ≤ 1200 km, trip ≤ 2000 km, one refuel ≤
 * 200 L, money ≤ 2 000 000 AMD.
 *
 * Saving goes through `validateDraft`, exactly like the form, so an approved
 * entry is held to the same rules as a typed one.
 */

import { t } from '../i18n';
import type { Entry, EntryKind, ExpenseCategory, FuelGrade, ServiceCategory } from '../types';
import {
  EXPENSE_CATEGORIES,
  isExpenseCategory,
  isServiceCategory,
  SERVICE_CATEGORIES,
} from './categories';
import {
  draftFromEntry,
  emptyDraft,
  formKinds,
  saveHint,
  validateDraft,
  type Draft,
} from './draft';
import { dayKey, formatTime } from './entries';
import { buildFacts, type Facts } from './insights';
import { normalizePlace } from './places';

export const MAX_RANGE_KM = 1200;
export const MAX_TRIP_KM = 2000;
export const MAX_LITERS = 200;
export const MAX_PRICE_AMD = 2_000_000;
export const MAX_ODOMETER_KM = 2_000_000;
export const MAX_REMIND_KM = 100_000;
export const MAX_REMIND_MONTHS = 60;

export type Confidence = 'high' | 'medium' | 'low';
export type ChangeOp = 'add' | 'update' | 'delete';

/** An entry's values as a card edits them. Null/'' = not given. */
export type ProposalValues = {
  kind: EntryKind;
  rangeKm: number | null;
  distanceKm: number | null;
  liters: number | null;
  /** Refuel total, service cost or expense amount, like the form's one price field. */
  priceAmd: number | null;
  from: string;
  stops: string[];
  to: string;
  station: string;
  address: string;
  grade: FuelGrade | null;
  category: ServiceCategory | ExpenseCategory | null;
  odometerKm: number | null;
  place: string;
  remindKm: number | null;
  remindMonths: number | null;
  /** "YYYY-MM-DD", local; null = today (with `clock`, the clock rule below). */
  date: string | null;
  /** "HH:MM", 24-hour; null = now. */
  clock: string | null;
  note: string;
};

/** One change the assistant proposes. */
export type Proposal = ProposalValues & {
  op: ChangeOp;
  /** update/delete: the log entry's id (the model's ref, mapped back on arrival). */
  target: string | null;
  /** update/delete: the entry as it was when proposed. */
  before: ProposalValues | null;
};

/** One chat turn's answer: prose for the bubble, changes when there is something to save. */
export type ChatReply = {
  reply: string;
  changes: Proposal[];
  confidence: Confidence | null;
};

export const SYSTEM_PROMPT = `You are the assistant inside Fuel Log, an Android app where the user keeps a diary of their car: trips, dashboard fuel-range readings, refuels, services and other car expenses. Call it "the car". Money is Armenian dram (AMD), distances km, fuel litres.

Entry kinds:
- "reading": the range left (km) the dashboard shows at a moment. Field: rangeKm.
- "trip": a drive. Fields: from, stops (places passed, in order), to, distanceKm (trip distance), rangeKm (range left after the trip).
- "refuel": fuel bought. Fields: liters, priceAmd (the TOTAL paid; if the user gives a price per litre, multiply by the litres), rangeKm (range shown after refuelling), station (company), address, grade ("92", "95", "98" or "diesel"), odometerKm.
- "service": car care. Fields: category ("oil", "repair", "tires", "inspection", "other"), priceAmd (the cost; 0 for free/warranty work), odometerKm, place (workshop), remindKm (remind after this many km), remindMonths (remind after this many months).
- "expense": other car spending. Fields: category ("insurance", "fines", "taxes", "parking", "wash", "tolls", "parts", "accessories", "other"), priceAmd (the amount).
Every kind may have a note.

Your answer has "changes": what to change in the log. The app shows each change as a card; nothing is saved until the user approves it. Each change has "op":
- "add": a new entry, with every value the user gave.
- "update": change an existing entry. "target" is its "ref" from the log below. Send the entry's full values with the corrections applied.
- "delete": remove an existing entry. "target" is its ref; "kind" is its kind; other values may be null.
Only use refs that appear in the log. When it is unclear which entry the user means, ask instead of guessing.

Your jobs:
1. When the user tells you something to log, add it, in the order it happened, with every value they gave. Leave anything they did not say as null or "". Never invent a value.
   Example: "I bought 15L for 9000 AMD, my fuel was 15km now shows 250km" -> changes: [{"op":"add","kind":"reading","rangeKm":15}, {"op":"add","kind":"refuel","liters":15,"priceAmd":9000,"rangeKm":250}].
   Example: "drove from home to work, 12.5 km, 230 left" -> [{"op":"add","kind":"trip","from":"home","to":"work","distanceKm":12.5,"rangeKm":230}].
   Example: "oil change today, 25000 AMD at 84500 km, next in 10000 km" -> [{"op":"add","kind":"service","category":"oil","priceAmd":25000,"odometerKm":84500,"remindKm":10000}].
2. Corrections to the log ("it was 30 L not 20", "change the station of my last refuel to Flash", "delete yesterday's reading"): an "update" or "delete" with the target ref.
3. Corrections to cards you proposed in this chat that are not saved yet ("that's the odometer", "it was 16 litres"): send the full corrected set of changes again. A past answer of yours marked "saved": true was approved and is in the log now; each change it added carries the "ref" of its entry. To correct one of those, send an "update" for that ref, never the add again.
4. Photos of the instrument cluster: the distance-to-empty estimate is rangeKm (may sit next to a fuel-pump icon); the resettable trip meter (Trip A / Trip B, NOT the total odometer) is distanceKm on a trip; the total odometer is odometerKm; the clock is "clock". Only range visible -> one "reading". Use null for anything not clearly visible; never guess.
5. Questions about the log: answer with "changes": []. For numbers use FACTS below; they are computed by the app and exact. Do not do the arithmetic yourself when a fact covers it. For a period FACTS do not cover, you may add up the log, and say the figure is approximate. Say plainly when the log does not have the answer.
6. "Anything odd?" / "check my log": explain FACTS.issues in plain words (the refs say which entries), and offer fixes as "update"/"delete" changes only when the fix is clear. "When should I refuel?": use FACTS.refuelForecast and currentRangeKm.

Time: "date" is YYYY-MM-DD, only when the user means a day other than today ("yesterday at 18:00" -> yesterday's date and "18:00"; "on 25 Oct" -> that date). Never a future date. "clock" is HH:MM in 24-hour time, only when the user or the photo gives a time; otherwise null. Work dates out from NOW below. "confidence" is how sure you are about values read from a photo (null when there is no photo).
"reply" is a short plain-text message. The app shows changes as cards for the user to check and approve, so do not repeat every number.`;

const nullable = (type: string, extra: object = {}) => ({ type, nullable: true, ...extra });

const KIND_LIST: EntryKind[] = ['trip', 'reading', 'refuel', 'service', 'expense'];
const CATEGORY_LIST = [...new Set<string>([...SERVICE_CATEGORIES, ...EXPENSE_CATEGORIES])];

/** Gemini's OpenAPI-style schema (upper-case types, `nullable`, no oneOf), as generateContent expects. */
export const REPLY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    changes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          op: { type: 'STRING', enum: ['add', 'update', 'delete'] },
          target: nullable('STRING', { description: 'ref of the entry, for update/delete' }),
          kind: { type: 'STRING', enum: KIND_LIST },
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
          category: nullable('STRING', { enum: CATEGORY_LIST }),
          odometerKm: nullable('NUMBER'),
          place: nullable('STRING'),
          remindKm: nullable('NUMBER'),
          remindMonths: nullable('NUMBER'),
          date: nullable('STRING', { description: 'YYYY-MM-DD, local' }),
          clock: nullable('STRING', { description: 'HH:MM, 24-hour' }),
          note: nullable('STRING'),
        },
        required: ['op', 'kind'],
      },
    },
    confidence: nullable('STRING', { enum: ['high', 'medium', 'low'] }),
  },
  required: ['reply', 'changes'],
};

/** Entry id → the short ref the model sees: "e1" for the oldest, then onward. */
export function logRefs(entries: Entry[]): Map<string, string> {
  const asc = [...entries].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Map(asc.map((e, i) => [e.id, `e${i + 1}`]));
}

/** The log, compact, for the model to read and point at. Local times, as the user lives them. */
export function logContext(entries: Entry[], refs: Map<string, string> = logRefs(entries)): string {
  const rows = [...entries]
    .sort((a, b) => a.at - b.at)
    .map((e) => {
      const { id, at: _at, ...rest } = e;
      const clean: Record<string, unknown> = {
        ref: refs.get(id),
        when: `${dayKey(e.at)} ${formatTime(e.at)}`,
        ...rest,
      };
      // A route is hundreds of points the model has no use for.
      if (e.kind === 'trip' && e.track) clean.track = `${e.track.length} GPS points`;
      if (e.kind === 'trip' && e.stops.length === 0) delete clean.stops;
      return clean;
    });
  return JSON.stringify(rows);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "2026-10-29 (Thursday) 14:05" — the model has no clock of its own. */
export function nowLine(now: number): string {
  return `${dayKey(now)} (${WEEKDAYS[new Date(now).getDay()]}) ${formatTime(now)}`;
}

/** Facts with entry ids swapped for the refs the model sees in the log. */
export function factsContext(facts: Facts, refs: Map<string, string>): string {
  const issues = facts.issues.map(({ ids, ...rest }) => ({
    ...rest,
    refs: ids.map((id) => refs.get(id)),
  }));
  return JSON.stringify({ ...facts, issues });
}

/** Everything one request tells the model about the log, plus the refs to read its answer with. */
export type ChatContext = {
  now: number;
  logJson: string;
  factsJson: string;
};

export function chatContext(
  entries: Entry[],
  now: number,
  typedConsumption?: string,
): ChatContext & { idToRef: Map<string, string>; refToId: Map<string, string> } {
  const idToRef = logRefs(entries);
  return {
    now,
    logJson: logContext(entries, idToRef),
    factsJson: factsContext(buildFacts(entries, now, typedConsumption), idToRef),
    idToRef,
    refToId: new Map([...idToRef].map(([id, ref]) => [ref, id])),
  };
}

/** The system instruction for one request. */
export function systemText(ctx: ChatContext): string {
  return [
    SYSTEM_PROMPT,
    `NOW (the user's local time): ${nowLine(ctx.now)}. Weeks start on Monday.`,
    `FACTS (computed by the app, exact; money AMD, distances km):\n${ctx.factsJson}`,
    `The user's log (JSON, oldest first; "ref" identifies an entry):\n${ctx.logJson}`,
  ].join('\n\n');
}

const GRADES = new Set<FuelGrade>(['92', '95', '98', 'diesel']);
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const num = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null;

const whole = (v: unknown, max: number): number | null => {
  const n = num(v, max);
  return n === null ? null : Math.round(n);
};

const text = (v: unknown): string => (typeof v === 'string' ? normalizePlace(v).slice(0, 80) : '');

export function parseClock(v: unknown): string | null {
  const m = typeof v === 'string' ? CLOCK.exec(v.trim()) : null;
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

/** A real calendar day as "YYYY-MM-DD", or null. Whether it is in the future is for Approve to say. */
export function parseDate(v: unknown): string | null {
  const m = typeof v === 'string' ? DATE.exec(v.trim()) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  const real = date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
  return real && y >= 2000 ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function category(kind: EntryKind, v: unknown): ProposalValues['category'] {
  if (kind === 'service' && isServiceCategory(v)) return v;
  if (kind === 'expense' && isExpenseCategory(v)) return v;
  return null;
}

export function emptyValues(kind: EntryKind): ProposalValues {
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
    category: null,
    odometerKm: null,
    place: '',
    remindKm: null,
    remindMonths: null,
    date: null,
    clock: null,
    note: '',
  };
}

export function emptyProposal(kind: EntryKind): Proposal {
  return { op: 'add', target: null, before: null, ...emptyValues(kind) };
}

const isKind = (v: unknown): v is EntryKind => KIND_LIST.includes(v as EntryKind);

/** An entry's values, checked one by one; an implausible one becomes empty. */
function parseValues(r: Record<string, unknown>, kind: EntryKind): ProposalValues {
  return {
    kind,
    rangeKm: num(r.rangeKm, MAX_RANGE_KM),
    distanceKm: num(r.distanceKm, MAX_TRIP_KM),
    liters: num(r.liters, MAX_LITERS),
    priceAmd: whole(r.priceAmd, MAX_PRICE_AMD),
    from: text(r.from),
    stops: Array.isArray(r.stops) ? r.stops.map(text).filter(Boolean) : [],
    to: text(r.to),
    station: text(r.station),
    address: text(r.address),
    grade: GRADES.has(r.grade as FuelGrade) ? (r.grade as FuelGrade) : null,
    category: category(kind, r.category),
    odometerKm: num(r.odometerKm, MAX_ODOMETER_KM),
    place: text(r.place),
    remindKm: whole(r.remindKm, MAX_REMIND_KM),
    remindMonths: whole(r.remindMonths, MAX_REMIND_MONTHS),
    date: parseDate(r.date),
    clock: parseClock(r.clock),
    note: typeof r.note === 'string' ? r.note.trim().slice(0, 200) : '',
  };
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;

/**
 * One proposed change, from the model or from disk; null when it cannot be
 * one. An item with no "op" is an add: that is all older chats ever stored.
 * A delete needs no values, so its kind may be missing until it is resolved.
 */
export function parseProposal(raw: unknown): Proposal | null {
  const r = asRecord(raw);
  if (!r) return null;
  const op: ChangeOp = r.op === 'update' || r.op === 'delete' ? r.op : 'add';
  const target =
    typeof r.target === 'string' && r.target.trim() && r.target.length <= 64
      ? r.target.trim()
      : null;
  if (op !== 'add' && !target) return null;
  if (!isKind(r.kind) && op !== 'delete') return null;
  const kind = isKind(r.kind) ? r.kind : 'reading';
  const b = asRecord(r.before);
  const before = op !== 'add' && b && isKind(b.kind) ? parseValues(b, b.kind) : null;
  return { op, target: op === 'add' ? null : target, before, ...parseValues(r, kind) };
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
  const o = asRecord(obj);
  if (!o) return undefined;
  const reply = typeof o.reply === 'string' ? o.reply.trim() : '';
  // "entries" is what the schema called it before edits and deletes existed.
  const list = Array.isArray(o.changes) ? o.changes : Array.isArray(o.entries) ? o.entries : [];
  const changes = list.map(parseProposal).filter((p): p is Proposal => p !== null);
  if (!reply && changes.length === 0) return undefined;
  const confidence =
    o.confidence === 'high' || o.confidence === 'medium' || o.confidence === 'low'
      ? o.confidence
      : null;
  return { reply, changes, confidence };
}

const opt = (n: number | undefined) => (n === undefined ? null : n);

/** A log entry as card values: what an update starts from and a delete shows. */
export function entryToValues(e: Entry): ProposalValues {
  const v: ProposalValues = {
    ...emptyValues(e.kind),
    rangeKm: opt(e.rangeKm),
    date: dayKey(e.at),
    clock: formatTime(e.at),
    note: e.note ?? '',
  };
  if (e.kind === 'trip') {
    return { ...v, from: e.from, stops: [...e.stops], to: e.to, distanceKm: opt(e.distanceKm) };
  }
  if (e.kind === 'refuel') {
    return {
      ...v,
      liters: e.liters,
      priceAmd: e.priceAmd,
      station: e.station ?? '',
      address: e.address ?? '',
      grade: e.grade ?? null,
      odometerKm: opt(e.odometerKm),
    };
  }
  if (e.kind === 'service') {
    return {
      ...v,
      category: e.category,
      priceAmd: e.costAmd,
      odometerKm: opt(e.odometerKm),
      place: e.place ?? '',
      remindKm: opt(e.remindKm),
      remindMonths: opt(e.remindMonths),
    };
  }
  if (e.kind === 'expense') return { ...v, category: e.category, priceAmd: e.amountAmd };
  return v;
}

const VALUE_KEYS = Object.keys(emptyValues('trip')) as (keyof ProposalValues)[];

const isBlank = (v: unknown) => v === null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * The model's changes, tied to the log as it is now. Refs become ids and an
 * unknown ref drops its change. A delete shows the entry exactly as it is.
 * An update keeps the entry's own value wherever the model left one blank —
 * models often send only what changed, and a blank must not quietly erase a
 * station — and keeps the entry's kind unless the form itself could switch
 * it (trip ↔ reading).
 */
export function resolveChanges(
  changes: Proposal[],
  entries: Entry[],
  refToId: Map<string, string>,
): Proposal[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out: Proposal[] = [];
  for (const p of changes) {
    if (p.op === 'add') {
      out.push({ ...p, target: null, before: null });
      continue;
    }
    const id = p.target === null ? undefined : refToId.get(p.target);
    const entry = id === undefined ? undefined : byId.get(id);
    if (!entry) continue;
    // Two changes to one entry would both be approved and the first silently
    // lost (or an edit applied to a deleted entry): the later one is meant.
    const twice = out.findIndex((q) => q.target === entry.id);
    if (twice !== -1) out.splice(twice, 1);
    const before = entryToValues(entry);
    if (p.op === 'delete') {
      out.push({ ...before, op: 'delete', target: entry.id, before });
      continue;
    }
    const merged = { ...before };
    for (const k of VALUE_KEYS) {
      if (k !== 'kind' && !isBlank(p[k])) (merged as Record<string, unknown>)[k] = p[k];
    }
    merged.kind = formKinds(entry.kind).includes(p.kind) ? p.kind : entry.kind;
    if (merged.kind !== entry.kind) merged.category = null;
    out.push({ ...merged, op: 'update', target: entry.id, before });
  }
  return out;
}

const same = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b) ? a.join('\u0000') === b.join('\u0000') : a === b;

/** The fields an update card changes, for marking them old → new. */
export function changedFields(p: Proposal): (keyof ProposalValues)[] {
  const before = p.before;
  if (p.op !== 'update' || !before) return [];
  return VALUE_KEYS.filter((k) => !same(p[k], before[k]));
}

/**
 * A card as the model sees it in the history: refs for this request (a
 * target that has gone since is null), blanks left out to keep it short.
 */
export function changeForModel(p: Proposal, idToRef: Map<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = { op: p.op };
  if (p.op !== 'add') out.target = (p.target && idToRef.get(p.target)) ?? null;
  for (const k of VALUE_KEYS) if (!isBlank(p[k])) out[k] = p[k];
  return out;
}

/**
 * A past model turn, re-sent as the JSON it answered with. Once approved it
 * says so, and each added card names the entry it became: otherwise "it was
 * 16 litres" after Approve reads like a correction to an unsaved card, and the
 * model re-sends the add — a second refuel — instead of updating the first.
 * `savedIds` runs in card order (see `applyChanges`).
 */
export function historyText(
  reply: string,
  proposals: Proposal[] | undefined,
  idToRef: Map<string, string>,
  savedIds?: string[],
): string {
  const changes = (proposals ?? []).map((p, i) => {
    const out = changeForModel(p, idToRef);
    const id = savedIds?.[i];
    if (p.op === 'add' && id !== undefined) out.ref = idToRef.get(id) ?? null;
    return out;
  });
  return JSON.stringify({ reply, changes, ...(savedIds ? { saved: true } : {}) });
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

/**
 * When one card says it happened. A date with a clock is exactly that
 * moment; a date alone keeps the current time of day, as the form's date
 * picker does; a clock alone follows `clockToAt`; neither is now. A future
 * result is returned as is: Approve refuses it, the card says why.
 */
export function proposalAt(p: Pick<ProposalValues, 'date' | 'clock'>, now: number): number {
  const date = parseDate(p.date);
  if (date) {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(now);
    at.setFullYear(y, m - 1, d);
    const clock = p.clock ? CLOCK.exec(p.clock) : null;
    if (clock) at.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    return at.getTime();
  }
  return p.clock ? (clockToAt(p.clock, now) ?? now) : now;
}

const MINUTE = 60_000;

/**
 * When each proposed entry happened (`proposalAt`), then — among the adds,
 * in the order given — made strictly increasing: a later add is never at or
 * before an earlier one. Earlier ones move back a minute at a time, so the
 * last keeps its own time (usually "now"). Updates and deletes keep theirs.
 */
export function proposalTimes(proposals: Proposal[], now: number): number[] {
  const times = proposals.map((p) => proposalAt(p, now));
  const adds = proposals.flatMap((p, i) => (p.op === 'add' ? [i] : []));
  for (let k = adds.length - 2; k >= 0; k--) {
    const [i, j] = [adds[k], adds[k + 1]];
    if (times[i] >= times[j]) times[i] = times[j] - MINUTE;
  }
  return times;
}

const str = (n: number | null) => (n === null ? '' : String(n));

/**
 * Card values → form draft. An update starts from the entry's own draft so
 * what a card cannot show (a trip's GPS track) rides along untouched.
 */
export function proposalToDraft(p: ProposalValues, at: number, base?: Draft): Draft {
  return {
    ...(base ?? emptyDraft(p.kind, at)),
    kind: p.kind,
    at,
    range: str(p.rangeKm),
    distance: str(p.distanceKm),
    liters: str(p.liters),
    price: str(p.priceAmd),
    from: p.from,
    stops: [...p.stops],
    to: p.to,
    station: p.station,
    address: p.address,
    grade: p.grade ?? undefined,
    category: p.category ?? undefined,
    odometer: str(p.odometerKm),
    place: p.place,
    remindKm: str(p.remindKm),
    remindMonths: str(p.remindMonths),
    note: p.note,
  };
}

/**
 * An update's values on top of the entry as it is now: only the fields the
 * card changes (against the `before` it was made from) are taken from it. A
 * card approved after the entry was edited elsewhere — in the log, or by an
 * earlier card — must not quietly put back the values it was made from.
 */
function rebased(p: Proposal, entry: Entry): ProposalValues {
  const out: ProposalValues = entryToValues(entry);
  if (!p.before) return p;
  for (const k of changedFields(p)) (out as Record<string, unknown>)[k] = p[k];
  return out;
}

export type Applied = {
  ok: true;
  added: Entry[];
  updated: Entry[];
  removed: string[];
  /** Every entry id the approval touched, in card order: what the message records as saved. */
  ids: string[];
};

/**
 * Approve: every card through the form's own validation. All or nothing —
 * a half-saved refuel-with-reading would make the log wrong — so any problem
 * is reported per card and nothing is saved. An update or delete whose entry
 * has gone since (deleted in the log meanwhile) is a problem too, never a
 * silent re-add.
 */
export function applyChanges(
  proposals: Proposal[],
  entries: Entry[],
  now: number,
  newId: () => string,
): Applied | { ok: false; problems: (string | undefined)[] } {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const times = proposalTimes(proposals, now);
  const out: Applied = { ok: true, added: [], updated: [], removed: [], ids: [] };
  const problems = proposals.map((p, i): string | undefined => {
    const entry = p.target === null ? undefined : byId.get(p.target);
    if (p.op !== 'add' && !entry) return t('insights.card.gone');
    if (p.op === 'delete' && entry) {
      out.removed.push(entry.id);
      out.ids.push(entry.id);
      return undefined;
    }
    const v = entry ? rebased(p, entry) : p;
    // An update whose day and clock were left alone keeps its exact time (seconds and all).
    const untouched = entry && v.date === dayKey(entry.at) && v.clock === formatTime(entry.at);
    const at = untouched ? entry.at : entry ? proposalAt(v, now) : times[i];
    if (!untouched && proposalAt(v, now) > now) return t('insights.card.future');
    const r = entry
      ? validateDraft(proposalToDraft(v, at, draftFromEntry(entry)), entry.id)
      : validateDraft(proposalToDraft(v, at), newId());
    if (!r.ok) return saveHint(r.errors, v.kind);
    (entry ? out.updated : out.added).push(r.entry);
    out.ids.push(r.entry.id);
    return undefined;
  });
  return problems.some((p) => p !== undefined) ? { ok: false, problems } : out;
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
  const r = asRecord(raw);
  if (!r) return [];
  const trip = num(r.tripKm, MAX_TRIP_KM);
  const p = emptyProposal(trip !== null ? 'trip' : 'reading');
  p.rangeKm = num(r.rangeKm, MAX_RANGE_KM);
  p.distanceKm = trip;
  p.clock = parseClock(r.clock);
  return p.rangeKm === null && p.distanceKm === null && p.clock === null ? [] : [p];
}
