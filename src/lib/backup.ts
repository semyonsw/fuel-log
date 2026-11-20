/**
 * The backup file: everything the user put into the app, as one JSON file.
 *
 * ── WHAT IS IN IT ────────────────────────────────────────────────────────
 *
 * Entries, AI chats (text only — photos are never kept), the typed
 * consumption, the chosen model, and the Gemini API key. The key is in plain
 * text because the user asked for a backup that restores a fresh install
 * completely; whoever has the file can use the key. Files written by 1.7.x
 * also carry budgets; this build reads past them.
 *
 * ── ONE FILE, ALWAYS THE NEWEST ──────────────────────────────────────────
 *
 * Auto-backup writes `fuel-log-backup-YYYY-MM-DD_HH-mm-ss.json` after every
 * change and then deletes the older backup files in the folder, so the folder
 * holds exactly one current backup with its time in the name. Only files
 * matching that pattern are ever deleted — anything else the user keeps in
 * the folder is left alone.
 *
 * ── IMPORT CHECKS BEFORE IT TOUCHES ANYTHING ─────────────────────────────
 *
 * A picked file can be anything. It is parsed and sanitised in full first;
 * only a file that is recognisably a Fuel Log backup gets as far as the
 * Merge / Replace question.
 *
 * ── WHAT A FILE DOES NOT CARRY, IMPORT DOES NOT TOUCH ────────────────────
 *
 * A 2.0.0 file has no chats and no model. Reading those as "no chats" and
 * "no model" would make Replace wipe the phone's chats and model, so a field
 * the file lacks stays `undefined` in the parsed backup and the import leaves
 * that part of the phone alone, in either mode.
 */

import { t } from '../i18n';
import type { Entry } from '../types';
import { sanitizeChats, type Chat } from './chat';
import { sanitizeEntries } from './sanitize';

export const BACKUP_APP = 'fuel-log';
export const BACKUP_FORMAT = 1;

export type BackupSettings = {
  consumption: string;
  geminiModel: string;
};

export type Backup = {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: string;
  appVersion: string;
  entries: Entry[];
  chats: Chat[];
  settings: BackupSettings;
  geminiApiKey: string;
};

export function buildBackup(input: {
  entries: Entry[];
  chats: Chat[];
  settings: BackupSettings;
  apiKey: string;
  appVersion: string;
  now: number;
}): Backup {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: new Date(input.now).toISOString(),
    appVersion: input.appVersion,
    entries: input.entries,
    chats: input.chats,
    settings: input.settings,
    geminiApiKey: input.apiKey,
  };
}

/** Two-space indented, so the file is readable in any text viewer. */
export function serializeBackup(b: Backup): string {
  return `${JSON.stringify(b, null, 2)}\n`;
}

/** A backup as read from a file: fields older files lack are `undefined`, not empty. */
export type ImportedBackup = Omit<Backup, 'chats' | 'settings'> & {
  chats?: Chat[];
  settings: Partial<BackupSettings>;
};

export type ParsedBackup = { ok: true; backup: ImportedBackup } | { ok: false; error: string };

const optionalString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: t('summary.backup.notJson') };
  }
  const o = raw as Partial<Backup> | null;
  if (typeof o !== 'object' || o === null || o.app !== BACKUP_APP || !Array.isArray(o.entries)) {
    return { ok: false, error: t('summary.backup.notBackup') };
  }
  if (typeof o.format !== 'number' || o.format > BACKUP_FORMAT) {
    return { ok: false, error: t('summary.backup.newer') };
  }
  const s = (o.settings ?? {}) as Record<string, unknown>;
  const consumption = optionalString(s.consumption);
  const geminiModel = optionalString(s.geminiModel);
  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      format: o.format,
      exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
      appVersion: typeof o.appVersion === 'string' ? o.appVersion : '',
      entries: sanitizeEntries(o.entries),
      ...(Array.isArray(o.chats) ? { chats: sanitizeChats(o.chats) } : {}),
      settings: {
        ...(consumption === undefined ? {} : { consumption }),
        ...(geminiModel === undefined ? {} : { geminiModel }),
      },
      geminiApiKey: typeof o.geminiApiKey === 'string' ? o.geminiApiKey : '',
    },
  };
}

