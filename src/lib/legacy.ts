/**
 * The one-off safety copy of a 1.7.x install, taken before 2.0 forgets it.
 *
 * 2.0 dropped services, expenses, AI chats, budgets and the refuel station /
 * address / grade / odometer (2.1 brought the AI chats back, but a 2.0 that
 * already ran had deleted them). The stores clean those out of AsyncStorage on
 * their first write, and auto-backup then deletes the older backup files, so
 * without this the only copies would be gone within seconds of the update.
 * The user chose to keep one copy: the raw blobs are set aside before the
 * stores first read (`state/legacyStorage`) and written to the backup folder
 * as `fuel-log-pre-2.0.json` (`services/backup`).
 *
 * The copy is a 1.7.x-format backup built from the blobs exactly as stored,
 * so the 1.7.0 APK can import it in full on a rollback, and this build can
 * import it too (it reads past what it no longer has). Its name does not match
 * the auto-backup pattern, so auto-backup never deletes it.
 */

export const LEGACY_FILE_NAME = 'fuel-log-pre-2.0.json';

/** The three 1.7.x AsyncStorage blobs, as raw strings (null = absent). */
export type LegacyBlobs = { log: string | null; settings: string | null; chats: string | null };

type Row = Record<string, unknown>;

/** The `state` of a zustand persist blob, or {} for anything unreadable. */
function persistedState(blob: string | null): Row {
  if (!blob) return {};
  try {
    const o = JSON.parse(blob) as { state?: unknown };
    return typeof o?.state === 'object' && o.state !== null ? (o.state as Row) : {};
  } catch {
    return {};
  }
}

const RETIRED_KINDS = new Set(['service', 'expense']);
const RETIRED_REFUEL_KEYS = ['station', 'address', 'grade', 'odometerKm'];

/**
 * Whether the blobs hold anything this build drops; a fresh or 2.x install
 * holds nothing. Chats do not count: the chats store reads them again, and a
 * fresh install that later chats must not get a bogus pre-2.0 copy. A copy
 * taken for another reason still carries them (`legacyBackup`).
 */
export function hasLegacyData(b: LegacyBlobs): boolean {
  const entries = persistedState(b.log).entries;
  const rows = Array.isArray(entries) ? (entries as Row[]) : [];
  const droppedRow = rows.some(
    (r) =>
      typeof r === 'object' &&
      r !== null &&
      (RETIRED_KINDS.has(r.kind as string) ||
        (r.kind === 'refuel' && RETIRED_REFUEL_KEYS.some((k) => k in r))),
  );
  const s = persistedState(b.settings);
  return droppedRow || !!s.fuelBudget || !!s.expenseBudget;
}

/** The 1.7.x backup file for these blobs (the API key lived in the keystore and is not in it). */
export function legacyBackup(b: LegacyBlobs, now: number): string {
  const log = persistedState(b.log);
  const s = persistedState(b.settings);
  const chats = persistedState(b.chats).chats;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  const backup = {
    app: 'fuel-log',
    format: 1,
    exportedAt: new Date(now).toISOString(),
    appVersion: '1.7.0',
    entries: Array.isArray(log.entries) ? log.entries : [],
    chats: Array.isArray(chats) ? chats : [],
    settings: {
      consumption: text(s.consumption),
      geminiModel: text(s.geminiModel),
      fuelBudget: text(s.fuelBudget),
      expenseBudget: text(s.expenseBudget),
    },
    geminiApiKey: '',
  };
  return `${JSON.stringify(backup, null, 2)}\n`;
}