/**
 * The settings after an import. The file fills in what this phone does not
 * have; in Replace mode the file wins outright. A setting the file does not
 * carry at all keeps the phone's value in both modes.
 */
export function importedSettings(
  phone: BackupSettings,
  file: Partial<BackupSettings>,
  mode: 'merge' | 'replace',
): BackupSettings {
  const pick = (mine: string, theirs: string | undefined) =>
    theirs === undefined ? mine : mode === 'replace' || !mine ? theirs : mine;
  return {
    consumption: pick(phone.consumption, file.consumption),
    geminiModel: pick(phone.geminiModel, file.geminiModel),
  };
}

/**
 * Merge by id: for ids on both sides `choose` picks the copy to keep (the
 * file's by default), ids only on the phone are kept, nothing is deleted.
 * Counts are for the confirmation line.
 */
export function mergeById<T extends { id: string }>(
  current: T[],
  incoming: T[],
  choose: (mine: T, theirs: T) => T = (_mine, theirs) => theirs,
): { items: T[]; added: number; updated: number } {
  const byId = new Map(current.map((x) => [x.id, x]));
  let added = 0;
  let updated = 0;
  for (const x of incoming) {
    const mine = byId.get(x.id);
    if (mine === undefined) {
      added += 1;
      byId.set(x.id, x);
      continue;
    }
    const kept = choose(mine, x);
    if (JSON.stringify(kept) !== JSON.stringify(mine)) updated += 1;
    byId.set(x.id, kept);
  }
  return { items: [...byId.values()], added, updated };
}

/**
 * Chats merge by recency, not by "the file wins": a chat continued on the
 * phone after the backup was made must not be rolled back to the older copy
 * (losing messages and `savedIds`, which would let the same change be
 * approved twice). On a tie the phone's copy stays, because approving cards
 * records `savedIds` without moving `updatedAt`, so the phone may be ahead.
 */
export function mergeChats(
  current: Chat[],
  incoming: Chat[],
): { items: Chat[]; added: number; updated: number } {
  return mergeById(current, incoming, (mine, theirs) =>
    theirs.updatedAt > mine.updatedAt ? theirs : mine,
  );
}

/**
 * Whether the older backup files may be deleted after a write. Not when the
 * keystore could not be read and no key has been set since: the file just
 * written then carries a blank key, and the older files may hold the only
 * other copy of it. Keeping them is the simplest safe answer — they are
 * pruned again by the first backup after the key is readable or re-entered.
 */
export function canPruneBackups(apiKey: string, keyReadFailed: boolean): boolean {
  return !keyReadFailed || apiKey !== '';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `fuel-log-backup-2026-10-16_19-05-00.json`, local time; sorts by name = sorts by time. */
export function backupFileName(now: number): string {
  const d = new Date(now);
  return (
    `fuel-log-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.json`
  );
}

const BACKUP_NAME = /^fuel-log-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(\s*\(\d+\))?\.json$/;

/**
 * Whether a file in the folder is one of ours. SAF lists content URIs whose
 * last segment is the URL-encoded document id ("primary%3AFuelLog%2Ffuel-log…"),
 * so the name is taken after the last "/" once decoded.
 */
export function isBackupFile(uriOrName: string): boolean {
  let s = uriOrName;
  try {
    s = decodeURIComponent(uriOrName);
  } catch {
    // keep the raw string
  }
  const last = s.slice(s.lastIndexOf('/') + 1);
  return BACKUP_NAME.test(last.slice(last.lastIndexOf(':') + 1));
}

/** The backup files to delete once `keepUri` has been written. */
export function staleBackups(listed: string[], keepUri: string): string[] {
  return listed.filter((u) => u !== keepUri && isBackupFile(u));
}

/** "content://…/tree/primary%3ADocuments%2FFuelLog" → "Documents/FuelLog" for the Summary card. */
export function folderLabel(treeUri: string): string {
  const m = /\/tree\/([^/]+)/.exec(treeUri);
  if (!m) return treeUri;
  let id = m[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    // keep encoded
  }
  const path = id.slice(id.indexOf(':') + 1);
  return path || t('summary.backup.internal');
}
